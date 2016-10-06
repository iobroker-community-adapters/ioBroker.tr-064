/**
 tools for an ioBroker Adapter v0.0.0.1

 Copyright (c) 2016 soef <soef@gmx.net>
 All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright
 notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in the
 documentation and/or other materials provided with the distribution.
 * Neither the name of sprintf() for JavaScript nor the
 names of its contributors may be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 DISCLAIMED. IN NO EVENT SHALL Alexandru Marasteanu BE LIABLE FOR ANY
 DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


 Changelog:
 2016.09.27 - 0.0.0.4 CDevice.get...
 2016-01-13 - 0.0.0.3 fixed errors of initial reeaase
 ...

 2016.01.10 - 0.0.0.1 initial release
  */


"use strict";

//var ES6 = false;
//
//function determinateNodeVersion() {
//    var ar = process.version.substr(1).split('.');
//    ES6 = ar[0] >> 0 > 0 || (ar[1] >> 0 >= 12);
//}
//determinateNodeVersion();

var njs = {

    iscb: function (cb) {
        return typeof cb === 'function';
    },

    bind: function(func, that) {
        return function() {
            return func.apply(that, arguments);
        };
    },

    _fullExtend: function (dest, from) {
        var props = Object.getOwnPropertyNames(from), destination;

        props.forEach(function (name) {
            if (typeof from[name] === 'object') {
                if (typeof dest[name] !== 'object') {
                    dest[name] = {}
                }
                _fullExtend(dest[name],from[name]);
            } else {
                destination = Object.getOwnPropertyDescriptor(from, name);
                Object.defineProperty(dest, name, destination);
            }
        });
    },
    fullExtend: function (dest, from) {
        _fullExtend(dest, from);
        return dest;
    },

    safeCallback: function safeCallback(callback, val1, val2) {
        if (njs.iscb(callback)) {
            callback(val1, val2);
        }
    },

    forEachCB: function (maxcnt, func, readyCallback) {
        var cnt = -1;

        function doit(ret) {
            if (++cnt >= maxcnt) {
                return njs.safeCallback(readyCallback, ret);
            }
            func(cnt, doit);
        }

        doit(-1);
    },
    forEachSync: function (maxcnt, func, readyCallback) {
        var cnt = -1;

        function doit(ret) {
            if (++cnt >= maxcnt) {
                return njs.safeCallback(readyCallback, ret);
            }
            func(cnt, doit);
        }

        doit(-1);
    },

    //forEachObjCB: function (objects, step, func, readyCallback) {
    //    if(typeof step === 'function') {
    //        readyCallback = func;
    //        func = step;
    //        step = 1;
    //    }
    //    var objs = [];
    //    for (var obj of objects) {
    //        objs.push(obj);
    //    }
    //    var pop = step == -1 ? objs.pop : objs.shift;
    //
    //    function doit(ret) {
    //        if (objs.length <= 0) {
    //            return safeCallback(readyCallback, ret);
    //        }
    //        func(pop.call(objs), doit);
    //    }
    //
    //    doit(-1);
    //},


    forEachObjSync: function (objects, step, func, readyCallback) {
        if(typeof step === 'function') {
            readyCallback = func;
            func = step;
            step = 1;
        }
        var objs = [];
        if (!(objects instanceof Array)) {
            for (var i in objects) {
                objs.push(i);
            }
        } else {
            objs = objects;
            //for (var obj of objects) {
            //    objs.push(obj);
            //}
        }
        var pop = step == -1 ? objs.pop : objs.shift;

        function doit(ret) {
            if (objs.length <= 0) {
                return safeCallback(readyCallback, ret);
            }
            func(pop.call(objs), doit);
        }

        doit(-1);
    },

    dcs: function (deviceName, channelName, stateName) {
        if (stateName === undefined) {
            stateName = channelName;
            channelName = '';
        }
        if (stateName[0] === '.') {
            return stateName.substr(1);
        }
        var ret = '';
        //if (ES6) {
        //    for (var i of [deviceName, channelName, stateName]) {
        //        if (!ret) ret = i;
        //        else if (i) ret += '.' + i;
        //    }
        //} else {
            var ar = [deviceName, channelName, stateName];
            for (var i = 0; i < ar.length; i++) {//[deviceName, channelName, stateName]) {
                var s = ar[i];
                if (!ret) ret = s;
                else if (s) ret += '.' + s;
            }
        //}
        return ret;
    },

    pattern2RegEx: function (pattern) {
        if (pattern != '*') {
            if (pattern[0] == '*' && pattern[pattern.length - 1] != '*') pattern += '$';
            if (pattern[0] != '*' && pattern[pattern.length - 1] == '*') pattern = '^' + pattern;
        }
        pattern = pattern.replace(/\./g, '\\.');
        pattern = pattern.replace(/\*/g, '.*');
        return pattern;
    },

    tr: {
        '\u00e4': 'ae',
        '\u00fc': 'ue',
        '\u00f6': 'oe',
        '\u00c4': 'Ae',
        '\u00d6': 'Oe',
        '\u00dc': 'Ue',
        '\u00df': 'ss',
        ' ': '_',
        '.': '_'
    },

    normalizedName: function (name) {
        return name.replace(/[\u00e4\u00fc\u00f6\u00c4\u00d6\u00dc\u00df .]/g, function ($0) {
            return njs.tr[$0]
        })
    },

    REMOVE_ALL: function  (adapter, callback) {

        adapter.getForeignStates(adapter.namespace + '.*', {}, function(err, states) {
            if (err || !states) return;
            for (var fullId in states) {
                //adapter.deleteState(fullId);
                adapter.delState(fullId);
            }
            adapter.getDevices(function (err, devices) {
                for (var d = 0; d < devices.length; d++) {
                    adapter.deleteDevice(devices[d]._id);
                }
                adapter.log.debug("devices deleted");
                adapter.getChannels('', function (err, channels) {
                    for (var d = 0; d < channels.length; d++) {
                        adapter.deleteChannel(channels[d]._id);
                    }
                    adapter.log.debug("channels deleted");
                    adapter.getStates('*', {}, function (err, states) {
                        for (var d in states) {
                            adapter.delState(d);
                        }
                        adapter.log.debug("states deleted");
                        safeCallback(callback);
                        //process.exit();
                    });
                });
            });
        });
        return true;
    },



    valtype: function (val) {
        switch (val) {
            //fastest way for most states
            case 'true':
                return true;
            case 'false':
                return false;
            case '0':
                return 0;
            case '1':
                return 1;
            case '2':
                return 2;
            case '3':
                return 3;
            case '4':
                return 4;
            case '5':
                return 5;
            case '6':
                return 6;
            case '7':
                return 7;
            case '8':
                return 8;
            case '9':
                return 9;
        }
        var number = parseInt(val);
        if (number.toString() === val) return number;
        var float = parseFloat(val);
        if (float.toString() === val) return float;
        return val;
    },

    formatValue: function (value, decimals, _format) {
        if (_format === undefined) _format = ".,";
        if (typeof value !== "number") value = parseFloat(value);

        var ret = isNaN(value) ? "" : value.toFixed(decimals || 0).replace(_format[0], _format[1]).replace(/\B(?=(\d{3})+(?!\d))/g, _format[0]);
        return (ret);
    }

};

