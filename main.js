/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */

'use strict';
const utils       = require('@iobroker/adapter-core'); // Get common adapter utils
const tools       = require(`${utils.controllerDir}/lib/tools`);
const adapterName = require('./package.json').name.split('.').pop();
const phonebook   = require('./lib/phonebook');
const CallMonitor = require('./lib/callmonitor');
const callList    = require('./lib/calllist');
const Deflections = require('./lib/deflections');
const Devices     = require('./lib/devices');
const tr064Lib    = require('tr-O64');

let tr064Client;
let deflections;
const commandDesc = 'eg. { "service": "urn:dslforum-org:service:WLANConfiguration:1", "action": "X_AVM-DE_SetWPSConfig", "params": { "NewX_AVM-DE_WPSMode": "pbc", "NewX_AVM-DE_WPSClientPIN": "" } }';
let callbackTimers = {};
let pollingTimer = null;
let ringTimeout = null;
let initError = false;
let adapter;
let devices;
let callMonitor;

// extract from object the attribute by path like "attr1.attr2.subAttr3"
function getProp(obj, propString) {
    if (!obj) {
        return undefined;
    }

    const ar = propString.split('.');
    const len = ar.length;

    for (let i = 0; i < len; i++) {
        obj = obj[ar[i]];
        if (obj === undefined) {
            return undefined;
        }
    }

    return obj;
}

function hasProp(obj, propString) {
    if (!obj) {
        return false;
    }
    const ar = propString.split('.');
    const len = ar.length;
    for (let i = 0; i < len; i++) {
        obj = obj[ar[i]];
        if (obj === undefined) {
            return false;
        }
    }

    return true;
}

function callbackOrTimeout(timeout, callback) {
    if (typeof timeout === 'function') {
        const cb = timeout;
        timeout = callback;
        callback = cb;
    }

    const id = Date.now() + '_' + Math.round(Math.random() * 10000);

    callbackTimers[id] = setTimeout(() => {
        callback('timeout', null);
        callback = null;
        delete callbackTimers[id];
    }, timeout);

    return function(err, data) {
        if (callbackTimers[id]) {
            clearTimeout(callbackTimers[id]);
            delete callbackTimers[id];
        }

        return callback && callback(err, data);
    };
}

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {name: adapterName});
    adapter = new utils.Adapter(options);

    adapter.on('message', obj => obj && onMessage(obj));
    adapter.on('stateChange', (id, state) => {
        if (state && id.startsWith(adapter.namespace + '.')) {
            if (initError) {
                adapter.log.error('tr-064 adapter not connected to a FritzBox. Terminating');
                return adapter.terminate ? adapter.terminate('tr-064 adapter not connected to a FritzBox. Terminating', 1) : setTimeout(() => process.exit(1), 2000);
            }

            adapter.log.debug('State changed: ' + id + ' = ' + JSON.stringify(state));

            if (!state.ack) {
                onStateChange(id, state);
            } else if (adapter.config.calllists.use && id.includes('callmonitor.lastCall.timestamp')) {
                tr064Client.refreshCalllist();
            }
        }
    });
    adapter.on('ready', () => {
        devices = new Devices(adapter);
        adapter.getForeignObject('system.config', (err, systemConfig) => {
            if (adapter.config.password && (!adapter.supportsFeature || !adapter.supportsFeature('ADAPTER_AUTO_DECRYPT_NATIVE'))) {
                adapter.config.password = tools.decrypt((systemConfig && systemConfig.native && systemConfig.native.secret) || 'Zgfr56gFe87jJOM', adapter.config.password);
            }
            // eslint-disable-next-line no-control-regex
            if (/[\x00-\x08\x0E-\x1F\x80-\xFF]/.test(adapter.config.password)) {
                adapter.log.error('Password error: Please re-enter the password in Admin. Stopping');
                return;
            }
            main(adapter);
        });
    });
    adapter.on('unload', callback => {
        try {
            pollingTimer && clearTimeout(pollingTimer);
            pollingTimer = null;
            ringTimeout && clearTimeout(ringTimeout);
            ringTimeout = null;
            Object.keys(callbackTimers).forEach(id => clearTimeout(callbackTimers[id]));
            callbackTimers = {};
            callMonitor && typeof callMonitor.close === 'function' && callMonitor.close();
            callMonitor = null;
            callback && callback();
        } catch (err) {
            callback && callback();
        }
    });

    return adapter;
}

const CHANNEL_STATES = 'states';
const CHANNEL_DEVICES = 'devices';
const CHANNEL_PHONEBOOK = 'phonebook';
const CHANNEL_CALLLISTS = 'calllists';
const CHANNEL_CALLMONITOR = 'callmonitor';

let devStates;
const allDevices = [];
const ipActive = {};

