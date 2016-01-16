"use strict";

var utils = require(__dirname + '/lib/utils');
var util  = require("util");
var tr    = require("tr-064");

var adapter = utils.adapter('tr-064');
var tr064 = new tr.TR064();
var trclient;
var commandDesc = 'eg. { "service": "urn:dslforum-org:service:WLANConfiguration:1", "action": "X_AVM-DE_SetWPSConfig", "params": { "NewX_AVM-DE_WPSMode": "pbc", "NewX_AVM-DE_WPSClientPIN": "" } }';

const states = {
    states:            { name: "states", type: 'channel' },
    wps:               { name: "wps", val: false, func: 'setWPSMode' },
    wlan:              { name: "wlan", val: false, func: 'setWLAN'},
    dialNumber:        { name: 'dialNumber', val: "" },
    stopDialog:        { name: 'stopDialing', val: "" },
    reconnectInternet: { name: 'reconnectInternet', val: false },
    command:           { name: 'command', val: "", func: 'command', desc: commandDesc },
    commandResult:     { name: 'commandResult', val: "", write: false},
    
    statistics:        { name: 'statistics', type: 'channel' },
    bytesTransfered:   { name: 'bytesTransfered', val: 0 },

    devices:           { name: "devices", type: "device"}
}

function createObj(state, prefix) {
    prefix = prefix || "";
    var obj = {
        type: state.type || 'state',
        common: {
            name: state.name,
            type: typeof state.val || 'string',
            def: false,
            read: true,
            write: state.hasOwnProperty("write") ? state.write : true,
        }
    }
    obj.common.role = state.hasOwnProperty('val') ? "state" : "";
    if (state.hasOwnProperty('desc')) obj.desc = state.desc;
    if (typeof state.val === 'boolean') obj.values = [false, true];
    adapter.setObjectNotExists(prefix + state.name, obj, "", function (err, obj) {
        if (state.hasOwnProperty('val') && state.val !== undefined) adapter.setState(prefix + state.name, state.val, true);
    });
}

function createObjects(objects) {
    var prefix = "", device = "";
    for (var i in objects) {
        var obj = objects[i];
        if (!obj.hasOwnProperty('name')) obj.name = i;
        if (obj.hasOwnProperty('type')) {
            switch (obj.type) {
                case 'channel':
                    prefix = device + obj.name + '.';
                    break;
                case 'device':
                    device = states[i].name ? obj.name + '.' : "";
                    prefix = device;
                    break;
            }
            createObj(obj);
            continue;
        }
        createObj(obj, prefix);
    }
}

