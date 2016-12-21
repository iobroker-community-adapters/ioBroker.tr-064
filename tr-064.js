/*jshint esversion: 6 */
/*jslint node: true */
'use strict';

/* global devices */
var //utils       = require(__dirname + '/lib/utils'),
    phonebook   = require(__dirname + '/lib/phonebook'),
    callMonitor = require(__dirname + '/lib/callmonitor'),
    soef        = require('soef'),
    util        = require("util"),
    tr064Lib    = require("tr-O64");

var tr064Client;
var commandDesc = 'eg. { "service": "urn:dslforum-org:service:WLANConfiguration:1", "action": "X_AVM-DE_SetWPSConfig", "params": { "NewX_AVM-DE_WPSMode": "pbc", "NewX_AVM-DE_WPSClientPIN": "" } }';
var debug = false;
var pollingTimer = null;

var adapter = soef.Adapter(
    onStateChange,
    main,
    onMessage,
    {
        name: 'tr-064'
    }
);

//var adapter = utils.adapter({
//    name: 'tr-064',
//
//    unload: function (callback) {
//        try {
//            callback();
//        } catch (e) {
//            callback();
//        }
//    },
//    //discover: function (callback) {
//    //},
//    //install: function (callback) {
//    //},
//    //uninstall: function (callback) {
//    //},
//    objectChange: function (id, obj) {
//    },
//    stateChange: function (id, state) {
//        if (state && !state.ack) {
//            onStateChange(id, state);
//        }
//    },
//    message: onMessage,
//    ready: function () { soef.main (adapter, main) }
//});


const CHANNEL_STATES = 'states',
      CHANNEL_DEVICES = 'devices';

var devStates;
var allDevices = [];


