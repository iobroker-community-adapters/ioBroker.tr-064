/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const CALLMONITOR_NAME = 'callmonitor';
var enableConnect1012 = '--- To use the callmonitor, enable connects to port 1012 on FritsBox by dialing #96*5* and restart this adapter';


function checkPatchForECONNREFUSED(adapter) {
    if (process || process.version) {
        var ar = process.version.split('.');
        if (ar[0].indexOf('v') === 0) ar[0] = ar[0].substr(1);
        var version = 0;
        for (var i=0; i<ar.length; i++) {
            version *= 1000;
            version += ~~ar[i];
        }
        if (version >= 6000000) return;
    }
    
    var util = require('util');
    var old_errnoException = util._errnoException;
    util._errnoException = function (err, syscall, original) {
        if (typeof original === 'string' && original.indexOf(':1012') >= 0) {
            adapter.log.error('--- ECONNREFUSED ' + original);
            adapter.log.error(enableConnect1012);
        }
        return old_errnoException(err, syscall, original);
    };
}


module.exports = function (adapter, devices, phonebook) {
    if (!adapter.config.useCallMonitor) return;
    adapter.log.debug('starting callmonitor');
    checkPatchForECONNREFUSED(adapter);
    
    var net = require('net');
    var connections = {};
    var timeout;

    var client = new net.Socket();
    client.on('connect', function () {
        adapter.log.debug('callmonitor connected')  ;
    });
    
    client.on('error', function(err) {
        if (err.errno === 'ECONNREFUSED') {
            adapter.log.error(enableConnect1012);
            //client.removeAllListeners('close');
            client.removeAllListeners();
            client.destroy();
        }
    });
    
    function connect() {
        client.connect({
            host: adapter.config.ip,
            port: 1012
        }).on('error', function (error) {
            adapter.log.error('Cannot start ' + CALLMONITOR_NAME + ': ' + error);
        });
    }
    
    client.on('close', function (hadError) {
        if (hadError) {
        } else {
        }
        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(function () {
            connect();
            // client.connect({
            //     host: adapter.config.ip,
            //     port: 1012
            // }).on('error', function (error) {
            //     adapter.log.error('Cannot reconnect ' + CALLMONITOR_NAME + ': ' + error);
            // });
        }, 5000);
    });
    
    client.on('data', function (data) {
        var raw = data.toString();
        var array = raw.split(';');
        var type = array[1];
        var id = array[2];
        var timestamp = array[0];
        var message;
        //var dev = new devices.CDevice(0, '');
        //dev.setDevice(CALLMONITOR_NAME, {common: {name: CALLMONITOR_NAME, role: 'channel'}, native: {} });
        var dev = new devices.CDevice(CALLMONITOR_NAME, '');
        var timer = null;

        function set(name) {
            if (timer) clearTimeout(timer);
            dev.set('.callmonitor.ringing', name === 'inbound');
            dev.setChannel(name, name);
            for (var i in message) {
                if (i[0] !== '_') dev.set(i, message[i]);
            }
            dev.set('timestamp', timestamp);
            message._type = name;
            if (adapter.config.usePhonebook && phonebook) {
                if (message.callerName === undefined && message.caller) {
                    message.callerName = phonebook.findNumber(message.caller);
                }
                dev.set('callerName', message.callerName);
            }
            dev.set('json', JSON.stringify(message));
            adapter.log.debug('callMonitor.set: type=' + name + ' caller=' + message.caller + ' callee=' + message.callee + (message.callerName ? ' callerName=' + message.callerName : ''));
            timer = setTimeout(function() {
                devices.update();
            }, 500);
        }

        switch (type) {
            case 'CALL':
                message = { caller: array[4], callee: array[5], extension: array[3] };
                connections[id] = message;
                set('outbound');
                break;
            case 'RING':
                message = { caller: array[3], callee: array[4] };
                connections[id] = message;
                set('inbound');
                dev.set('.callmonitor.ringing', true);
                break;
            case 'CONNECT':
                message = connections[id];
                if (!message) break;
                message.extension = array[3];
                set('connect');
                break;
            case 'DISCONNECT':
                message = connections[id];
                if (!message) break;
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
    // client.connect({host: adapter.config.ip, port: 1012}).on('error', function (error) {
    //     adapter.log.error('Cannot start ' + CALLMONITOR_NAME + ': ' + error);
    // });
    connect();
};


