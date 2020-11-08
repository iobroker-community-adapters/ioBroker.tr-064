/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const CALLMONITOR_NAME = 'callmonitor';
const enableConnect1012 = '--- To use the callmonitor, enable connects to port 1012 on FritzBox by dialing #96*5* with a directly connected phone (line/dect) and restart this adapter';

function checkPatchForECONNREFUSED(adapter) {
    if (process || process.version) {
        const ar = process.version.split('.');
        if (ar[0].indexOf('v') === 0) {
            ar[0] = ar[0].substr(1);
        }
        let version = 0;
        for (let i = 0; i < ar.length; i++) {
            version *= 1000;
            version += ~~ar[i];
        }
        if (version >= 6000000) {
            return;
        }
    }

    const util = require('util');
    const old_errnoException = util._errnoException;
    util._errnoException = function (err, syscall, original) {
        if (typeof original === 'string' && original.indexOf(':1012') >= 0) {
            adapter.log.error('--- ECONNREFUSED ' + original);
            adapter.log.error(enableConnect1012);
        }
        return old_errnoException(err, syscall, original);
    };
}

const pauseStates = {
    inbound:  'ring',
    lastCall: 'end',
    connect:  'connect'
};

function CallMonitor(adapter, devices, phonebook) {
    if (!adapter.config.useCallMonitor) {
        return;
    }
    adapter.log.debug('starting callmonitor');
    checkPatchForECONNREFUSED(adapter);

    const net = require('net');
    const connections = {};
    let timeout;
    let lastCaller;
    let lastCallee;
    let client;

    devices.root.createNew(CALLMONITOR_NAME + '.toPauseState', {val: '', common: {name: 'On call states', desc: 'State to pause players. values are: ring, connect, end'}});

    const self = this;
    function init() {
        client = new net.Socket();

        client.on('connect', () =>
            adapter.log.debug('callmonitor connected'));

        client.on('error', err => {
            if (err.errno === 'ECONNREFUSED') {
                adapter.log.error(enableConnect1012);
                self.close();
            }
        });

        client.on('close', _hadError => {
            timeout && clearTimeout(timeout);
            timeout = setTimeout(() => {
                timeout = null;
                init();
            }, adapter.config.reconnectInterval || 5000);
        });

        client.on('data', data => {
            const raw = data.toString();
            adapter.log.debug('Callmonitor Raw: ' + raw);
            const array = raw.split(';');
            const type = array[1];
            const id = array[2];
            const timestamp = array[0];
            let message;
            //var dev = new devices.CDevice(0, '');
            //dev.setDevice(CALLMONITOR_NAME, {common: {name: CALLMONITOR_NAME, role: 'channel'}, native: {} });
            const dev = new devices.CDevice(CALLMONITOR_NAME, '');
            dev.force = true;
            let timer = null;

            function set(name) {
                //const dev = new devices.CDevice(CALLMONITOR_NAME, '');
                //dev.force = true;
                timer && clearTimeout(timer);
                timer = null;

                adapter.log.debug('New Call data ' + name + ': ' + JSON.stringify(message));
                dev.setChannel('', '');
                dev.set('ringing', name === 'inbound');

                // var pause = pauseStates[name];
                // if (pause !== undefined) {
                //     dev.set('toPauseState', pause);
                // }

                dev.setChannel(name, name);
                for (const i of Object.keys(message)) {
                    if (i[0] !== '_') {
                        dev.set(i, message[i]);
                    }
                }
                dev.set('timestamp', timestamp);
                message._type = name;
                if (adapter.config.usePhonebook && phonebook) {
                    if (lastCaller !== message.caller) {
                        lastCaller = message.caller;
                    }
                    if (!message.callerName && message.caller) {
                        const pbe = phonebook.byNumber(message.caller);
                        if (pbe) {
                            message.callerName = pbe.name;
                            if (pbe.imageurl) {
                                message.imageurlcaller = pbe.imageurl;
                            }
                        } else {
                            message.callerName = '';
                        }
                    }
                    dev.set('callerName', message.callerName || '');

                    if (lastCallee !== message.callee) {
                        lastCallee = message.callee;
                    }

                    if (!message.calleeName && message.callee) {
                        const pbee = phonebook.byNumber(message.callee);
                        if (pbee) {
                            message.calleeName = pbee.name;
                            if (pbee.imageurl) {
                                message.imageurlcallee = pbee.imageurl;
                            }
                        } else {
                            message.calleeName = '';
                        }
                    }
                    dev.set('calleeName', message.calleeName || '');
                }

                dev.set('json', JSON.stringify(message));

                dev.setChannel('', '');
                const pause = pauseStates[name];
                if (pause !== undefined) {
                    dev.set('toPauseState', pause);
                    message.extension && dev.set('toPauseState-' + message.extension, pause);
                }

                // soef.getHttpData(message.imageurlcaller, function (err, body, res) {
                //     res = res;
                // })
                adapter.log.debug('callMonitor.set: type=' + name + ' caller=' + message.caller + ' callee=' + message.callee + (message.callerName ? ' callerName=' + message.callerName : '') + (message.calleeName ? ' calleeName=' + message.calleeName : ''));
                timer = setTimeout(() => {
                    dev.update();
                    devices.update();
                }, 500);
            }

            switch (type) {
                case 'CALL':
                    message = {caller: array[4], callee: array[5], extension: array[3], timestamp, id};
                    connections[id] = message;
                    set('outbound');
                    break;

                case 'RING':
                    message = {caller: array[3], callee: array[4], timestamp, id};
                    connections[id] = message;
                    set('inbound');
                    break;

                case 'CONNECT':
                    message = connections[id];
                    if (!message) {
                        break;
                    }
                    message.extension = array[3];
                    set('connect');
                    break;

                case 'DISCONNECT':
                    message = connections[id];
                    if (!message) {
                        break;
                    }
                    switch (message._type) {
                        case 'inbound':
                            message.type = 'missed';
                            break;
                        case 'connect':
                            message.type = 'disconnect';
                            break;
                        case 'outbound':
                            message.type = 'unreached';
                            break;
                    }
                    message.duration = array[3] >> 0;
                    //set('disconnect');
                    set('lastCall');
                    delete connections[id];
                    break;
            }
        });

        client.connect({
            host: adapter.config.ip || adapter.config.iporhost,
            port: 1012
        })
            .on('error', error =>
                adapter.log.error('Cannot start ' + CALLMONITOR_NAME + ': ' + error));
    }

    this.close = function () {
        if (client) {
            try {
                client.removeAllListeners();
                client.destroy();
            } catch {
                // ignore
            }
            client = null;
        }
        timeout && clearTimeout(timeout);
        timeout = null;
    };

    init();

    return this;
}

module.exports = CallMonitor;
