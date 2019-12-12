/* global __dirname, dcs, devices */

'use strict';

const phonebook   = require(__dirname + '/lib/phonebook'),
    callMonitor = require(__dirname + '/lib/callmonitor'),
    calllist    = require(__dirname + '/lib/calllist'),
    Deflections = require(__dirname + '/lib/deflections'),
    soef        = require(__dirname + '/lib/soef'),
    tr064Lib    = require('tr-O64');

let tr064Client, deflections;
const commandDesc = 'eg. { "service": "urn:dslforum-org:service:WLANConfiguration:1", "action": "X_AVM-DE_SetWPSConfig", "params": { "NewX_AVM-DE_WPSMode": "pbc", "NewX_AVM-DE_WPSClientPIN": "" } }';
const debug = false;
let pollingTimer = null;
let initError = false;

var adapter = soef.Adapter(
    //onStateChange,
    main,
    onMessage,
    onUpdate,
    { name: 'tr-064-community',
        stateChange: function (id, state) {
            if (state) {
                if (initError) {
                    adapter.log.error('tr-064 adapter not connected to a FritzBox. Terminating');
                    setTimeout(process.exit.bind(process, -1), 2000);
                    return;
                }
                if (!state.ack) onStateChange(id, state);
                else if (adapter.config.calllists.use && id.indexOf('callmonitor.lastCall.timestamp') > 0) {
                    tr064Client.refreshCalllist();
                }
            }
        }
    }
);

function onUpdate(oldVersion, newVersion, callback) {
    if(oldVersion < 3009) {
        dcs.delOS(adapter.namespace + '.states.externalP');
    }
    callback();
}


const CHANNEL_STATES = 'states',
    CHANNEL_DEVICES = 'devices',
    CHANNEL_PHONEBOOK = 'phonebook',
    CHANNEL_CALLLISTS = 'calllists',
    CHANNEL_CALLMONITOR = 'callmonitor'
    ;

let devStates;
const allDevices = [];
const ipActive = {};

const states = {
    wps:               { type: 'state', name: 'wps',               val: false,   common: { }, native: { func: 'setWPSMode' }},
    wlan:              { type: 'state', name: 'wlan',              val: false,   common: { desc: 'All WLANs' }, native: { func: 'setWLAN' }},
    wlan24:            { type: 'state', name: 'wlan24',            val: true,    common: { desc: '2.4 GHz WLAN' }, native: { func: 'setWLAN24' }},
    wlan50:            { type: 'state', name: 'wlan50',            val: true,    common: { desc: '5.0 GHz WLAN' }, native: { func: 'setWLAN50' }},
    wlanGuest:         { type: 'state', name: 'wlanGuest',         val: true,    common: { desc: 'Guest WLAN' }, native: { func: 'setWLANGuest' }},
    wlan24Password:    { type: 'state', name: 'wlan24Password',    val: '',      common: { desc: 'Passphrase for 2.4 GHz WLAN' }, native: { func: 'setWLAN24Password' }},
    wlan50Password:    { type: 'state', name: 'wlan50Password',    val: '',      common: { desc: 'Passphrase for 5.0 GHz WLAN' }, native: { func: 'setWLAN50Password' }},
    wlanGuestPassword: { type: 'state', name: 'wlanGuestPassword', val: '',      common: { desc: 'Passphrase for Guest WLAN' }, native: { func: 'setWLANGuestPassword' }},
    abIndex:           { type: 'state', name: 'abIndex',           val: 0,       common: { }, native: { func: 'setABIndex' }},
    ab:                { type: 'state', name: 'ab',                val: false,   common: { desc: 'parameter: index, state' }, native: { func: 'setAB' }},
    ring:              { type: 'state', name: 'ring',              val: '**610', common: { desc: 'let a phone ring. Parameter is phonenumer [,duration]. eg. **610'}, native: { func: 'ring' } },
    reconnectInternet: { type: 'state', name: 'reconnectInternet', val: false,   common: { }, native: { func: 'reconnectInternet' }  },
    command:           { type: 'state', name: 'command',           val: '',      native: { func: 'command', desc: commandDesc }},
    commandResult:     { type: 'state', name: 'commandResult',     val: '',      common: { write: false }},
    externalIP:        { type: 'state', name: 'externalIP',        val: '',      common: { write: false}},
    reboot:            { type: 'state', name: 'reboot',            val: false,   common: { }, native: { func: 'reboot' }  },

    pbNumber:          { type: 'state', name: '.'+CHANNEL_PHONEBOOK + '.number', val: '', common: { name: 'Number'} },
    pbName:            { type: 'state', name: '.'+CHANNEL_PHONEBOOK + '.name', val: '', common: { name: 'Name'} },
    pbImageUrl:        { type: 'state', name: '.'+CHANNEL_PHONEBOOK + '.image', val: '', common: { name: 'Image URL'} },
    ringing:           { type: 'state', name: '.'+CHANNEL_CALLMONITOR + '.ringing', val: false, common: { name: 'Ringing'} }

};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