function deleteAllObjects(objects) {
    for (var i in objects) {
        var obj = objects[i];
        if (obj.hasOwnProperty('type')) {
            switch (obj.type) {
                case 'channel':
                    adapter.deleteChannel(obj.name, function (err, _obj) {
                        adapter.log.info('Channel "' + obj.name + '" deleted');
                    });
                    break;
                case 'device':
                    adapter.deleteDevice(obj.name, function (err, _obj) {
                        adapter.log.info('Device "' + obj.name + '" deleted');
                    });
                    break;
            }
        }
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var inMemStates = [];


adapter.on('ready', function () {
    //deleteAllObjects(states);
    main();
});

adapter.on('install', function () {
});

adapter.on('unload', function (callback) {
    try {
        //adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});


adapter.on('stateChange', function (id, state) {
    if (!state || state.ack) return;
    
    var as = id.split('.');
    if ((as[0] + '.' + as[1] != adapter.namespace) || (as[2] !== states.states.name)) return;
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));
    
    var func = states [as[3]].func;
    if (trclient.hasOwnProperty(func) || trclient.__proto__.hasOwnProperty(func)) {
        trclient[func](state.val, function (err, res) {
        });
    }

});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var ctr064 = function (user, password, iporhost, port) {
    this.ip = iporhost;
    this.port = 49000 || port;
    this.user = user;
    this.password = password;
    this.sslDev = null;
    this.hosts = null;
    this.getSpecificHostEntry = null;
    this.getWPSMode = null;
}

ctr064.prototype.init = function (callback) {
    var self = this;
    tr064.initTR064Device(this.ip, this.port, function (err, device) {
        if (err || !device) return (callback(err));
        device.startEncryptedCommunication(function (err, sslDev) {
            if (err) return callback(err);
            sslDev.login(self.user, self.password);
            self.sslDev = sslDev;
            
            self.hosts = sslDev.services["urn:dslforum-org:service:Hosts:1"];
            if (!self.hosts) return callback("no hosts");

            self.getSpecificHostEntry = self.hosts.actions.GetSpecificHostEntry;
            self.getGenericHostEntry = self.hosts.actions.GetGenericHostEntry;
            self.getWLANConfiguration = sslDev.services["urn:dslforum-org:service:WLANConfiguration:1"];
            
            callback(0);
        });
    });
};


ctr064.prototype.forEachHostEntry = function (callback) {
    var self = this;
    this.hosts.actions.GetHostNumberOfEntries(function (err, obj) {
        var all = 0 | obj.NewHostNumberOfEntries;
        var cnt = 0;
        for (var i = 0; i < all; i++) {
            self.getGenericHostEntry({ NewIndex: i }, function (err, obj) {
                if (err || !obj) return;
                callback(err, obj, cnt++, all)
            });
        }
    });
}


ctr064.prototype.command = function (command, callback) {
    var o = JSON.parse(command);
    trclient.sslDev.services[o.service].actions[o.action](o.params, function (err, res) {
        if (err || !res) return;
        adapter.log.info(JSON.stringify(res));
        adapter.setState(states.states.name + '.' + states.commandResult.name, JSON.stringify(res), true);
    });
}

 
ctr064.prototype.reconnectInternet = function (callback) {
    this.sslDev.services["urn:dslforum-org:service:WANIPConnection:1"].actions.ForceTermination(callback);
} 

ctr064.prototype.externalIP = function (callback) {
    this.sslDev.services["urn:dslforum-org:service:WANIPConnection:1"].actions.GetExternalIPAddress(function (err, res) {
        callback(err);
    });
}

ctr064.prototype.setWLAN = function (val, callback) {
    this.sslDev.services["urn:dslforum-org:service:WLANConfiguration:1"].actions.SetEnable({ 'NewEnable': val ? 1 : 0 }, function (err, result) {
    });
}

ctr064.prototype.getWLAN = function (callback) {
    this.sslDev.services["urn:dslforum-org:service:WLANConfiguration:1"].actions.GetInfo(callback);
}

ctr064.prototype.dialNumber = function (number, callback) {
    this.sslDev.services["urn:dslforum-org:service:X_VoIP:1"].actions["X_AVM-DE_DialNumber"]({ "NewX_AVM-DE_PhoneNumber": number }, callback);
}

ctr064.prototype.setWPSMode = function (modeOrOnOff, callback) {
    var mode = modeOrOnOff;
    if (typeof modeOrOnOff == 'boolean') mode = modeOrOnOff ? "pbc" : "stop";
    var self = this;
    self.sslDev.services["urn:dslforum-org:service:WLANConfiguration:1"].actions["X_AVM-DE_SetWPSConfig"]({ "NewX_AVM-DE_WPSMode": mode, "NewX_AVM-DE_WPSClientPIN": "" }, function (err, obj) {
        self.sslDev.services["urn:dslforum-org:service:WLANConfiguration:1"].actions["X_AVM-DE_GetWPSInfo"](function (err, obj) {
        });
    });
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function deleteUnavilableDevices(callback) {
    
    var ch = adapter.namespace + '.' + states.devices;
    var count = 0;
    
    adapter.objects.getObjectView('system', 'state', { startkey: ch + '.', endkey: ch + '.\u9999' }, function (err, res) {
        if (err) return;
        for (var i = 0; i < res.rows.length; i++) {
            if (inMemStates[res.rows[i].id])
                count++;
       }
    });
}


function readAvailableDevices(callback) {
    
    trclient.forEachHostEntry(function (err, device, cnt, all) {
        
        var name = device.NewHostName.replace(/[.\s]+/g, '_');
        var id = states.devices.name + '.' + name;
        inMemStates.push({ mac: device.NewMACAddress, name: device.NewHostName, active: undefined });
        
        adapter.setObjectNotExists(id, { type: "channel", common: { name: device.NewHostName, role: "device" } }, {}, function (err, obj) {
            if (err || !obj) return callback(err);
            adapter.log.info("Createing device " + name);
            
            createObj({ name: id + '.mac', val: device.NewMACAddress });
            createObj({ name: id + '.ip', val: device.NewIPAddress });
            createObj({ name: id + '.active', val: false | device.NewActive });
            createObj({ name: id + '.type', val: device.NewInterfaceType });
            createObj({ name: id + '.lastActive', val: "" });
            createObj({ name: id + '.lastInactive', val: "" });
            createObj({ name: id + '.watch', val: false, write: true });
            
            adapter.setState(id, false | device.NewActive, true);
        });
            
    });
}


function setActiveState(id, val) {
    inMemStates[cnt].active = val;
    adapter.log.info("Active changed " + id);
    adapter.setState(id + '.active', val);
    adapter.setState(id, val, true);
}

function updateDevices(callback) {
    
    function doit(id, inMemState, val, name) {
        if (inMemState.active === undefined) {
            adapter.getState(id + '.active', function (err, obj) {
                if (err || !obj) return;
                inMemState.active = false | obj.val;                
                doit(id, inMemState, val, name);
            });
            return;
        }
        if (inMemState.active !== val) {
            adapter.log.info("Active changed " + name);
            adapter.setState(id + '.active', val, true);
            adapter.setState(id, val, true);
        }
    }

    var cnt = 0;
    for (var i in inMemStates) {
        var state = inMemStates[i];
        trclient.getSpecificHostEntry({ NewMACAddress: state.mac }, function (err, device) {
            if (err || !device) return;
            
            var name = device.NewHostName.replace(/[.\s]+/g, '_');
            var id = states.devices.name + '.' + name;
            doit(id, inMemStates[cnt++], false | device.NewActive, name);
        });
    }
}


function updateAll() {

    updateDevices();

    if (adapter.config.intervall !== undefined && adapter.config.intervall !== 0) {
        setTimeout(updateAll, adapter.config.intervall * 1000);
    }
}


function main() {
    
    createObjects(states);
    adapter.subscribeStates('*');

    trclient = new ctr064(adapter.config.user, adapter.config.password, adapter.config.ip);
    
    trclient.init(function (err) {
        
        return;
        //trclient.getWLAN(function (err, res) {
        //    adapter.setState(states.wlan, false | res.NewEnable, true);
        //});        
        
        //trclient.reconnectInternet(function (err, obj) {
        //});
        //trclient.externalIP(function (err, obj) {
        //});

        readAvailableDevices(function (err) {
            //updateAll();
        });
        setTimeout(updateAll, 15000);
    });
    
    //adapter.subscribeStates('*');
}