var states = {
    wps:               { name: "wps",               val: false, common: { min: false, max: true }, native: { func: 'setWPSMode' }},
    wlan:              { name: "wlan",              val: false, common: { min: false, max: true }, native: { func: 'setWLAN' }},
    wlan24:            { name: 'wlan24',            val: true,  common: { min: false, max: true }, native: { func: 'setWLAN24' }},
    wlan50:            { name: 'wlan50',            val: true,  common: { min: false, max: true }, native: { func: 'setWLAN50' }},
    wlanGuest:         { name: 'wlanGuest',         val: true,  common: { min: false, max: true }, native: { func: 'setWLANGuest' }},
    //dialNumber:        { name: 'dialNumber',        val: "" },
    //stopDialing:       { name: 'stopDialing',       val: "" },
    reconnectInternet: { name: 'reconnectInternet', val: false, common: { min: false, max: true }, native: { func: 'reconnectInternet' }  },
    command:           { name: 'command',           val: "",    native: { func: 'command', desc: commandDesc }},
    commandResult:     { name: 'commandResult',     val: "",    common: { write: false }},
    externalIP:        { name: 'externalP',         val: '',    common: { write: false}},
    reboot:            { name: 'reboot',            val: false, common: { min: false, max: true }, native: { func: 'reboot' }  }
    //bytesTransfered:   { name: 'bytesTransfered', val: 0 },
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

String.prototype.normalizeNumber = function () {
    return this.replace (/\+/g, '00').replace(/[^0-9\*]/g, '');
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createObjects() {
    for (var i in states) {
        var st = Object.assign({}, states[i]);
        devStates.createNew(st.name, st);
    }
    devices.update();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onMessage (obj) {
    if (!obj) return;

    function reply(result) {
        adapter.sendTo (obj.from, obj.command, JSON.stringify(result), obj.callback);
    }

    switch (obj.command) {
        case 'discovery':
            if (!obj.callback) return false;
            //reply( { error: { message: "fehler..." }});
            //return;
            if (allDevices.length > 0) {
                reply(allDevices);
                return true;
            }
            tr064Client.forEachHostEntry(function (err, device, cnt, all) {
                allDevices.push({
                    name: device.NewHostName,
                    ip: device.NewIPAddress,
                    mac: device.NewMACAddress
                });
                if (cnt+1 >= all) {
                    reply(allDevices);
                }
            });
            return true;
        default:
            adapter.log.warn("Unknown command: " + obj.command);
            break;
    }
    if (obj.callback) adapter.sendTo (obj.from, obj.command, obj.message, obj.callback);
    return true;
}


function onStateChange (id, state) {
    var as = id.split('.');
    if ((as[0] + '.' + as[1] != adapter.namespace) || (as[2] !== CHANNEL_STATES)) return;
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    //var dev = devices.get (id.substr(adapter.namespace.length+1));
    var func = states [as[3]] && states [as[3]].native ? states [as[3]].native.func : null;

    if (func && tr064Client[func]) {
        tr064Client[func] (state.val, function (err, res) {
        });
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var TR064 = function (user, password, iporhost, port) {
    tr064Lib.TR064.call(this);
    this.ip = iporhost;
    this.port = 49000 || port;
    this.user = user;
    this.password = password;
};
TR064.prototype = Object.create(tr064Lib.TR064.prototype);

//TR064.prototype.startTransaction = function (callback) {
//    callback (null, this.sslDevice);
//    //this.sslDevice.startTransaction(callback);
//};
//
//TR064.prototype.stopTransaction = function (callback) {
//    callback (null, this.sslDevice);
//    //this.sslDevice.startTransaction(callback);
//};

function resetAuth(device) {
    device.logout();
    device._auth.auth = null;
}

TR064.prototype.init = function (callback) {
    var self = this;

    function getSSLDevice(device, callback) {
        return callback(null, device);
/*        device.startEncryptedCommunication(function(err, sslDevice) {
            if (err || !sslDevice) callback(err);
            sslDevice.login(self.user, self.password);
            callback(null, sslDevice);
        });*/
    }

    self.initTR064Device(self.ip, self.port, function (err, device) {
        if (err || !device) return (callback(err));
        getSSLDevice(device, function (err, sslDevice) {
            if (err || !sslDevice) return callback(err);
            sslDevice.login(self.user, self.password);
            self.sslDevice = sslDevice;
            self.hosts = sslDevice.services["urn:dslforum-org:service:Hosts:1"];
            self.getWLANConfiguration = sslDevice.services["urn:dslforum-org:service:WLANConfiguration:1"];
            self.getWLANConfiguration2 = sslDevice.services["urn:dslforum-org:service:WLANConfiguration:2"];
            self.reboot = sslDevice.services["urn:dslforum-org:service:DeviceConfig:1"].actions.Reboot;
            self.getConfigFile = sslDevice.services["urn:dslforum-org:service:DeviceConfig:1"].actions['X_AVM-DE_GetConfigFile'];  //in: NewX_AVM-DE_Password, NewX_AVM-DE_ConfigFileUrl
            //self.WANIPConnection = sslDevice.services["urn:dslforum-org:service:WANIPConnection:1"];

            self.getSpecificHostEntry = self.hosts.actions.GetSpecificHostEntry;
            self.getGenericHostEntry = self.hosts.actions.GetGenericHostEntry;
            self.GetSpecificHostEntryExt = self.hosts.actions['X_AVM-DE_GetSpecificHostEntryExt'];
            self.GetChangeCounter = self.hosts.actions['X_AVM-DE_GetChangeCounter'];
            //self.hostsDoUpdate = self.hosts.actions ['X_AVM-DE_HostDoUpdate'];
            //self.hostsCheckUpdate = self.hosts.actions ['X_AVM-DE_HostCheckUpdate'];


            self.stateVariables = {};
            self.stateVariables.HostNumberOfEntries = self.hosts.stateVariables.HostNumberOfEntries;
            self.stateVariables.changeCounter = self.hosts.stateVariables['X_AVM-DE_ChangeCounter'];

            self.initIGDDevice(self.ip, self.port, function (err, device) {
                if (err) adapter.log.error('initIGDDevice:' + err + ' - ' + JSON.stringify(err));
                if (!err && device) {
                    getSSLDevice(device, function(err, sslDevice) {
                        if (err) adapter.log.error('getSSLDevice:' + err + ' - ' + JSON.stringify(err));
                        self.getExternalIPAddress = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.GetExternalIPAddress;
                        self.reconnectInternet = sslDevice.services['urn:schemas-upnp-org:service:WANIPConnection:1'].actions.ForceTermination;
                    });
                }
            });
            callback (0);
        });
    });
};

function nop(err,res) {}

TR064.prototype.forEachHostEntry = function (callback) {
    var self = this;

    adapter.log.debug('forEachHostEntry');
    self.hosts.actions.GetHostNumberOfEntries(function (err, obj) {
        if (err) adapter.log.error('GetHostNumberOfEntries:' + err + ' - ' + JSON.stringify(err));
        if (err || !obj) return;
        var all = obj.NewHostNumberOfEntries >> 0;
        adapter.log.debug('forEachHostEntry: all=' + all);
        var cnt = 0;

        function doIt() {
            if (cnt >= all) {
                return;
            }
            self.getGenericHostEntry({NewIndex: cnt}, function (err, obj) {
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
    var i = 0;
    var self = this;
    adapter.log.debug('forEachConfiguredDevice');

    function doIt() {
        if (i >= adapter.config.devices.length) {
            callback (null, true); // make sure to call callback also when last device is not successfull
            return;
        }
        var dev = adapter.config.devices[i++];
        if (dev.mac && dev.mac !== "") {
            self.getSpecificHostEntry({NewMACAddress: dev.mac}, function (err, device) {
            //self.GetSpecificHostEntryExt({NewMACAddress: dev.mac}, function (err, device) {
                if (err) adapter.log.error('forEachConfiguredDevice: in GetSpecificHostEntryExt ' + (i-1) + '(' + dev.name + '/' + dev.mac + '):' + err + ' - ' + JSON.stringify(err));
                if (!err && device) {
                    adapter.log.debug('forEachConfiguredDevice: i=' + (i-1) + ' ' + device.NewHostName + ' active=' + device.NewActive);
                    device.NewMACAddress = dev.mac;
                    callback (device, i >= adapter.config.devices.length);
                    if (i >= adapter.config.devices.length) return;
                }
                setTimeout(doIt, 0);
            });
        } else {
            setTimeout(doIt, 0);
        }
    }
    doIt();
};


TR064.prototype.command = function (command, callback) {
    var o = JSON.parse(command);
    this.sslDevice.services[o.service].actions[o.action](o.params, function (err, res) {
        if (err || !res) return;
        adapter.setState(states.states.name + '.' + states.commandResult.name, JSON.stringify(res), true);
    });
};

TR064.prototype.setWLAN24 = function (val, callback) {
    this.getWLANConfiguration.actions.SetEnable({ 'NewEnable': val ? 1 : 0 }, callback);
};

TR064.prototype.setWLAN50 = function (val, callback) {
    var self = this;
    this.getWLANConfiguration2.actions.SetEnable({ 'NewEnable': val ? 1 : 0 }, function (err, result) {
        if (err) adapter.log.error('getWLANConfiguration2:' + err + ' - ' + JSON.stringify(err));
        //if (!val) setTimeout(function (err, res) {
        //    self.setWLAN(true, function (err, res) {
        //    });
        //}, 20000);
    });
};

TR064.prototype.setWLANGuest = function (val, callback) {
    this.sslDevice.services["urn:dslforum-org:service:WLANConfiguration:3"].actions.SetEnable({ 'NewEnable': val ? 1 : 0 }, callback);
};

TR064.prototype.setWLAN = function (val, callback) {
    var self = this;
    this.setWLAN24(val, function (err, result) {
        if (err) adapter.log.error('setWLAN24:' + err + ' - ' + JSON.stringify(err));
        if (err || !result) return callback(-1);
        self.setWLANGuest(val, function (err, result) {
            if (err) adapter.log.error('setWLANGuest:' + err + ' - ' + JSON.stringify(err));
            self.setWLAN50(val, callback);
        });
    });
};

TR064.prototype.setWPSMode = function (modeOrOnOff, callback) {
    var mode = modeOrOnOff;
    if (typeof modeOrOnOff == 'boolean') mode = modeOrOnOff ? "pbc" : "stop";
    var self = this;
    self.getWLANConfiguration.actions["X_AVM-DE_SetWPSConfig"]({ "NewX_AVM-DE_WPSMode": mode, "NewX_AVM-DE_WPSClientPIN": "" }, function (err, obj) {
        self.getWLANConfiguration.actions["X_AVM-DE_GetWPSInfo"](function (err, obj) {
        });
    });
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var errorCounts = {};

function _checkError(err, res) {
    if (err) {
        var code = err.code ? err.code : 'unknown error code';
        if (errorCounts [code] && (new Date().getTime()-errorCounts [code])>/*24**/60*60*1000) {
            delete(errorCounts [code]);
        }
        if (!errorCounts [code]) {
            var msg = err.message ? err.message : 'unknown error text';
            switch (code >> 0) {
                case 401:
                    msg = 'Authentication error. Check username and password in configuration';
                    break;
            }
            adapter.log.error('code=' + code + ' ' + msg);
            errorCounts [code] = new Date().getTime();
        }
    }
    /* jshint validthis: true */
    this (err, res);
}

function checkError(cb) {
    return _checkError.bind(cb);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

TR064.prototype.getWLAN = function (callback) {
    //this.getWLANConfiguration.actions.GetInfo(callback);
    this.getWLANConfiguration.actions.GetInfo(checkError(callback));
};

TR064.prototype.getWLAN5 = function (callback) {
    this.getWLANConfiguration2.actions.GetInfo(callback);
};

TR064.prototype.getWLANGuest = function (callback) {
    this.sslDevice.services["urn:dslforum-org:service:WLANConfiguration:3"].actions.GetInfo(callback);
};

TR064.prototype.dialNumber = function (number, callback) {
    this.sslDevice.services["urn:dslforum-org:service:X_VoIP:1"].actions["X_AVM-DE_DialNumber"]({ "NewX_AVM-DE_PhoneNumber": number }, callback);
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function isKnownMac(mac) {
    return !!adapter.config.devices.find(function(v) { return v.mac === mac;} );
}

function deleteUnusedDevices(callback) {
    var ch = adapter.namespace + '.' + CHANNEL_DEVICES;
    adapter.objects.getObjectView('system', 'state', { startkey: ch + '.', endkey: ch + '.\u9999' }, function (err, res) {
        if (err || !res) return;
        var toDelete = [];
        res.rows.forEach(function(o){
            if ((!o.value.native || !o.value.native.mac) && o.id.substr(ch.length+1).indexOf('.') < 0) { // old device, without native.mac
                toDelete.push(o.id);
            }
            if (o.value.native && o.value.native.mac && !isKnownMac(o.value.native.mac)) {
                toDelete.push(o.id);
            }
        });
        toDelete.forEach(function (id) {
            adapter.log.debug('deleting ' + id);
            res.rows.forEach(function(o) {
                if (o.id.indexOf(id) === 0) {
                    devices.remove(o.id.substr(adapter.namespace.length+1));
                    adapter.states.delState(o.id, function(err, obj) {
                         adapter.objects.delObject(o.id);
                    });
                }
            });
        });
    });
}

function setActive(dev, val) {
    val = !!(val >> 0);

    if (!dev.set('active', val)) return; // state not changed;
    //var ts = adapter.formatDate(new Date(), "DD.MM.YYYY - hh:mm:ss");
    var dts = new Date();
    var sts =  dts.toLocaleString();
    var ts = (dts.getTime() / 1000) >> 0;
    if (val) {
        dev.set('lastActive', sts);
        dev.set('lastActive-ts', ts);
    } else {
        dev.set('lastInactive', sts);
        dev.set('lastInactive-ts', ts);
    }
    dev.set('', val);
}

function createConfiguredDevices(callback) {
    adapter.log.debug('createConfiguredDevices');
    var dev = new devices.CDevice(CHANNEL_DEVICES, '');
    tr064Client.forEachConfiguredDevice(function(device, isLast) {
        if (device) {
            dev.setChannelEx(device.NewHostName, { common: { name: device.NewHostName + ' (' + device.NewIPAddress + ')', role: 'channel' }, native: { mac: device.NewMACAddress }} );
            setActive(dev, device.NewActive);
        }
        if (isLast) {
            devices.update(callback);
        }
    });
}

function updateDevices(callback) {
    adapter.log.debug('updateDevices');
    var dev = new devices.CDevice(CHANNEL_DEVICES, '');

    tr064Client.forEachConfiguredDevice(function(device, isLast) {
        adapter.log.debug('forEachConfiguredDevice: ' + JSON.stringify(device) + ', last=' + isLast);
        if (device) {
            dev.setChannelEx(device.NewHostName);
            setActive(dev, device.NewActive);
        }
        if (isLast) {
            devices.update(callback);
        }
    });
}

function updateAll(cb) {
    adapter.log.debug('in updateAll');
    const names = [
        { func: 'getExternalIPAddress', state: states.externalIP.name, result: 'NewExternalIPAddress', format: function(val) { return val; }},
        { func: 'getWLAN', state: states.wlan24.name, result: 'NewEnable', format: function(val) { return !!(val >> 0);}},
        { func: 'getWLAN5', state: states.wlan50.name, result: 'NewEnable', format: function(val) { return !!(val >> 0);}},
        { func: 'getWLANGuest', state: states.wlanGuest.name, result: 'NewEnable', format: function(val) { return !!(val >> 0);}}
    ];
    var i = 0;

    function doIt() {
        if (i >= names.length) {
            devStates.set('reboot', false);
            devices.update(function(err) {
                if (err && err !== -1) adapter.log.error('updateAll:' + err);
                if (adapter.config.pollingInterval) {
                    if (pollingTimer) clearTimeout(pollingTimer);
                    pollingTimer = setTimeout(updateAll, adapter.config.pollingInterval*1000);
                }
            });
            return;
        }

        var name = names[i++];
        if (!tr064Client[name.func]) {
            return doIt();
        }
        tr064Client[name.func] ( function (err, res) {
            if (!err && res) {
                devStates.set(name.state, name.format ? name.format(res[name.result]) : name.result);
            }
            setTimeout(doIt, 10);
        });
    }
    if (adapter.config.useDevices) updateDevices(doIt);
    else doIt();
}


function normalizeConfigVars() {
    adapter.config.pollingInterval = adapter.config.pollingInterval >> 0;
    adapter.config.port = adapter.config.port >> 0;
    adapter.config.useCallMonitor = !!(adapter.config.useCallMonitor >> 0);
    adapter.config.useDevices = !!(adapter.config.useDevices >> 0);
    adapter.config.usePhonebook = !!(adapter.config.usePhonebook >> 0);
}


function main() {

    devStates = new devices.CDevice(0, '');
    devStates.setDevice(CHANNEL_STATES, {common: {name: CHANNEL_STATES, role: 'channel'}, native: {} });

    normalizeConfigVars();
    deleteUnusedDevices();
    setTimeout(createObjects, 2000);

    tr064Client = new TR064(adapter.config.user, adapter.config.password, adapter.config.ip);
    tr064Client.init(function (err) {
        if (err) {
            adapter.log.error('main - init:' + err + ' - ' + JSON.stringify(err));
            return;
        }
        createConfiguredDevices(function(err) {
            phonebook.start(tr064Client.sslDevice, { return: !adapter.config.usePhonebook }, function() {
                if (pollingTimer) clearTimeout(pollingTimer);
                pollingTimer = setTimeout(updateAll, 2000);
                callMonitor(adapter, devices, phonebook);
            });
        });
    });

    adapter.subscribeStates('*');
}