const states = {
    wps: {name: 'wps', val: false, common: {}, native: {func: 'setWPSMode'}},
    wlan: {name: 'wlan', val: false, common: {desc: 'All WLANs'}, native: {func: 'setWLAN'}},
    wlan24: {name: 'wlan24', val: true, common: {desc: '2.4 GHz WLAN'}, native: {func: 'setWLAN24'}},
    wlan50: {name: 'wlan50', val: true, common: {desc: '5.0 GHz WLAN'}, native: {func: 'setWLAN50'}},
    wlanGuest: {name: 'wlanGuest', val: true, common: {desc: 'Guest WLAN'}, native: {func: 'setWLANGuest'}},
    wlan24Password: {
        name: 'wlan24Password',
        val: '',
        common: {desc: 'Passphrase for 2.4 GHz WLAN'},
        native: {func: 'setWLAN24Password'}
    },
    wlan50Password: {
        name: 'wlan50Password',
        val: '',
        common: {desc: 'Passphrase for 5.0 GHz WLAN'},
        native: {func: 'setWLAN50Password'}
    },
    wlanGuestPassword: {
        name: 'wlanGuestPassword',
        val: '',
        common: {desc: 'Passphrase for Guest WLAN'},
        native: {func: 'setWLANGuestPassword'}
    },
    abIndex: {name: 'abIndex', val: 0, common: {}, native: {func: 'setABIndex'}},
    ab: {name: 'ab', val: false, common: {desc: 'parameter: index, state'}, native: {func: 'setAB'}},
    ring: {
        name: 'ring',
        val: '**610',
        common: {desc: 'let a phone ring. Parameter is phonenumer [,duration]. eg. **610'},
        native: {func: 'ring'}
    },
    reconnectInternet: {name: 'reconnectInternet', val: false, common: {role: 'button', read: false, write: true}, native: {func: 'reconnectInternet'}},
    command: {name: 'command', val: '', native: {func: 'command', desc: commandDesc}},
    commandResult: {name: 'commandResult', val: '', common: {write: false}},
    externalIP: {name: 'externalIP', val: '', common: {write: false}},
    externalIPv6: {name: 'externalIPv6', val: '', common: {write: false}},
    externalIPv6Prefix: {name: 'externalIPv6Prefix', val: '', common: {write: false}},
    reboot: {name: 'reboot', val: false, common: {role: 'button', read: false, write: true}, native: {func: 'reboot'}}
};
const pbStates = {
    pbNumber:          {name: 'number', val: '', common: {name: 'Number'}},
    pbName:            {name: 'name', val: '', common: {name: 'Name'}},
    pbImageUrl:        {name: 'image', val: '', common: {name: 'Image URL'}}
//    ringing:           { name: 'ringing', val: false, common: { name: 'Ringing'} }
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

String.prototype.normalizeNumber = function () {
    return this.replace (/\+/g, '00').replace(/[^0-9*]/g, '');
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createObjects(cb) {
    //devStates = new devices.CDevice(0, '');
    devStates.setDevice(CHANNEL_CALLLISTS, {common: {name: 'Call lists', role: 'device'}, native: {}});

    adapter.config.calllists.use && devices.root.createNew(callList.S_HTML_TEMPLATE, getProp(systemData, 'native.callLists.htmlTemplate') || '');

    devStates.setDevice(CHANNEL_DEVICES, {common: {name: 'Devices', role: 'device'}, native: {}});

    devStates.setDevice(CHANNEL_CALLMONITOR, {common: {name: 'Call monitor', role: 'device'}, native: {}});

    devStates.setDevice(CHANNEL_PHONEBOOK, {common: {name: 'Phone book', role: 'device'}, native: {}});

    for (const i in pbStates) {
        const st = Object.assign({}, pbStates[i]);
        devStates.createNew(st.name, st);
    }

    devStates.setDevice(CHANNEL_STATES, {common: {name: 'States and commands', role: 'device'}, native: {}});

    for (const i in states) {
        if (i.startsWith('wlan50') && !tr064Client.wlan50 && tr064Client.wlanGuest) {
            continue;
        }
        const st = Object.assign({}, states[i]);
        devStates.createNew(st.name, st);
    }
    devices.update(cb);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onMessage(obj) {
    let onlyActive;
    let reread;

    switch (obj.command) {
        case 'discovery':
            if (typeof obj.message === 'object') {
                onlyActive = obj.message.onlyActive;
                reread = obj.message.reread;
            }
            if (!obj.callback) {
                return false;
            }
            if (!reread && allDevices.length > 0 && allDevices.onlyActive === onlyActive) {
                adapter.sendTo(obj.from, obj.command, JSON.stringify(allDevices), obj.callback);
                return true;
            }
            allDevices.onlyActive = onlyActive;

            tr064Client.forEachHostEntry((err, device, cnt, all) => {
                const active = !!(~~device.NewActive);

                if (!onlyActive || active) {
                    allDevices.push ({
                        name: device.NewHostName,
                        ip: device.NewIPAddress,
                        mac: device.NewMACAddress,
                        active: active
                    });
                }
                if (cnt + 1 >= all) {
                    adapter.sendTo(obj.from, obj.command, JSON.stringify(allDevices), obj.callback);
                }
            });
            return true;

        default:
            adapter.log.warn('Unknown command: ' + obj.command);
            break;
    }

    obj.callback && adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);

    return true;
}

function onStateChange(id, state) {
    if (!state) {
        return;
    }
    const as = id.split('.');

    if (as.length < 3) {
        return;
    }

    const cmd = as [3];
    let func;
    switch(as[2]) {
        case CHANNEL_STATES:
            func = states[cmd] && states[cmd].native ? states[cmd].native.func : null;
            if (func && tr064Client[func] && state.val !== null && state.val !== undefined) {
                const ret = tr064Client[func](state.val, () => {});
                if (ret === true) {
                    devices.root.clear(id);
                }
            }
            break;

        case CHANNEL_CALLLISTS:
        case callList.ROOT:
            if (cmd === 'htmlTemplate') {
                if (state.val) {
                    systemData.native.callLists.htmlTemplate = state.val.toString();
                }
            } else if (as[4] === 'count') {
                systemData.native.callLists[cmd][as[4]] = ~~state.val;
                // save system data in namespace
                adapter.setObject(adapter.namespace, systemData);
            }
            return;

        case CHANNEL_PHONEBOOK:
            onPhonebook(cmd, state.val);
            return;

            // case CHANNEL_DEVICES:
            // case CHANNEL_CALLMONITOR:
            //     return;

        case Deflections.CHANNEL_DEFLECTIONS:
            deflections && deflections.onStateChange(cmd, as[4], state.val);
            break;

        default:
            return;
    }
}

function setPhonebookStates(v) {
    devices.root.set(`.${CHANNEL_PHONEBOOK}.number`, (v && v.number)   ? v.number : '');
    devices.root.set(`.${CHANNEL_PHONEBOOK}.name`,   (v && v.name)     ? v.name : '');
    devices.root.set(`.${CHANNEL_PHONEBOOK}.image`,  (v && v.imageurl) ? v.imageurl : '');
    devices.update();
}

function onPhonebook(cmd, val) {
    if (!adapter.config.usePhonebook) {
        return;
    }

    let v;

    switch (cmd) {
        case 'number':
            v = phonebook.byNumber(val);
            setPhonebookStates (v);
            break;

        case 'name':
            v = phonebook.byName(val);
            setPhonebookStates(v);
            break;

        case 'command':
            break;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function getLastValidPropEx(obj, propString) {
    if (!obj) {
        return undefined;
    }
    const ar = propString.split('.');
    const len = ar.length;

    for (let i = 0; i < len; i++) {
        if (obj[ar[i]] === undefined) {
            let ret = { obj: {}, invalidName: '', errPath: ''};
            try {
                ret = {obj: obj, invalidName: ar[i], errPath: ar.slice(i).join('.')};
            } catch {
                // do nothing
            }
            return ret;
        }
        obj = obj[ar[i]];
    }

    return { obj: {}, invalidName: '', errPath: ''};
}

function safeFunction(root, path, log) {
    const cb = getProp(root, path);
    if (typeof cb === 'function') {
        return cb;
    }

    if (log) {
        const err = getLastValidPropEx(root, path);
        if (typeof log !== 'function') {
            log = adapter.log.debug;
        }
        err && log(`${err.errPath} is not a function (${path})`);
    }

    return function (params, cb) {
        if (typeof params === 'function') {
            cb = params;
        }

        if (typeof cb === 'function') {
            cb();
        } else {
            adapter.log.error(new Error(`${path} is not a function`));
        }
    };
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const TR064 = function (user, password, ip, port) {
    tr064Lib.TR064.call(this);
    this.ip = ip;
    this.port = port || 49000;
    this.user = user;
    this.password = password;
    this.abIndex = undefined;
};

TR064.prototype = Object.create(tr064Lib.TR064.prototype);
//TR064.prototype.constructor = TR064;

//TR064.prototype.startTransaction = function (callback) {
//    callback (null, this.sslDevice);
//    //this.sslDevice.startTransaction(callback);
//};
//
//TR064.prototype.stopTransaction = function (callback) {
//    callback (null, this.sslDevice);
//    //this.sslDevice.startTransaction(callback);
//};

TR064.prototype.setABIndex = function (val, cb) {
    if (val === undefined) {
        val = this.abIndex;
    }

    if (val === undefined) {
        val = devices.getval('states.abIdex', 0);
    }
    this.abIndex = val >> 0;
    this.getABInfo({NewIndex: this.abIndex}, (err, data) => {
        if (err || !data) {
            return;
        }
        devStates.setAndUpdate('ab', data.NewEnable, cb);
    });
};

TR064.prototype.setAB = function (val) {
    let idx = this.abIndex;

    if (typeof val === 'string') {
        const ar = val.replace(/\s/g, '').split(',');
        if (ar && ar.length > 1) {
            val = ar[1];
            idx = ar[0] >> 0;
        }
    }
    this.setEnableAB({ NewIndex: idx, NewEnable: val ? 1 : 0}, () => {});
};

const systemData = {
    type: 'meta',
    common: { name: 'tr-064' },
    native: {},
    load: function () {
        if (this.native.loaded) {
            return;
        }

        adapter.getObject(adapter.namespace, (err, obj) => {
            if (!err && obj && obj.native.loaded) {
                delete obj.acl;
                Object.assign(this, obj);
            }
            if (adapter.config.calllists.use) {
                if (!this.native.callLists) {
                    this.native.callLists = new callList.callLists();
                } else {
                    callList.callLists.call(this.native.callLists);
                }
                this.native.callLists.htmlTemplate = devices.getval(callList.S_HTML_TEMPLATE);
            }
            if (!this.native.loaded) {
                this.native.loaded = true;
                // save system data in namespace
                adapter.setObject(adapter.namespace, this);
            }
        });
    }
};

TR064.prototype.refreshCalllist = function () {
    if (!adapter.config.calllists.use) {
        return;
    }

    this.GetCallList((err, data) => {
        callList.refresh(err, data, (list, n, html) => {
            const id = callList.ROOT + '.' + n;
            list.cfg.generateJson && devices.root.set(id + '.json', JSON.stringify(list.array));
            devices.root.set(id + '.count', list.count);
            list.cfg.generateHtml && devices.root.set(id + '.html', html);
        }, devices.root.update.bind(devices.root));
    });
};

TR064.prototype.init = function (callback) {
    const self = this;

    function getSSLDevice(device, callback) {
        return callback(null, device);
        /*        device.startEncryptedCommunication(function (err, sslDevice) {
            if (err || !sslDevice) callback(err);
            sslDevice.login(self.user, self.password);
            callback(null, sslDevice);
        });*/
    }

    self.initTR064Device(self.ip, self.port, function (err, device) {
        if (err || !device) {
            return (callback(err || '!device'));
        }
        getSSLDevice(device, function (err, sslDevice) {
            if (err || !sslDevice) {
                return callback(err);
            }
            sslDevice.login(self.user, self.password);
            self.sslDevice = sslDevice;
            self.hosts = sslDevice.services['urn:dslforum-org:service:Hosts:1'];
            self.getWLANConfiguration = sslDevice.services['urn:dslforum-org:service:WLANConfiguration:1'];
            self.getWLANConfiguration2 = sslDevice.services['urn:dslforum-org:service:WLANConfiguration:2'];
            self.getWLANConfiguration3 = getProp(sslDevice.services, 'urn:dslforum-org:service:WLANConfiguration:3');
            self.reboot = sslDevice.services['urn:dslforum-org:service:DeviceConfig:1'].actions.Reboot;
            self.getConfigFile = sslDevice.services['urn:dslforum-org:service:DeviceConfig:1'].actions['X_AVM-DE_GetConfigFile'];  //in: NewX_AVM-DE_Password, NewX_AVM-DE_ConfigFileUrl
            //self.WANIPConnection = sslDevice.services["urn:dslforum-org:service:WANIPConnection:1"];

            self.GetCallList = safeFunction(sslDevice, 'services.urn:dslforum-org:service:X_AVM-DE_OnTel:1.actions.GetCallList');
            //self.refreshCalllist();

            self.getABInfo = safeFunction (sslDevice, 'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.GetInfo');
            self.setEnableAB = safeFunction (sslDevice, 'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.SetEnable');

            self.wlan24 = { setEnable: getProp(self.getWLANConfiguration, 'actions.SetEnable') };
            self.wlan50 = { setEnable: getProp(self.getWLANConfiguration2, 'actions.SetEnable') };
            self.wlanGuest = { setEnable: getProp(self.getWLANConfiguration3, 'actions.SetEnable') };
            self.wlan24.getInfo = getProp(self.getWLANConfiguration, 'actions.GetInfo');
            self.wlan50.getInfo = getProp(self.getWLANConfiguration2, 'actions.GetInfo');
            self.wlanGuest.getInfo = getProp(self.getWLANConfiguration3, 'actions.GetInfo');
            self.wlan24.getSecurityKeys = getProp(self.getWLANConfiguration, 'actions.GetSecurityKeys');
            self.wlan24.setSecurityKeys = getProp(self.getWLANConfiguration, 'actions.SetSecurityKeys');
            self.wlan50.getSecurityKeys = getProp(self.getWLANConfiguration2, 'actions.GetSecurityKeys');
            self.wlan50.setSecurityKeys = getProp(self.getWLANConfiguration2, 'actions.SetSecurityKeys');
            self.wlanGuest.getSecurityKeys = getProp(self.getWLANConfiguration3, 'actions.GetSecurityKeys');
            self.wlanGuest.setSecurityKeys = getProp(self.getWLANConfiguration3, 'actions.SetSecurityKeys');

            if (!self.getWLANConfiguration3 || !self.wlanGuest.getInfo || !self.wlanGuest.setEnable) {
                self.wlanGuest.setEnable = self.wlan50.setEnable;
                self.wlanGuest.getInfo = self.wlan50.getInfo;
                self.wlanGuest.getSecurityKeys = self.wlan50.getSecurityKeys;
                self.wlanGuest.setSecurityKeys = self.wlan50.setSecurityKeys;
                delete self.wlan50;
            }

            self.voip = getProp(self.sslDevice, 'services.urn:dslforum-org:service:X_VoIP:1.actions');

            // self.getSpecificHostEntry = self.hosts.actions.GetSpecificHostEntry;
            // self.getGenericHostEntry = self.hosts.actions.GetGenericHostEntry;
            // self.GetSpecificHostEntryExt = self.hosts.actions['X_AVM-DE_GetSpecificHostEntryExt'];

            self.getSpecificHostEntry = safeFunction(self, 'hosts.actions.GetSpecificHostEntry');
            self.getGenericHostEntry = safeFunction(self, 'hosts.actions.GetGenericHostEntry');
            self.GetSpecificHostEntryExt = safeFunction(self, 'hosts.actions.X_AVM-DE_GetSpecificHostEntryExt');
            self.GetChangeCounter = safeFunction(self, 'hosts.actions.X_AVM-DE_GetChangeCounter');
            //self.hostsDoUpdate = self.hosts.actions ['X_AVM-DE_HostDoUpdate'];
            //self.hostsCheckUpdate = self.hosts.actions ['X_AVM-DE_HostCheckUpdate'];

            self.stateVariables = {};
            if (self.hosts && self.hosts.stateVariables) {
                self.stateVariables.HostNumberOfEntries = self.hosts.stateVariables.HostNumberOfEntries;
                self.stateVariables.changeCounter = self.hosts.stateVariables['X_AVM-DE_ChangeCounter'];
            }

            self.initIGDDevice(self.ip, self.port, function (err, device) {
                err && adapter.log.error('initIGDDevice:' + err + ' - ' + JSON.stringify(err));
                if (!err && device) {
                    getSSLDevice(device, function (err, sslDevice) {
                        err && adapter.log.error('getSSLDevice:' + err + ' - ' + JSON.stringify(err));
                        self.getExternalIPAddress = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.GetExternalIPAddress;
                        self.getExternalIPv6Address = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.X_AVM_DE_GetExternalIPv6Address;
                        self.getExternalIPv6Prefix = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.X_AVM_DE_GetIPv6Prefix;
                        self.reconnectInternet = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.ForceTermination;
                    });
                }
            });

            self.getWLAN(callbackOrTimeout(2000, callback));
        });
    //}.bind(this));
    });
};

TR064.prototype.ring = function (val) {
    const self = this;
    if (!val) {
        return;
    }
    const ar = val.toString().split(',');

    if (!ar || ar.length < 1 || !this.voip) {
        return;
    }

    safeFunction(this.voip, 'X_AVM-DE_DialNumber', true)({'NewX_AVM-DE_PhoneNumber': ar[0]}, err => {
        if (!err) {
            if (ar.length >= 2) {
                const duration = ar[1].trim() >> 0;
                ringTimeout = setTimeout(() => {
                    ringTimeout = null;
                    safeFunction(self.voip, 'X_AVM-DE_DialHangup', true)({}, () => {});
                }, duration * 1000);
            }
        } else {
            adapter.log.warn('Ring Error: ' + err);
        }
    });
};

/*
TR064.prototype.dialNumber = function (number, callback) {
    this.sslDevice.services['urn:dslforum-org:service:X_VoIP:1'].actions['X_AVM-DE_DialNumber']({
        'NewX_AVM-DE_PhoneNumber': number
    }, callback);
};
*/

TR064.prototype.forEachHostEntry = function (callback) {
    const self = this;

    adapter.log.debug('forEachHostEntry');
    //self.hosts.actions.GetHostNumberOfEntries(function (err, obj) {
    safeFunction(self, 'hosts.actions.GetHostNumberOfEntries')((err, obj) => {
        err && adapter.log.error('GetHostNumberOfEntries:' + err + ' - ' + JSON.stringify(err));

        if (err || !obj) {
            return;
        }

        const all = obj.NewHostNumberOfEntries >> 0;
        adapter.log.debug('forEachHostEntry: all=' + all);
        let cnt = 0;

        function doIt() {
            if (cnt >= all) {
                return;
            }
            //self.getGenericHostEntry({NewIndex: cnt}, function (err, obj) {
            safeFunction(self, 'getGenericHostEntry') ({NewIndex: cnt}, (err, obj) => {
                err && adapter.log.error('forEachHostEntry: in getGenericHostEntry ' + (cnt) + ':' + err + ' - ' + JSON.stringify(err));

                if (err || !obj) {
                    return;
                }

                adapter.log.debug('forEachHostEntry cnt=' + cnt + ' ' + obj.NewHostName);
                callback(err, obj, cnt++, all);
                setTimeout(doIt, 10);
            });
        }

        doIt();
    });
};

TR064.prototype.forEachConfiguredDevice = function (callback) {
    let i = 0;
    const self = this;
    adapter.log.debug('forEachConfiguredDevice');

    function doIt() {
        if (i >= adapter.config.devices.length) {
            return callback && callback(null);
        }

        const dev = adapter.config.devices[i++];

        if (dev.mac && dev.mac !== '') {
            safeFunction(self, 'getSpecificHostEntry') ({NewMACAddress: dev.mac}, (err, device) => {
                if (err && err.code === 500) {
                    if (dev.lastResult) {
                        device = dev.lastResult;
                        device.NewActive = false;
                    } else {
                        adapter.log.info(`forEachConfiguredDevice: in GetSpecificHostEntry ${i - 1}(${dev.name}/${dev.mac}) device seems offline but we never saw it since adapter was started:${err} - ${JSON.stringify(err)}`);
                        device = null;
                    }
                } else if (err) {
                    adapter.log.warn(`forEachConfiguredDevice: in GetSpecificHostEntry ${i - 1}(${dev.name}/${dev.mac}):${err} - ${JSON.stringify(err)}`);
                    device = null;
                } else {
                    dev.lastResult = device; // store last result to reuse if device goes offline and error 500 is returned
                }
                if (device) {
                    adapter.log.debug('forEachConfiguredDevice: i=' + (i-1) + ' ' + device.NewHostName + ' active=' + device.NewActive);
                    device.NewMACAddress = dev.mac;
                    callback(device);
                }
                setImmediate(doIt);
            });
        } else {
            setImmediate(doIt);
        }
    }

    doIt();
};

TR064.prototype.dumpServices = function (ar) {
    let fs;
    let doLog;

    if (ar && ar.length) {
        switch (ar[1]) {
            case 'log':
                doLog = true;
                break;

            case 'fs':
                fs = require('fs');
                break;
        }
    }
    const services = {};

    for (const service in this.sslDevice.services) {
        services[service] = {actions: {}};
        const oService = this.sslDevice.services[service];
        if (oService.actions) {
            for (const action in oService.actions) {
                let v = oService.actions[action];
                v = typeof v === 'function' ? 'fn' : v;
                services[service].actions[action] = v;
                doLog && adapter.log.debug(`${service}.actions.${action}`);
            }
        }
    }

    const dump = JSON.stringify(services);

    devStates.setAndUpdate(states.commandResult.name, dump);

    if (fs) {
        let logName = '';
        const controllerDir = require(__dirname + '/lib/utils').controllerDir;
        const parts = controllerDir.split('/');
        if (parts.length > 1 && parts[parts.length - 2] === 'node_modules') {
            parts.splice(parts.length - 2, 2);
            logName = parts.join('/');
            logName += '/log/tr-64-services.json';
        } else {
            logName = `${__dirname}/../../log/tr-64-services.json`;
        }

        try {
            fs.writeFileSync(logName, dump);
        } catch (e) {
            adapter.log.error('Cannot write file: ' + logName, dump);
        }
    }
};

TR064.prototype.command = function (command, callback) {
    if (command && command.toLowerCase().startsWith('dumpservices')) {
        return this.dumpServices(command.toLowerCase().split('.'));
    }

    let o;
    try {
        o = JSON.parse(command);
    } catch(e) {
        return;
    }   //xxx
    if (typeof o.params !== 'object' || o.params === null) {
        return;
    }

    safeFunction(this.sslDevice.services, o.service + '.actions.' + o.action)(o.params, (err, res) => {
        if (err || !res) {
            adapter.setState(`${CHANNEL_STATES}.${states.commandResult.name}`, JSON.stringify(err||{}), true, callback);
            return;
        }
        adapter.log.info(JSON.stringify(res));
        adapter.setState(`${CHANNEL_STATES}.${states.commandResult.name}`, JSON.stringify(res), true, callback);
    });
};

TR064.prototype.setWLAN24 = function (val, callback) {
    safeFunction(this.wlan24, 'setEnable', true)({NewEnable: val ? 1 : 0 }, callback);
};

TR064.prototype.setWLAN50 = function (val) {
    if (!this.wlan50 || !this.wlan50.setEnable) {
        return;
    }
    safeFunction (this.wlan50, 'setEnable', true)({NewEnable: val ? 1 : 0 }, err => {
        err && adapter.log.error('getWLANConfiguration2: ' + err + ' - ' + JSON.stringify(err));
        //if (!val) setTimeout(function (err, res) {
        //    this.setWLAN(true, function (err, res) {
        //    });
        //}, 20000);
    });
};

TR064.prototype.setWLANGuest = function (val, callback) {
    safeFunction(this.wlanGuest, 'setEnable', true) ({NewEnable: val ? 1 : 0}, callback);
};

TR064.prototype.setWLAN = function (val, callback) {
    const self = this;
    this.setWLAN24(val, function (err, result) {
        err && adapter.log.error('setWLAN24: ' + err + ' - ' + JSON.stringify(err));
        if (err || !result) {
            return callback(-1);
        }
        self.setWLANGuest(val, function (err) {
            err && adapter.log.error('setWLANGuest: ' + err + ' - ' + JSON.stringify(err));
            self.setWLAN50(val, callback);
        });
    });
};

TR064.prototype.setWLANPassword = function (kind, pw, cb) {
    const self = this;
    if (!hasProp(self, kind + '.getSecurityKeys')) {
        return cb && cb(-1);
    }

    self[kind].getSecurityKeys (function (err, ret) {
        if (err || !ret || ret.NewKeyPassphrase === pw) {
            return cb && cb(err,ret);
        }
        ret.NewKeyPassphrase = pw;

        self[kind].setSecurityKeys(ret, function (err,ret) {
            cb && cb(err, ret);
        });
    });
};

TR064.prototype.setWLAN24Password = function (val) {
    this.setWLANPassword('wlan24', val);
    return true;
};
TR064.prototype.setWLAN50Password = function (val) {
    this.setWLANPassword('wlan50', val);
    return true;
};
TR064.prototype.setWLANGuestPassword = function (val) {
    this.setWLANPassword('wlanGuest', val);
    return true;
};

TR064.prototype.setWPSMode = function (modeOrOnOff) {
    let mode = modeOrOnOff;
    if (typeof modeOrOnOff === 'boolean') {
        mode = modeOrOnOff ? 'pbc' : 'stop';
    }

    this.getWLANConfiguration.actions['X_AVM-DE_SetWPSConfig']({
        'NewX_AVM-DE_WPSMode': mode,
        'NewX_AVM-DE_WPSClientPIN': ''
    }, () =>
        this.getWLANConfiguration.actions['X_AVM-DE_GetWPSInfo'](err =>
            err && adapter.log.error('X_AVM-DE_GetWPSInfo error: ' + err)));
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/*
const errorCounts = {};

function _checkError(err, res) {
    if (err) {
        const code = err.code ? err.code : 'unknown error code';
        if (errorCounts[code] && (new Date().getTime() - errorCounts[code]) > 60 * 60 * 1000) {
            delete(errorCounts[code]);
        }
        if (!errorCounts[code]) {
            let msg = err.message ? err.message : 'unknown error text';

            switch (code >> 0) {
                case 401:
                    msg = 'Authentication error. Check username and password in configuration';
                    break;
            }
            adapter.log.error('_checkError: code=' + code + ' msg=' + msg);
            //code=unknown error code Device responded with fault Error: Credentials incorrec
            errorCounts[code] = new Date().getTime();
        }
    }
    this(err, res);
}

function checkError(cb) {
    return _checkError.bind(cb);
}
*/

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

TR064.prototype.getWLAN = function (callback) {
    //safeFunction(this.wlan24, 'getInfo', true)(checkError(callback));
    safeFunction(this.wlan24, 'getInfo', true)(callback);
};

TR064.prototype.getWLAN5 = function (callback) {
    if (!this.wlan50 || !this.wlan50.getInfo) {
        return;
    }
    safeFunction(this.wlan50, 'getInfo', true)(callback);
};

TR064.prototype.getWLANGuest = function (callback) {
    safeFunction(this.wlanGuest, 'getInfo', true)(callback);
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function isKnownMac(mac) {
    return !!adapter.config.devices.find(function (v) {
        return v.mac === mac;
    });
}

// function deleteUnusedDevices(callback) {
//     const ch = adapter.namespace + '.' + CHANNEL_DEVICES;
//     adapter.getObjectView('system', 'state', { startkey: ch + '.', endkey: ch + '.\u9999' }, function (err, res) {
//         if (err || !res) return;
//         const toDelete = [];
//         res.rows.forEach(function (o){
//             if ((!o.value.native || !o.value.native.mac) && o.id.substr(ch.length+1).indexOf('.') < 0) { // old device, without native.mac
//                 toDelete.push(o.id);
//             }
//             if (o.value.native && o.value.native.mac && !isKnownMac(o.value.native.mac)) {
//                 toDelete.push(o.id);
//             }
//         });
//         toDelete.forEach(function (id) {
//             adapter.log.debug('deleting ' + id);
//             res.rows.forEach(function (o) {
//                 if (o.id.indexOf(id) === 0) {
//                     devices.remove(o.id.substr(adapter.namespace.length+1));
//                     adapter.states.delState(o.id, function (err, obj) {
//                          adapter.objects.delObject(o.id);
//                     });
//                 }
//             });
//         });
//     });
// }

function _deleteStates(list, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        const id = list.shift();
        adapter.delForeignObject(id, () =>
            setImmediate(_deleteStates, list, callback));
    }
}

function _deleteUnusedDevices(list, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        const id = list.shift();
        adapter.getObjectView('system', 'state', {startkey: id + '.', endkey: id + '.\u9999'}, (err, res) => {
            const ids = res ? res.rows.map(el => el.id) : [];
            _deleteStates(ids, () =>
                adapter.delForeignObject(id, () =>
                    setImmediate(_deleteUnusedDevices, list, callback)));
        });
    }
}

function deleteUnusedDevices(callback) {
    const ch = adapter.namespace + '.' + CHANNEL_DEVICES;
    adapter.getObjectView('system', 'state', {startkey: ch + '.', endkey: ch + '.\u9999'}, (err, res) => {
        if (err || !res) {
            return callback && callback(err);
        }

        const toDelete = [];

        res.rows.forEach(o => {
            let doDelete = ((!o.value.native || !o.value.native.mac) && !o.id.substr(ch.length + 1).includes('.')); // old device, without native.mac
            doDelete = doDelete || (o.value.native && o.value.native.mac && !isKnownMac(o.value.native.mac));
            doDelete && toDelete.push(o.id);
        });
        _deleteUnusedDevices(toDelete, callback);
    });
}

function setActive(dev, val, ip, mac) {
    val = !!(val >> 0);

    if (ip !== undefined && ipActive[ip] !== val) {
        ipActive[ip] = val;
    }
    if (!dev.set('active', val)) {
        return;
    } // state not changed;
    const dts = new Date();
    const sts =  dts.toLocaleString();
    const ts = (dts.getTime() / 1000) >> 0;
    if (val) {
        dev.set('lastActive', sts);
        dev.set('lastActive-ts', ts);
        dev.set('lastIP', ip);
        dev.set('lastMAC-address', mac);
    } else {
        dev.set('lastInactive', sts);
        dev.set('lastInactive-ts', ts);
    }
    dev.set('', val);
}

function createConfiguredDevices(callback) {
    adapter.log.debug('createConfiguredDevices');
    const dev = new devices.CDevice(CHANNEL_DEVICES, '');
    tr064Client.forEachConfiguredDevice(function (device) {
        if (!device) {
            devices.update(callback);
            return;
        }
        dev.setChannelEx(device.NewHostName, { common: { name: device.NewHostName + ' (' + device.NewIPAddress + ')', role: 'channel' }, native: { mac: device.NewMACAddress }} );
        setActive(dev, device.NewActive, device.NewIPAddress, device.NewMACAddress);
    });
}

function updateDevices(callback) {
    adapter.log.debug('updateDevices');
    const dev = new devices.CDevice(CHANNEL_DEVICES, '');
    const arr = [];

    tr064Client.forEachConfiguredDevice(function (device) {
        if (!device) {
            if (adapter.config.jsonDeviceList) {
                const json = JSON.stringify(arr);
                dev.setChannelEx();
                dev.set('jsonDeviceList', json);
            }
            devices.update(callback);
            return;
        }
        adapter.log.debug('forEachConfiguredDevice: ' + JSON.stringify(device));
        dev.setChannelEx(device.NewHostName);
        setActive(dev, device.NewActive, device.NewIPAddress);
        if (adapter.config.jsonDeviceList) {
            arr.push( { active: !!device.NewActive, ip: device.NewIPAddress, name: device.NewHostName, mac: device.NewMACAddress } );
        }
    });
}

function updateDeflections(callback) {
    return deflections ? deflections.get(callback) : callback();
}

function updateAll() {
    adapter.log.debug('in updateAll');
    const names = [
        { func: 'getExternalIPAddress', state: states.externalIP.name, result: 'NewExternalIPAddress', format: function (val) {
            return val;
        }},
        { func: 'getExternalIPv6Address', state: states.externalIPv6.name, result: 'NewExternalIPv6Address', format: function (val) {
            return val;
        }},
        { func: 'getExternalIPv6Prefix', state: states.externalIPv6Prefix.name, result: 'NewIPv6Prefix', format: function (val) {
            return val;
        }},
        { func: 'getWLAN', state: states.wlan24.name, result: 'NewEnable', format: function (val) {
            return !!(val >> 0);
        }},
        { func: 'getWLAN5', state: states.wlan50.name, result: 'NewEnable', format: function (val) {
            return !!(val >> 0);
        }},
        { func: 'getWLANGuest', state: states.wlanGuest.name, result: 'NewEnable', format: function (val) {
            return !!(val >> 0);
        }}
        //{ func: 'setABIndex', state: states.abIndex.name, result: 'NewEnable' }
    ];
    let i = 0;

    function doIt() {
        if (i >= names.length) {
            devStates.set('reboot', false);
            devices.update(err => {
                err && err !== -1 && adapter.log.error(`updateAll: ${err}`);

                updateDeflections(callbackOrTimeout(3000, () => {
                    if (adapter.config.pollingInterval) {
                        pollingTimer && clearTimeout(pollingTimer);
                        pollingTimer = setTimeout(() => {
                            pollingTimer = null;
                            updateAll();
                        }, adapter.config.pollingInterval * 1000);
                    }
                }));
            });
            return;
        }

        const name = names[i++];
        if (typeof tr064Client[name.func] !== 'function') {
            return doIt();
        }

        tr064Client[name.func](callbackOrTimeout(3000, (err, res) => {
            !err && res && devStates.set(name.state, name.format ? name.format(res[name.result]) : name.result);
            setTimeout(doIt, 10);
        }));

    }
    tr064Client.setABIndex();
    adapter.config.useDevices ? updateDevices(doIt) : doIt();
}

function runMDNS () {
    if (!adapter.config.useMDNS) {
        return;
    }
    const dev = new devices.CDevice(CHANNEL_DEVICES, '');
    const mdns = require('mdns-discovery')();

    mdns.on ('message', function (message, rinfo) {
        if (!message || !rinfo) {
            return;
        }
        if (ipActive[rinfo.address] !== false) {
            return;
        }
        ipActive[rinfo.address] = true;
        // if (rinfo.address === '192.168.1.41') {
        //     const xyz = 1;
        // }
        const d =  adapter.config.devices.find(function (device) {
            return device.ip === rinfo.address;
        });
        if (d) {
            dev.setChannelEx(d.name);
            setActive(dev, true);
            devices.update();
            console.log(rinfo.address);
        }
    }).run();
}

function normalizeConfigVars() {
    if (!adapter.config.calllists) {
        adapter.config.calllists = adapter.ioPack.native.calllists;
    }
    callList.normalizeConfig (adapter.config.calllists);
    adapter.log.debug('Calllist Config after normalizing: ' + JSON.stringify(adapter.config.calllists));

    adapter.config.pollingInterval = adapter.config.pollingInterval >> 0;
    adapter.config.port = adapter.config.port >> 0;
    adapter.config.useCallMonitor = !!(adapter.config.useCallMonitor >> 0);
    adapter.config.useDevices = !!(adapter.config.useDevices >> 0);
    adapter.config.usePhonebook = !!(adapter.config.usePhonebook >> 0);
    if (adapter.config.useMDNS === undefined) {
        adapter.config.useMDNS = true;
    }
    if (adapter.config.useDeflectionOptions === undefined) {
        adapter.config.useDeflectionOptions = true;
    }
}

function main(adapter) {
    devStates = new devices.CDevice(0, '');
    devStates.setDevice(CHANNEL_STATES, {common: {name: 'States and commands', role: 'device'}, native: {}});

    normalizeConfigVars();
    systemData.load();
    deleteUnusedDevices();
    callList.init(adapter, systemData);

    tr064Client = new TR064(adapter.config.user, adapter.config.password, adapter.config.ip || adapter.config.iporhost);
    tr064Client.init(err => {
        initError = err;
        if (err) {
            adapter.log.error(err + ' - ' + JSON.stringify(err));
            adapter.log.error('~');
            adapter.log.error('~~ Fatal error. Can not connect to your FritzBox.');
            adapter.log.error('~~ If configuration, network, IP address, etc. ok, try to restart your FritzBox');
            adapter.log.error('~');
            return adapter.terminate ? adapter.terminate('Fatal error. Can not connect to your FritzBox.', 1) : setTimeout(() => process.exit(1), 5000);
        }

        tr064Client.refreshCalllist(); //xxx
        createObjects();

        createConfiguredDevices(() => {
            phonebook.start(tr064Client.sslDevice, {return: !adapter.config.usePhonebook, adapter}, () => {
                pollingTimer && clearTimeout(pollingTimer);
                pollingTimer = setTimeout(() => {
                    pollingTimer = null;
                    updateAll();
                }, 2000);
                callMonitor = new CallMonitor(adapter, devices, phonebook);
                runMDNS();

                adapter.subscribeStates('*');
            });
        });

        if (adapter.config.useDeflectionOptions) {
            deflections = new Deflections (tr064Client.sslDevice, adapter, devices);
        }
    });
}

//http://192.168.1.1:49000/tr64desc.xml

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