for (var i in njs) {
    global[i] = njs[i];
    //module.parent[i] = njs[i];
}

function extendGlobalNamespace() {
    for (var i in njs) {
        global[i] = njs[i];
    }
}

function errmsg () { console.debug("adapter not assigned, use Device.setAdapter(yourAdapter)") };

if (module.parent.exports['adapter']) {
    var adapter = module.parent.exports.adapter;
} else {
    var adapter = {
        setState: errmsg,
        setObject: errmsg,
        setObjectNotExists: errmsg,
        getStates: errmsg
    };
}

var objects = {};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function setObject(id, obj, options, callback) {
    return adapter.objects.setObject(adapter.namespace + '.' + id, obj, options, callback);
}
function getObject(id, options, callback) {
    return adapter.objects.getObject(adapter.namespace + '.' + id, options, callback);
}
function setState(id, val, ack) {
    ack = ack || true;
    adapter.setState(id, val, ack);
}

function setObjectNotExists(id, newObj, callback) {
    getObject(id, {}, function (err, o) {
        if (!o) {
            setObject(id, newObj, {}, callback)
            return;
        }
        safeCallback(callback, "exists", o);
    })
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
var DEVICE = 0;
var CHANNEL = 1;
var STATE = 2;

var typeNames = ['device', 'channel', 'state'];

function CDeviceQueue (options) {
    options = options || {};
    var that = this;
    var newObjects = [];
    var o = [0,0,0];
    var parent = { _id: '' };
    var checkExists = options.checkExists || true;

    this.set = function (id, val, ack) {
        if (!objects[id]) {
            this.newObj(id, val); // add...
            return;
        }
        if (objects[id].val !== val) {
            setState(id, val, ack);
        }
    }

    this.add = function (_obj) {
        if (checkExists && objects[_obj._id]) {
            return;
        }
        var obj = Object.assign({}, _obj);
        delete obj.parent;
        objects[obj._id] = obj;      //??
        newObjects.push(obj);
    };

    //function __id(_id) {
    //    return (parent && parent['_id']) ? parent._id + '.' + _id : _id;
    //}

    function push(what) {
        if (what+1 < o.length) {
            push(what+1);
        }
        if (o[what]) {
            if (what) {
                //o[what].parent.children.push(o[what]._id);
            }
            that.add(o[what]);
            o[what] = 0;
        }
    }

    function _new (_id, name, what) {
        push(what);
        parent = o[what-1];
        if (what === undefined) {
            what = name;
            name = null;
        }
        o[what] = {
            //_id: __id(_id),
            _id: dcs(parent['_id'], _id),
            type: typeNames [what],
            common: {
                name: name ? name : _id
            },
            native: {},
            //children: [],
            parent: parent
        };
        parent = o[what];
        return o[what];
    }

    this.newDevice = function (_id, name) {
        return _new(_id, name, DEVICE);
    };

    this.newChannel = function (_id, name) {
        return _new(_id, name, CHANNEL);
    };

    this.newState = function (name) {
        push(STATE);
        o[STATE] = {
            //_id: __id(name),
            _id: dcs(parent['_id'], name),
            type: 'state',
            common: {
                name: name,
                role: 'state',
                read: true,
                write: false
            },
            native: {},
            parent: parent
        };
        return o[STATE];
    };

    this.newObj = function(id, val) {
        var ar = id.split('.');
        if (ar.length > 1) this.newDevice(ar.slice());
        while (ar.length > 1) {
            this.newChannel(ar.slice());
        }
        this.newState(ar[0]);
        //objects[id].val = val;
    }

    this.update = function () {
        push(DEVICE);

        function addObjects() {
            if (newObjects.length > 0) {
                var newObject = newObjects.pop();
                //var val = undefined;
                //if (newObject['val'] !== undefined) {
                //    val = newObject.val;
                //    delete newObject.val;
                //}
                var val = newObject['val'];
                if (val !== undefined) {
                    delete newObject.val;
                }

                setObject(newObject._id, newObject, {}, function (err, obj) {
                    adapter.log.info('object ' + adapter.namespace + '.' + newObject._id + ' created');
                    if (val !== undefined) {
                        //adapter.setState(obj._id, val, true);
                        setState(obj._id, val, true);
                    }
                    addObjects();
                });
            }
        }
        addObjects();
    };
    this.ready = this.update;
    return this;
}
*/

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function Devices (_adapter, _callback) {

    var that = this;
    this.list = [];
    //this.states = objects;

    this.setAdapter = function (_adapter) {
        adapter = _adapter;
    };
    this.has = function (id, prop) {
        var b = objects.hasOwnProperty(id);
        if (prop === undefined) return b;
        return (b && objects[id] !== null && objects[id].hasOwnProperty(prop));
    };
    this.get = function (id) {
        return (objects[id]);
    };
    //this.existState = function (id) {
    //    return (this.has(id, 'exist') && this.states[id].exist === true);
    //};
    //this.setExist = function (id, val) {
    //    val = val || true;
    //    if (!this.has(id)) this.states[id] = { exist: val };
    //    else this.states[id].exist = val;
    //};
    this.setraw = function (id, obj) {
        objects[id] = obj;
        //this.states[id] = obj;
    };
    //this.showName = function (id, name) {
    //    return ((this.states[id] && this.states[id].showName) ? this.states[id].showName : name);
    //};

    this.getKeys = function (pattern) {
        var r = new RegExp(pattern2RegEx(pattern));
        var result = [];
        for (var id in objects) {
            if (r.test(id)) result.push(id);
        }
        return result;
    };

    this.foreach = function (pattern, callback) {
        var r = new RegExp(pattern2RegEx(pattern));
        for (var id in objects) {
            if (r.test(id)) {
                if (callback (id, objects[id]) === false) {
                    return { id: id, val: objects[id]};
                }
            }
        }
    };

    //this.stateChanged = function (id, val, ack) {
    //};

    this.createObjectNotExists = function (id, obj, callback) {
        var val;
        //var newobj = Object.assign({
        //    type: 'state',
        //    common: {
        //        name: id,
        //        type: 'string',
        //        role: obj.type || 'state',
        //        enumerable: true
        //    },
        //    native: { n: 1}
        //}, obj);
        var newobj = {
            type: 'state',
            common: {
                name: id,
                type: 'string',
                role: obj.type || 'state',
                //enumerable: true
                //writable: false
            },
            native: { }
        };
        _fullExtend(newobj, obj);

        if (obj['val'] !== undefined) {
            newobj.common.type = typeof obj.val;
            val = obj.val;
            //newobj.common.role = 'state';
            //newobj.type = 'state';
            delete newobj.val;
        }
        //if (obj['showName'] !== undefined) {
        //    newobj.common.name = obj.showName;
        //    //!!
        //    delete newobj.showName;
        //}
        //newobj = this.extendObject(id, newobj);
        setObjectNotExists(id, newobj, function(err, o) {
            if (!err) {
                //that.states[newobj._id] = newobj;
                objects[newobj._id] = newobj;
                if (val !== undefined) {
                    that.setState(newobj._id, val, true)
                }
            }
            safeCallback(callback, err, o);
        });
    };

    this.setState = function (id, val, ack) {
        if (val !== undefined) objects[id].val = val;
        else val = objects[id].val;
        ack = ack || true;
        setState(id, val, ack);
        //this.stateChanged(id, val, ack);
    };

    this.setStateEx = function (id, newObj, ack, callback) {
        if (typeof ack === 'function') {
            callback = ack;
            ack = true
        }
        if (typeof newObj !== 'object') {
            newObj = { val: newObj };
        }
        if (ack === undefined) ack = true;
        if (!that.has(id)) {
            that.createObjectNotExists(id, newObj, callback);
        } else {
            //if (that.states[id].val !== newObj.val) {
            if (objects[id].val !== newObj.val) {
                that.setState(id, newObj.val, ack);
            }
            safeCallback(callback, 0);
        }
    };

    function val2obj(valOrObj, showName) {
        if (valOrObj === null) return;
        if (typeof valOrObj === 'object') {
            var obj = valOrObj;
        } else {
            var obj = {};
            if (valOrObj !== undefined) {
                obj.val = valtype(valOrObj);
            }
        }
        if (showName) {
            //Object.assign(obj, { common: { name: showName}});
            _fullExtend(obj, { common: { name: showName}});
        }
        return obj;
    }

    //this.extendObject = function (fullName, obj) {
    //    return obj;
    //};

    this.updateAsync = function (list, callback) {
        if (typeof list === 'function') {
            callback = list;
            list = null;
        }
        if (!list) {
            list = that.list;
            that.list = {};
        }
        if (!list) return callback(-1);
        if (Array.isArray(list)) {
            for (var i=0; i<list.length; i++) {
                var objName = Object.keys( list[i] )[ 0 ];
                this.setStateEx(objName, list[i][objName]);
            }
        } else {
            for (var id in list) {
                this.setStateEx(id, list[id]);
            }
        }
        safeCallback(callback, 0);
    };

    this.update = function (list, callback) {
        if (typeof list === 'function') {
            callback = list;
            list = null;
        }
        if (!list || that.list === list) {
            list = that.list;
            that.list = [];
            if (that.root.list) that.root.list = that.list;
            //that.list.splice(0, that.list.length); //to preserve this.loot.list
        }
        if (!list || list.length == 0) return safeCallback(callback, -1);

        forEachObjSync(list, function (obj, doit) {
                that.setStateEx(obj._id, obj, true, doit);
            },
            callback
        );
    };

    function _setobjname(o, name) {
        if (o['common'] === undefined) {
            o['common'] = { name: name};
        } else {
            o.common['name'] = name;
        }
    }

    this.setObjectName = function (id, name) {
        if (!objects[id] || !objects[id].common || !objects[id].common.name) {
            var o = {common: {name: ''} };
            if (!objects[id]) {
                objects[id] = {};
            }
            _setobjname(objects[id], '');
            //fullExtend(objects[id], o);
        }
        if (objects[id].common.name !== name) {
            adapter.getObject(id, {}, function (err, obj) {
                if (err || !obj) {
                    return;
                }
                if (obj.common.name !== name) {
                    obj.common.name = name;
                    adapter.setObject(id, {}, obj);
                }
                objects[id].common.name = name;
            });
        }
    };

    this.readAllExistingObjects = function (callback) {
        //adapter.getStatesOf('', '', {}, function(err, states) {
        //adapter.getStates("*", {}, function (err, states) {
        adapter.getForeignStates(adapter.namespace + '.*', {}, function(err, states) {
            if (err || !states) return callback(-1);
            var namespacelen = adapter.namespace.length + 1;
            for (var fullId in states) {
                var id = fullId.substr(namespacelen),
                    as = id.split('.'),
                    s = as[0];
                for (var i=1; i<as.length; i++) {
                    //if (!that.has(s)) that.setraw(s, { exist: true });
                    //!!
                    if (!that.has(s)) that.setraw(s, {});
                    s += '.' + as[i];
                }
                that.setraw(id, { val: states[fullId] ? states[fullId].val : null});
            }

            function setObjectProperty(obj, names, val) {
                var dot = names.indexOf('.');
                if (dot > 0) {
                    var n = names.substr(0, dot-1);
                    if (obj[n] === undefined) {
                        obj[n] = {};
                    }
                    setObjectProperty(obj[n], names.substr(dot+1), val);
                }
                obj[names] = val;
            }

            function doIt(list) {
                for (var i = 0; i < list.length; i++) {
                    var id = list[i]._id.substr(namespacelen);
                    var o = {common: {name: list[i].common.name}};
                    if (!objects[id]) {
                        objects[id] = {};
                    };
                    if (list[i].native !== undefined) {
                        o['native'] = list[i].native;
                    }
                    fullExtend(objects[id], o);
                }
            }

            adapter.getDevices(function (err, devices) {
                doIt(devices);
                adapter.getChannels('', function (err, channels) {
                    doIt(channels);
                    safeCallback(callback, 0);
                });
            });
            //safeCallback(callback, 0);
        });
    };


    this.CDevice = function CDevice (_name, showName, list) {

        var deviceName = '', channelName = '';
        var self = this;
        this.list = (list === undefined) ? that.list : list;

        function push (obj) {
            for (var i=0; i<self.list.length; i++) {
                if (self.list[i]._id === obj._id) {
                    return fullExtend(self.list[i], obj);
                }
            }
            self.list.push(obj);
            return obj;
        }

        this.setDevice = function (name, options) {
            channelName = "";
            if (!name) return;
            deviceName = normalizedName (name);
            var obj = { type: 'device', _id: deviceName };
            if (options) {
                Object.assign(obj, options);
            }
            return push(obj);
        };
        this.setDevice(_name, showName ? { common : { name: showName}} : undefined);

        this.setObjectName = function (id, showName) {
            for (var i=0; i<self.list.length; i++) {
                if (self.list[i]._id == id) {
                    //var o = self.list[i];
                    _setobjname(self.list[i], showName);
                    //if (o['common'] === undefined) {
                    //    o['common'] = {};
                    //}
                    //o.common['name'] = showName;
                    //fullExtend (self.list[i], { common: { name: showName}});
                    return i;
                }
            }
            return -1;
        };

        this.setChannel = function (name, showName) {
            if (name === undefined) channelName = "";
            else {
                channelName = name;
                //var id = dcs(this.name, channel);
                var id = dcs(deviceName, channelName);
                if (!that.has(id)) {
                    var obj = {type: 'channel', _id: id, common: { name: showName || name }};
                    return push(obj);
                }
            }
        };

        function split(id, valOrObj, showName) {
            var ar = ((id && id[0] == '.') ? id.substr(1) : dcs(deviceName, channelName, id)).split('.');
            var dName = deviceName, cName = channelName;
            switch(ar.length) {
                case 3:
                    self.setDevice(ar.shift());
                case 2:
                    self.setChannel(ar.shift());
                default:
                    var ret = add (ar[0], valOrObj, showName);
                    deviceName = dName;
                    channelName = cName;
                    return ret;
            }
        }

        function add (name, valOrObj, showName) {
            if (valOrObj === null) return;
            if (name.indexOf('.') >= 0) {
                return split(name, valOrObj, showName);
            }
            var obj = val2obj(valOrObj, showName || name);
            obj._id = dcs(deviceName, channelName, name);
            obj.type = 'state';
            return push(obj);
        }

        //function _set (_id, id, newObj, showName) {
        //    if (!objects[_id]) {
        //        return add (id, newObj, showName);
        //    }
        //    var val = newObj['val'] !== undefined ? newObj.val : newObj;
        //    if (objects[_id].val !== val) {
        //        that.setState(_id, val, true);
        //    }
        //};
        //
        //this.dcset = function (d,c,s,v, showName) {
        //    var _id = dcs(d, c, s);
        //    _set(_id, v, showName);
        //};
        //this.dset = function(d,s,v, showName) {
        //    var _id = dcs(d, '', s);
        //    _set(_id, v, showName);
        //};
        //this.sset = function(s,v, showName) {
        //    var _id = s;
        //    _set(_id, v, showName);
        //};

        function __setVal(_id, newObj) {
            var val = newObj['val'] !== undefined ? newObj.val : newObj;
            if (objects[_id].val !== val) {
                that.setState(_id, val, true);
            }
        }

        this.dset = function(d,s,v,showName) {
            var _id = dcs(d, '', s);
            if (!objects[_id]) {
                return add ('.'+_id, v, showName);
            }
            __setVal(_id, v);
        };


        this.rset = function (id, newObj, showName) {
            return this.set('.' + id, newObj, showName);
        };

        this.set = function (id, newObj, showName) {
            var _id = dcs(deviceName, channelName, id);
            //_set(_id, id, newObj, showName);
            if (newObj == undefined) return;
            if (!objects[_id]) {
                return add (id, newObj, showName);
            }
            var val = newObj['val'] !== undefined ? newObj.val : newObj;
            if (objects[_id].val !== val) {
                that.setState(_id, val, true);
                return true;
            }
            return false; //objects[_id];
        };
        this.add = this.set;
        this.getFullId = function (id) {
            return dcs(deviceName, channelName, id);
        };
        this.get = function(channel, id) {
            if (id == undefined) {
                var _id = dcs(deviceName, channelName, channel);
            } else {
                var _id = dcs(deviceName, channel, id);
            }
            return objects[_id]
        };
        this.createNew = function (id, newObj, showName) {
            if (this.get(id)) return;
            this.set(id, newObj, showName);
        };

        this.update = function () {
            if (this.list.length > 0) {
                that.update(this.list);
            }
        }

    };

    this.CState = this.CDevice;
    this.root = new this.CDevice('');
    this.init = function (_adapter, callback) {
        this.setAdapter(_adapter);
        this.readAllExistingObjects(callback);
    };

    if (_adapter) {
        this.init(_adapter, _callback);
    }

    return this;
}

//module.exports.main = function () {
exports.main = function (adapter, options, callback ) {

    if (typeof options == 'function') {
        callback = options;
        options = {};
    }
    var _devices;
    if (options.devices) {
        _devices = options.devices;
    } else {
        _devices = new Devices();
        global.devices = _devices;
    }

    if (!options.doNotExportAdapter) {
        module.parent.exports = {
            adapter: adapter
        };
    }

    adapter.getForeignObject('system.adapter.' + adapter.namespace, function(err, obj) {
        if (!err && obj && obj.common && obj.common.enabled === false) {
            // running in debuger
            adapter.log.debug = console.log;
            adapter.log.info = console.log;
            adapter.log.warn = console.log;
            module.parent.__DEBUG__ = true;
        }
        //global._devices.init(adapter, function(err) {
        _devices.init(adapter, function(err) {
            callback();
        });
    });
};



//exports.Devices = Devices;

//module.exports =  function(useGlobalNamespace) {
//    if (useGlobalNamespace) {
//        //for (var i in njs) {
//        //    module.parent[i] = njs[i];
//        //}
//        extendGlobalNamespace ();
//    }
//    return { Devices: Devices, CDeviceQueue: CDeviceQueue, /*njs: njs,*/ extendGlobalNamespace: extendGlobalNamespace}
//}
exports.Devices = Devices;
//exports.CDeviceQueue = CDeviceQueue;
exports.njs = njs;
exports.extendGlobalNamespace = extendGlobalNamespace;