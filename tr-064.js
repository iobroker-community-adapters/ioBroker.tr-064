"use strict";

var utils     = require(__dirname + '/lib/utils'),
    soef      = require(__dirname + '/lib/soef'),
    phonebook = require(__dirname + '/lib/phonebook'),
    util      = require("util"),
    tr064Lib  = require("tr-O64");


var tr064Client;
var commandDesc = 'eg. { "service": "urn:dslforum-org:service:WLANConfiguration:1", "action": "X_AVM-DE_SetWPSConfig", "params": { "NewX_AVM-DE_WPSMode": "pbc", "NewX_AVM-DE_WPSClientPIN": "" } }';
var debug = false;

var adapter = utils.adapter({
    name: 'tr-064',

    unload: function (callback) {
        try {
            callback();
        } catch (e) {
            callback();
        }
    },
    //discover: function (callback) {
    //},
    //install: function (callback) {
    //},
    //uninstall: function (callback) {
    //},
    objectChange: function (id, obj) {
    },
    stateChange: function (id, state) {
        if (state && !state.ack) {
            onStateChange(id, state);
        }
    },
    message: onMessage,
    ready: function () { soef.main (adapter, main) }
});


const STATES_NAME = 'states';
const CALLMONITOR_NAME = 'callmonitor';

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
    if ((as[0] + '.' + as[1] != adapter.namespace) || (as[2] !== STATES_NAME)) return;
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

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
        device.startEncryptedCommunication(function(err, sslDevice) {
            if (err || !sslDevice) callback(err);
            sslDevice.login(self.user, self.password);
            callback(null, sslDevice);
        });
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
                if (!err && device) {
                    getSSLDevice(device, function(err, sslDevice) {
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
        if (err || !obj) return;
        var all = obj.NewHostNumberOfEntries >> 0;
        adapter.log.debug('forEachHostEntry: all=' + all);
        var cnt = 0;

        function doIt() {
            if (cnt >= all) {
                return;
            }
            self.getGenericHostEntry({NewIndex: cnt}, function (err, obj) {
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
            return;
        }
        var dev = adapter.config.devices[i++];
        if (dev.mac && dev.mac != "") {
            self.getSpecificHostEntry({NewMACAddress: dev.mac}, function (err, device) {
            //self.GetSpecificHostEntryExt({NewMACAddress: dev.mac}, function (err, device) {
                //adapter.log.debug('forEachConfiguredDevice: in GetSpecificHostEntryExt ' + (err?err.message:""));
                if (!err && device) {
                    adapter.log.debug('forEachConfiguredDevice: i=' + (i-1) + ' ' + device.NewHostName + ' active=' + device.NewActive);
                    device.NewMACAddress = dev.mac;
                    callback (device, i >= adapter.config.devices.length);
                }
                setTimeout(doIt, 0);
            })
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
        adapter.log.info(JSON.stringify(res));
        adapter.setState(states.states.name + '.' + states.commandResult.name, JSON.stringify(res), true);
    });
};

TR064.prototype.setWLAN24 = function (val, callback) {
    this.getWLANConfiguration.actions.SetEnable({ 'NewEnable': val ? 1 : 0 }, callback);
};

TR064.prototype.setWLAN50 = function (val, callback) {
    var self = this;
    this.getWLANConfiguration2.actions.SetEnable({ 'NewEnable': val ? 1 : 0 }, function (err, result) {
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
        if (err || !result) return callback(-1);
        self.setWLANGuest(val, function (err, result) {
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


TR064.prototype.getWLAN = function (callback) {
    this.getWLANConfiguration.actions.GetInfo(callback);
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

function deleteUnavilableDevices(callback) {

    var ch = adapter.namespace + '.' + states.devices;
    //var count = 0;

    adapter.objects.getObjectView('system', 'state', { startkey: ch + '.', endkey: ch + '.\u9999' }, function (err, res) {
        //if (err) return;
    });
}

function setActive(dev, val) {
    val = !!(val >> 0);
    if (!dev.set('active', val)) return; // state not changed;
    var ts = adapter.formatDate(new Date(), "DD.MM.YYYY - hh:mm:ss");
    val ? dev.set('lastActive', ts) : dev.set('lastInactive', ts);
    dev.set('', val);
}

function createConfiguredDevices(callback) {
    adapter.log.debug('createConfiguredDevices');
    var dev = new devices.CDevice('devices', '');
    tr064Client.forEachConfiguredDevice(function(device, isLast) {
        dev.setChannel(device.NewHostName, device.NewHostName + ' (' + device.NewIPAddress + ')');
        setActive(dev, device.NewActive);
        //dev.set('mac', device.NewMACAddress);
        //dev.set('ip', device.NewIPAddress);
        //dev.set('type', device.NewInterfaceType);
        if (isLast) {
            devices.update(callback);
        }
    });
}

function updateDevices(callback) {
    adapter.log.debug('updateDevices');
    var dev = new devices.CDevice('devices', '');

    tr064Client.forEachConfiguredDevice(function(device, isLast) {
        dev.setChannel(device.NewHostName);
        setActive(dev, device.NewActive);
        if (isLast) {
            devices.update(callback);
        }
    });
}

function updateAll(cb) {
    adapter.log.debug('in updateAll');
    const names = [
        { func: 'getExternalIPAddress', state: states.externalIP.name, result: 'NewExternalIPAddress', format: function(val) { return val }},
        { func: 'getWLAN', state: states.wlan24.name, result: 'NewEnable', format: function(val) { return !!(val >> 0)}},
        { func: 'getWLAN5', state: states.wlan50.name, result: 'NewEnable', format: function(val) { return !!(val >> 0)}},
        { func: 'getWLANGuest', state: states.wlanGuest.name, result: 'NewEnable', format: function(val) { return !!(val >> 0)}}
    ];
    var i = 0;

    function doIt() {
        if (i >= names.length) {
            devStates.set('reboot', false);
            devices.update(function(err) {
                if (adapter.config.pollingInterval) {
                    setTimeout(updateAll, adapter.config.pollingInterval*1000);
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


function callMonitor() {
    if (!adapter.config.useCallMonitor) return;
    adapter.log.debug('starting callmonitor');

    var net = require('net');
    var connections = {};
    var timeout;

    var client = new net.Socket();
    client.on('connect', function () {
         adapter.log.debug('callmonitor connected')  ;
    });

    client.on('close', function (hadError) {
        if (hadError) {
        } else {
        }
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(client.connect, 5000, { host: adapter.config.ip, port: 1012 });
    });

    client.on('data', function (data) {
        var raw = data.toString();
        var array = raw.split(";");
        var type = array[1];
        var id = array[2];
        var timestamp = array[0];
        var message;
        //var dev = new devices.CDevice(0, '');
        //dev.setDevice(CALLMONITOR_NAME, {common: {name: CALLMONITOR_NAME, role: 'channel'}, native: {} });
        var dev = new devices.CDevice(CALLMONITOR_NAME, '');
        var timer = null;

        function set(name) {
            if (timer) cancelTimeout(timer);
            dev.setChannel(name, name);
            for (var i in message) {
                if (i[0] != '_') dev.set(i, message[i]);
            }
            dev.set('timestamp', timestamp);
            message._type = name;
            if (adapter.config.usePhonebook) {
                if (message.callerName == undefined && message.caller) {
                    message.callerName = phonebook.findNumber(message.caller);
                }
                dev.set('callerName', message.callerName);
            }
            adapter.log.debug('callMonitor: caller=' + message.caller + ' callee=' + message.callee + (message.callerName ? ' callerName=' + message.callerName : ''));
            timer = setTimeout(function() {
                devices.update();
            }, 500);
        }

        switch (type) {
            case "CALL":
                message = { caller: array[4], callee: array[5], extension: array[3] };
                connections[id] = message;
                set('outbound');
                break;
            case "RING":
                message = { caller: array[3], callee: array[4] };
                connections[id] = message;
                set('inbound');
                break;
            case "CONNECT":
                message = connections[id];
                if (!message) break;
                message.extension = array[3];
                set('connect');
                break;
            case "DISCONNECT":
                message = connections[id];
                if (!message) break;
                switch (message._type) {
                    case "inbound":
                        message.type = "missed";
                        break;
                    case "connect":
                        message.type = "disconnect";
                        break;
                    case "outbound":
                        message.type = "unreached";
                        break;
                }
                message.duration = array[3] >> 0;
                //set('disconnect');
                set('lastCall');
                delete connections[id];
                break;
        }
    });
    client.connect({host: adapter.config.ip, port: 1012});
}

function main() {

    devStates = new devices.CDevice(0, '');
    devStates.setDevice(STATES_NAME, {common: {name: STATES_NAME, role: 'channel'}, native: {} });

    normalizeConfigVars();
    createObjects();

    tr064Client = new TR064(adapter.config.user, adapter.config.password, adapter.config.ip);
    tr064Client.init(function (err) {
        if (err) return;
        createConfiguredDevices(function(err) {
            phonebook.start(tr064Client.sslDevice, { return: !adapter.config.usePhonebook }, function() {
                updateAll();
                callMonitor();
            });
        });
    });

    adapter.subscribeStates('*');
}