String.prototype.normalizeNumber = function () {
    return this.replace (/\+/g, '00').replace(/[^0-9\*]/g, '');
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createObjects(cb) {

    adapter.setObjectNotExists(CHANNEL_CALLLISTS, {type: 'device', common: {name: 'Call lists', role: 'device'}, native: {} });
    adapter.setObjectNotExists(CHANNEL_DEVICES, {type: 'device', common: {name: 'Devices', role: 'device'}, native: {} });
    adapter.setObjectNotExists(CHANNEL_CALLMONITOR, {type: 'device', common: {name: 'Call monitor', role: 'device'}, native: {} });
    adapter.setObjectNotExists(CHANNEL_PHONEBOOK, {type: 'device', common: {name: 'Phone book', role: 'device'}, native: {} });
    adapter.setObjectNotExists(CHANNEL_STATES, {type: 'device', common: {name: 'States and commands', role: 'device'}, native: {} });

    for (const i in states) {
        if (i.indexOf('wlan50') === 0 && !tr064Client.wlan50 && tr064Client.wlanGuest) continue;
        adapter.setObjectNotExists(CHANNEL_STATES + '.' + st.name, states[i]);
    }
    if (adapter.config.calllists.use) adapter.setObjectNotExists(calllist.S_HTML_TEMPLATE, soef.getProp(systemData, 'native.callLists.htmlTemplate') || '');
    //devices.update(cb);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onMessage(obj) {
    if (!obj) return;

    function reply(result) {
        adapter.sendTo (obj.from, obj.command, JSON.stringify(result), obj.callback);
    }

    switch (obj.command) {
        case 'discovery':
            var onlyActive, reread;
            if (typeof obj.message === 'object') {
                onlyActive = obj.message.onlyActive;
                reread = obj.message.reread;
            }
            if (!obj.callback) return false;
            if (!reread && allDevices.length > 0 && allDevices.onlyActive === onlyActive) {
                reply(allDevices);
                return true;
            }
            allDevices.onlyActive = onlyActive;
            tr064Client.forEachHostEntry(function (err, device, cnt, all) {
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
                    reply(allDevices);
                }
            });
            return true;
        default:
            adapter.log.warn('Unknown command: ' + obj.command);
            break;
    }
    if (obj.callback) adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
    return true;
}


function onStateChange(id, state) {
    if (!soef.ns.is(id)) return;
    const as = id.split('.');
    if (as.length < 3) return;
    const cmd = as [3];
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));
    switch(as[2]) {
        case CHANNEL_STATES:
            var func = states [cmd] && states [cmd].native ? states [cmd].native.func : null;
            if (func && tr064Client[func]) {
                const ret = tr064Client[func] (state.val, function (err, res) {});
                if (ret === true) {
                    devices.root.clear(id);
                }
            }
            break;
        case CHANNEL_CALLLISTS:
        case calllist.ROOT:
            if (cmd === 'htmlTemplate') systemData.native.callLists.htmlTemplate = state.val;
            else if (as[4] === 'count') {
                systemData.native.callLists[cmd][as[4]] = ~~state.val;
                systemData.save();
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
    adapter.setState(CHANNEL_PHONEBOOK + '.number', (v && v.number) ? v.number : '', true);
    adapter.setState(CHANNEL_PHONEBOOK + '.name', (v && v.name) ? v.name : '', true);
    adapter.setState(CHANNEL_PHONEBOOK + '.image', (v && v.imageurl) ? v.imageurl : '', true);
}

function onPhonebook(cmd, val) {
    if (!adapter.config.usePhonebook) return;
    let v;
    switch (cmd) {
        case 'number':
            v = phonebook.byNumber(val);
            setPhonebookStates (v);
            break;
        case 'name':
            v = phonebook.byName(val);
            setPhonebookState(v);
            break;
        case 'command':
            break;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function getLastValidProp(obj, propString) {
    if (!obj) return undefined;
    const ar = propString.split('.');
    const len = ar.length;
    for (let i = 0; i < len; i++) {
        if (obj[ar[i]] === undefined) return obj;
        obj = obj[ar[i]];
    }
    return obj;
}

function getLastValidPropEx(obj, propString) {
    if (!obj) return undefined;
    const ar = propString.split('.');
    const len = ar.length;
    for (let i = 0; i < len; i++) {
        if (obj[ar[i]] === undefined) {
            let ret = { obj: {}, invalifName: '', errPath: ''};
            try { ret = {obj: obj, invalidName: ar[i], errPath: ar.slice(i).join('.')}; }
            catch (e) {}
            return ret;
        }
        obj = obj[ar[i]];
    }
    return { obj: {}, invalifName: '', errPath: ''};
}

function safeFunction(root, path, log) {
    const fn = soef.getProp(root, path);
    if (typeof fn === 'function') return fn;
    if (log) {
        const err = getLastValidPropEx(root, path);
        if (typeof log !== 'function') log = adapter.log.debug;
        if (err) log(err.errPath + ' is not a function (' + path +')');
    }
    return function (params, callback) {
        if (!arguments.length) return;
        const fn = arguments [arguments.length-1];
        if (typeof fn === 'function') {
            fn(new Error(path + ' is not a function'));
        }
    };
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const TR064 = function (user, password, iporhost, port) {
    tr064Lib.TR064.call(this);
    this.ip = iporhost;
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

    if (val === undefined) val = this.abIndex;
    if (val === undefined) {
        val = devices.getval('states.abIndex', 0);
    }
    this.abIndex = val >> 0;
    this.getABInfo({ NewIndex: this.abIndex }, function (err, data) {
        if (err || !data) return;
        devStates.setAndUpdate('ab', data.NewEnable);
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
    this.setEnableAB({ NewIndex: idx, NewEnable: val ? 1 : 0}, function (err, data) {
    });
};


var systemData = {
    type: 'meta',
    common: { name: 'tr-064' },
    native: {},
    load: function () {
        if (this.native.loaded) return;
        const self = this;
        adapter.getObject(adapter.namespace, function (err, obj) {
            if (!err && obj && obj.native.loaded) {
                delete obj.acl;
                Object.assign(self, obj);
            }
            if (adapter.config.calllists.use) {
                if (!self.native.callLists) self.native.callLists = new calllist.callLists();
                else calllist.callLists.call(self.native.callLists);
                self.native.callLists.htmlTemplate = devices.getval(calllist.S_HTML_TEMPLATE);
            }
            if (!self.native.loaded) {
                self.native.loaded = true;
                self.save();
            }
        });
    },
    save: function () {
        adapter.setObject(adapter.namespace, this, function (err, obj) {
        });
    },
    xsave: adapter.setObject.bind(adapter, adapter.namespace, this, function (err, obj) {
    })
};


TR064.prototype.refreshCalllist = function () {
    if (!adapter.config.calllists.use) return;
    this.GetCallList (function (err, data) {
        calllist.refresh(err, data, function(list, n, html) {
            const id = calllist.ROOT + '.' + n;
            list.cfg.generateJson && adapter.setState(id + '.json', JSON.stringify(list.array), true);
            adapter.setState(id + '.count', list.count, true);
            list.cfg.generateHtml && adapter.setState(id + '.html', html, true);
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
        if (err || !device) return (callback(err || '!device'));
        getSSLDevice(device, function (err, sslDevice) {
            if (err || !sslDevice) return callback(err);
            sslDevice.login(self.user, self.password);
            self.sslDevice = sslDevice;
            self.hosts = sslDevice.services['urn:dslforum-org:service:Hosts:1'];
            self.getWLANConfiguration = sslDevice.services['urn:dslforum-org:service:WLANConfiguration:1'];
            self.getWLANConfiguration2 = sslDevice.services['urn:dslforum-org:service:WLANConfiguration:2'];
            self.getWLANConfiguration3 = soef.getProp(sslDevice.services, 'urn:dslforum-org:service:WLANConfiguration:3');
            self.reboot = sslDevice.services['urn:dslforum-org:service:DeviceConfig:1'].actions.Reboot;
            self.getConfigFile = sslDevice.services['urn:dslforum-org:service:DeviceConfig:1'].actions['X_AVM-DE_GetConfigFile'];  //in: NewX_AVM-DE_Password, NewX_AVM-DE_ConfigFileUrl
            //self.WANIPConnection = sslDevice.services["urn:dslforum-org:service:WANIPConnection:1"];

            self.GetCallList = safeFunction(sslDevice, 'services.urn:dslforum-org:service:X_AVM-DE_OnTel:1.actions.GetCallList');
            //self.refreshCalllist();

            self.getABInfo = safeFunction (sslDevice, 'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.GetInfo');
            self.setEnableAB = safeFunction (sslDevice, 'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.SetEnable');

            self.wlan24 = { setEnable: soef.getProp(self.getWLANConfiguration, 'actions.SetEnable') };
            self.wlan50 = { setEnable: soef.getProp(self.getWLANConfiguration2, 'actions.SetEnable') };
            self.wlanGuest = { setEnable: soef.getProp(self.getWLANConfiguration3, 'actions.SetEnable') };
            self.wlan24.getInfo = soef.getProp(self.getWLANConfiguration, 'actions.GetInfo');
            self.wlan50.getInfo = soef.getProp(self.getWLANConfiguration2, 'actions.GetInfo');
            self.wlanGuest.getInfo = soef.getProp(self.getWLANConfiguration3, 'actions.GetInfo');
            self.wlan24.getSecurityKeys = soef.getProp(self.getWLANConfiguration, 'actions.GetSecurityKeys');
            self.wlan24.setSecurityKeys = soef.getProp(self.getWLANConfiguration, 'actions.SetSecurityKeys');
            self.wlan50.getSecurityKeys = soef.getProp(self.getWLANConfiguration2, 'actions.GetSecurityKeys');
            self.wlan50.setSecurityKeys = soef.getProp(self.getWLANConfiguration2, 'actions.SetSecurityKeys');
            self.wlanGuest.getSecurityKeys = soef.getProp(self.getWLANConfiguration3, 'actions.GetSecurityKeys');
            self.wlanGuest.setSecurityKeys = soef.getProp(self.getWLANConfiguration3, 'actions.SetSecurityKeys');
            if (!self.getWLANConfiguration3 || !self.wlanGuest.getInfo || !self.wlanGuest.setEnable) {
                self.wlanGuest.setEnable = self.wlan50.setEnable;
                self.wlanGuest.getInfo = self.wlan50.getInfo;
                self.wlanGuest.getSecurityKeys = self.wlan50.getSecurityKeys;
                self.wlanGuest.setSecurityKeys = self.wlan50.setSecurityKeys;
                delete self.wlan50;
            }

            self.voip = soef.getProp(self.sslDevice, 'services.urn:dslforum-org:service:X_VoIP:1.actions');

            // self.getSpecificHostEntry = self.hosts.actions.GetSpecificHostEntry;
            // self.getGenericHostEntry = self.hosts.actions.GetGenericHostEntry;
            // self.GetSpecificHostEntryExt = self.hosts.actions['X_AVM-DE_GetSpecificHostEntryExt'];

            self.getSpecificHostEntry = safeFunction(self, 'hosts.actions.GetSpecificHostEntry');
            self.getGenericHostEntry = safeFunction(self, 'hosts.actions.GetGenericHostEntry');
            self.GetSpecificHostEntryExt = safeFunction(self, 'hosts.actions.X_AVM-DE_GetSpecificHostEntryExt');
            self.GetChangeCounter = self.hosts.actions['X_AVM-DE_GetChangeCounter'];
            //self.hostsDoUpdate = self.hosts.actions ['X_AVM-DE_HostDoUpdate'];
            //self.hostsCheckUpdate = self.hosts.actions ['X_AVM-DE_HostCheckUpdate'];

            self.stateVariables = {};
            self.stateVariables.HostNumberOfEntries = self.hosts.stateVariables.HostNumberOfEntries;
            self.stateVariables.changeCounter = self.hosts.stateVariables['X_AVM-DE_ChangeCounter'];

            self.initIGDDevice(self.ip, self.port, function (err, device) {
                if (err) adapter.log.error('initIGDDevice:' + err + ' - ' + JSON.stringify(err));
                if (!err && device) {
                    getSSLDevice(device, function (err, sslDevice) {
                        if (err) adapter.log.error('getSSLDevice:' + err + ' - ' + JSON.stringify(err));
                        self.getExternalIPAddress = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.GetExternalIPAddress;
                        self.reconnectInternet = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.ForceTermination;
                    });
                }
            });
            self.getWLAN(soef.callbackOrTimeout(2000, callback));
        });
    //}.bind(this));
    });
};

function nop(err,res) {}

TR064.prototype.ring = function (val) {
    const self = this;
    const ar = val.split(',');
    if (!ar || ar.length < 1 || !this.voip) return;

    safeFunction(this.voip, 'X_AVM-DE_DialNumber', true) ({'NewX_AVM-DE_PhoneNumber': ar[0]}, function(err,data) {
        if (ar.length >= 2) {
            const duration = ar[1].trim() >> 0;
            setTimeout(function () {
                safeFunction(self.voip, 'X_AVM-DE_DialHangup', true) ({}, function (err,data) {
                });
            }, duration * 1000);
        }
    });
};

TR064.prototype.dialNumber = function (number, callback) {
    this.sslDevice.services['urn:dslforum-org:service:X_VoIP:1'].actions['X_AVM-DE_DialNumber']({
        'NewX_AVM-DE_PhoneNumber': number
    }, callback);
};



TR064.prototype.forEachHostEntry = function (callback) {
    const self = this;

    adapter.log.debug('forEachHostEntry');
    //self.hosts.actions.GetHostNumberOfEntries(function (err, obj) {
    safeFunction(self, 'hosts.actions.GetHostNumberOfEntries') (function (err, obj) {
        if (err) adapter.log.error('GetHostNumberOfEntries:' + err + ' - ' + JSON.stringify(err));
        if (err || !obj) return;
        const all = obj.NewHostNumberOfEntries >> 0;
        adapter.log.debug('forEachHostEntry: all=' + all);
        let cnt = 0;

        function doIt() {
            if (cnt >= all) {
                return;
            }
            //self.getGenericHostEntry({NewIndex: cnt}, function (err, obj) {
            safeFunction(self, 'getGenericHostEntry') ({NewIndex: cnt}, function (err, obj) {
                if (err) adapter.log.error('forEachHostEntry: in getGenericHostEntry ' + (cnt) + ':' + err + ' - ' + JSON.stringify(err));
                if (err || !obj) return;
                adapter.log.debug('forEachHostEntry cnt=' + cnt + ' ' + obj.NewHostName);
                callback(err, obj, cnt++, all);
                setTimeout(doIt, 10);
            });
        }

        doIt();
    });
};

TR064.prototype.forEachConfiguredDevice = function (callback) {
    let i = 0, self = this;
    adapter.log.debug('forEachConfiguredDevice');

    function doIt() {
        if (i >= adapter.config.devices.length) return callback && callback(null);
        const dev = adapter.config.devices[i++];
        if (dev.mac && dev.mac !== '') {
            safeFunction(self, 'getSpecificHostEntry') ({NewMACAddress: dev.mac}, function (err, device) {
            //self.getSpecificHostEntry({NewMACAddress: dev.mac}, function (err, device) {
            //self.GetSpecificHostEntryExt({NewMACAddress: dev.mac}, function (err, device) {
                if (err) adapter.log.error('forEachConfiguredDevice: in GetSpecificHostEntry ' + (i-1) + '(' + dev.name + '/' + dev.mac + '):' + err + ' - ' + JSON.stringify(err));
                if (!err && device) {
                    adapter.log.debug('forEachConfiguredDevice: i=' + (i-1) + ' ' + device.NewHostName + ' active=' + device.NewActive);
                    device.NewMACAddress = dev.mac;
                    callback (device);
                }
                setTimeout(doIt, 0);
            });
        } else {
            setTimeout(doIt, 0);
        }
    }
    doIt();
};


TR064.prototype.dumpServices = function (ar) {
    let fs;
    let doLog;

    if (ar && ar.length) switch (ar[1]) {
        case 'log':
            doLog = true;
            break;

        case 'fs':
            fs = require('fs');
            break;
    }
    const services = {};
    for (const service in this.sslDevice.services) {
        services[service] = { actions: {} };
        const oService = this.sslDevice.services[service];
        if (oService.actions) for (const action in oService.actions) {
            let v = oService.actions[action];
            v = typeof v === 'function' ? 'fn' : v;
            services[service].actions[action] = v;
            if (doLog) adapter.log.debug(service + '.actions.' + action);
        }
    }
    const dump = JSON.stringify(services);
    devStates.setImmediately(states.commandResult.name, dump);
    if (fs) {
        let logName = '';
        const controllerDir = require(__dirname + '/lib/utils').controllerDir;
        const parts = controllerDir.split('/');
        if (parts.length > 1 && parts[parts.length - 2] === 'node_modules') {
            parts.splice(parts.length - 2, 2);
            logName = parts.join('/');
            logName += '/log/tr-64-services.json';
        } else {
            logName = __dirname + '/../../log/tr-64-services.json';
        }
        try {
            fs.writeFileSync(logName, dump);
        } catch (e) {
            adapter.log.error('Cannot write file: ' + logName, dump);
        }
    }
};


TR064.prototype.command = function (command, callback) {
    if (command && command.toLowerCase().indexOf('dumpservices') === 0) {
        this.dumpServices(command.toLowerCase().split('.'));
        return;
    }
    let o;
    try {
        o = JSON.parse(command);
    } catch(e) {
        return;
    }   //xxx

    safeFunction(this.sslDevice.services, o.service + '.actions.' + o.action) (o.params, function (err, res) {
        if (err || !res) {
            adapter.setState(CHANNEL_STATES + '.' + states.commandResult.name, JSON.stringify(err||{}), true);
            return;
        }
        adapter.log.info(JSON.stringify(res));
        adapter.setState(CHANNEL_STATES + '.' + states.commandResult.name, JSON.stringify(res), true);
    });
};

TR064.prototype.setWLAN24 = function (val, callback) {
    safeFunction(this.wlan24, 'setEnable', true) ({NewEnable: val ? 1 : 0 }, callback);
};

TR064.prototype.setWLAN50 = function (val, callback) {
    if (!this.wlan50 || !this.wlan50.setEnable) return;
    const self = this;
    safeFunction (this.wlan50, 'setEnable', true) ({NewEnable: val ? 1 : 0 }, function (err, result) {
        if (err) adapter.log.error('getWLANConfiguration2: ' + err + ' - ' + JSON.stringify(err));
        //if (!val) setTimeout(function (err, res) {
        //    self.setWLAN(true, function (err, res) {
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
        if (err) adapter.log.error('setWLAN24: ' + err + ' - ' + JSON.stringify(err));
        if (err || !result) return callback(-1);
        self.setWLANGuest(val, function (err, result) {
            if (err) adapter.log.error('setWLANGuest: ' + err + ' - ' + JSON.stringify(err));
            self.setWLAN50(val, callback);
        });
    });
};


TR064.prototype.setWLANPassword = function (kind, pw, cb) {
    const self = this;
    if (!soef.hasProp(self, kind + '.getSecurityKeys')) return cb && cb(-1);

    self[kind].getSecurityKeys (function (err, ret) {
        if (err || !ret || ret.NewKeyPassphrase === pw) return cb && cb(err,ret);
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


TR064.prototype.setWPSMode = function (modeOrOnOff, callback) {
    let mode = modeOrOnOff;
    if (typeof modeOrOnOff === 'boolean') mode = modeOrOnOff ? 'pbc' : 'stop';

    this.getWLANConfiguration.actions['X_AVM-DE_SetWPSConfig']({
        'NewX_AVM-DE_WPSMode': mode,
        'NewX_AVM-DE_WPSClientPIN': ''
    }, function (err, obj) {
        this.getWLANConfiguration.actions['X_AVM-DE_GetWPSInfo'](function (err, obj) {
            if (err) adapter.log.error('X_AVM-DE_GetWPSInfo error: ' + err);
        });
    }.bind(this));
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const errorCounts = {};

function _checkError(err, res) {
    if (err) {
        const code = err.code ? err.code : 'unknown error code';
        if (errorCounts[code] && (new Date().getTime() - errorCounts[code]) > /*24**/60 * 60 * 1000) {
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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

TR064.prototype.getWLAN = function (callback) {
    //safeFunction(this.wlan24, 'getInfo', true)(checkError(callback));
    safeFunction(this.wlan24, 'getInfo', true)(callback);
};

TR064.prototype.getWLAN5 = function (callback) {
    if (!this.wlan50 || !this.wlan50.getInfo) return;
    safeFunction(this.wlan50, 'getInfo', true)(callback);
};

TR064.prototype.getWLANGuest = function (callback) {
    safeFunction(this.wlanGuest, 'getInfo', true)(callback);
};



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function isKnownMac(mac) {
    return !!adapter.config.devices.find(function (v) { return v.mac === mac;} );
}

// function deleteUnusedDevices(callback) {
//     var ch = adapter.namespace + '.' + CHANNEL_DEVICES;
//     adapter.getObjectView('system', 'state', { startkey: ch + '.', endkey: ch + '.\u9999' }, function (err, res) {
//         if (err || !res) return;
//         var toDelete = [];
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

function deleteUnusedDevices(callback) {
    const ch = adapter.namespace + '.' + CHANNEL_DEVICES;
    adapter.getObjectView('system', 'state', { startkey: ch + '.', endkey: ch + '.\u9999' }, function (err, res) {
        if (err || !res) return;
        const toDelete = [];
        res.rows.forEach (function (o) {
            let doDelete = ((!o.value.native || !o.value.native.mac) && o.id.substr (ch.length + 1).indexOf ('.') < 0); // old device, without native.mac
            doDelete = doDelete || (o.value.native && o.value.native.mac && !isKnownMac (o.value.native.mac));
            // doDelete = doDelete ||  (!adapter.config.devices.find(function(v) {
            //     return v.mac === o.value.native.mac;
            // }));
            if (doDelete) toDelete.push(o.id);
        });
        forEachArrayCallback (toDelete, callback, function (id, next) {
            dcs.del (id, function (err) {
                next ();
            });
        });
    });
}


function setActive(dev, val, ip, mac) {
    val = !!(val >> 0);

    if (ip !== undefined && ipActive[ip] !== val) ipActive[ip] = val;
    if (!dev.set('active', val)) return; // state not changed;
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

function updateAll(cb) {
    adapter.log.debug('in updateAll');
    const names = [
        { func: 'getExternalIPAddress', state: states.externalIP.name, result: 'NewExternalIPAddress', format: function (val) { return val; }},
        { func: 'getWLAN', state: states.wlan24.name, result: 'NewEnable', format: function (val) { return !!(val >> 0);}},
        { func: 'getWLAN5', state: states.wlan50.name, result: 'NewEnable', format: function (val) { return !!(val >> 0);}},
        { func: 'getWLANGuest', state: states.wlanGuest.name, result: 'NewEnable', format: function (val) { return !!(val >> 0);}}
        //{ func: 'setABIndex', state: states.abIndex.name, result: 'NewEnable' }
    ];
    let i = 0;

    function doIt() {
        if (i >= names.length) {
            devStates.set('reboot', false);
            devices.update(function (err) {
                if (err && err !== -1) adapter.log.error('updateAll:' + err);
                updateDeflections(soef.callbackOrTimeout(3000, function() {
                    if (adapter.config.pollingInterval) {
                        if (pollingTimer) clearTimeout(pollingTimer);
                        pollingTimer = setTimeout(updateAll, adapter.config.pollingInterval*1000);
                    }
                }));
            });
            return;
        }

        const name = names[i++];
        if (typeof tr064Client[name.func] !== 'function') {
            return doIt();
        }

        tr064Client[name.func] ( soef.callbackOrTimeout (3000, function (err, res) {
            if (!err && res) {
                devStates.set(name.state, name.format ? name.format(res[name.result]) : name.result);
            }
            setTimeout(doIt, 10);
        }));

    }
    tr064Client.setABIndex();
    adapter.config.useDevices ? updateDevices(doIt) : doIt();
}


function runMDNS () {
    if (!adapter.config.useMDNS) return;
    const dev = new devices.CDevice(CHANNEL_DEVICES, '');
    const mdns = require('mdns-discovery')();

    mdns.on ('message', function (message, rinfo) {
        if (!message || !rinfo) return;
        if (ipActive[rinfo.address] !== false) return;
        ipActive[rinfo.address] = true;
        // if (rinfo.address === '192.168.1.41') {
        //     var xyz = 1;
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
    if (!adapter.config.calllists) adapter.config.calllists = adapter.ioPack.native.calllists;
    calllist.normalizeConfig (adapter.config.calllists);

    adapter.config.pollingInterval = adapter.config.pollingInterval >> 0;
    adapter.config.port = adapter.config.port >> 0;
    adapter.config.useCallMonitor = !!(adapter.config.useCallMonitor >> 0);
    adapter.config.useDevices = !!(adapter.config.useDevices >> 0);
    adapter.config.usePhonebook = !!(adapter.config.usePhonebook >> 0);
    if (adapter.config.useMDNS === undefined) adapter.config.useMDNS = true;
    if (adapter.config.useDeflectionOptions === undefined) adapter.config.useDeflectionOptions = true;
}

function main() {
    module.exports.adapter = adapter;
    devStates = new devices.CDevice(0, '');
    devStates.setDevice(CHANNEL_STATES, {common: {name: 'States and commands', role: 'device'}, native: {} });

    normalizeConfigVars();
    systemData.load();
    deleteUnusedDevices();
    calllist.init(adapter, systemData);

    tr064Client = new TR064(adapter.config.user, adapter.config.password, adapter.config.ip);
    tr064Client.init(function (err) {
        initError = err;
        if (err) {
            adapter.log.error(err + ' - ' + JSON.stringify(err));
            adapter.log.error('~');
            adapter.log.error('~~ Fatal error. Can not connect to your FritzBox.');
            adapter.log.error('~~ If configuration, networt, IP address, etc. ok, try to restart your FritzBox');
            adapter.log.error('~');
            setTimeout(function() {
                process.exit(1);
            }, 5000);
            return;
        }
        tr064Client.refreshCalllist(); //xxx
        createObjects();
        createConfiguredDevices(function (err) {
            phonebook.start(tr064Client.sslDevice, { return: !adapter.config.usePhonebook, adapter: adapter }, function () {
                if (pollingTimer) clearTimeout(pollingTimer);
                pollingTimer = setTimeout(updateAll, 2000);
                //adapter.log.debug('Final Phonebook: ' + JSON.stringify(phonebook));
                callMonitor(adapter, devices, phonebook);
                runMDNS();
            });
        });
        if (adapter.config.useDeflectionOptions) {
            deflections = new Deflections (tr064Client.sslDevice, adapter, devices);
        }
    });

    adapter.subscribeStates('*');
}

//http://192.168.1.1:49000/tr64desc.xml
//npm install https://github.com/soef/ioBroker.tr-064/tarball/master --production