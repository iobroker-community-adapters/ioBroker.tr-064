/**

 Copyright (c) 2016 - 2017 soef <soef@gmx.net>
 All rights reserved.

 **/

"use strict";

var soef = exports;

if (!Object.assign) {
    Object.prototype.assign = function (target) {
        target = target || {};
        for (var i = 1; i < arguments.length; i++) {
            var source = arguments[i];
            for (var key in source) {
                if (Object.prototype.hasOwnProperty.call(source, key)) {
                    target[key] = source[key];
                }
            }
        }
        return target;
    };
}


function hasProp (obj, propString) {
    if (!obj) return false;
    var ar = propString.split('.');
    var len = ar.length;
    for (var i = 0; i < len; i++) {
        obj = obj[ar[i]];
        if (obj === undefined) return false;
    }
    return true;
}
exports.hasProp =
    exports.hasProperty = hasProp;

function getLastValidProp (obj, propString) {
    if (!obj) return undefined;
    var ar = propString.split('.');
    var len = ar.length;
    for (var i = 0; i < len; i++) {
        if (obj[ar[i]] === undefined) return obj;
        obj = obj[ar[i]];
    }
    return obj;
}
exports.getLastValidProp = getLastValidProp;

function getLastValidPropEx (obj, propString) {
    if (!obj) return undefined;
    var ar = propString.split('.');
    var len = ar.length;
    for (var i = 0; i < len; i++) {
        if (obj[ar[i]] === undefined) {
            var ret = { obj: {}, invalifName: '', errPath: ''};
            try { ret = {obj: obj, invalidName: ar[i], errPath: ar.slice(i).join('.')}; }
            catch (e) {}
            return ret;
        }
        obj = obj[ar[i]];
    }
    return { obj: {}, invalifName: '', errPath: ''};
}
exports.getLastValidPropEx = getLastValidPropEx;


function getProp (obj, propString) {
    if (!obj) return undefined;
    var ar = propString.split('.');
    var len = ar.length;
    for (var i = 0; i < len; i++) {
        obj = obj[ar[i]];
        if (obj === undefined) return undefined;
    }
    return obj;
}
exports.getProp = getProp;

var safeFunction =
    exports.safeFunction = function (root, path, log) {
        var fn = getProp(root, path);
        if (typeof fn === 'function') return fn;
        if (log) {
            var err = getLastValidPropEx(root, path);
            if (typeof log !== 'function') log = adapter.log.debug;
            log(err.errPath + ' is not a function (' + path +')');
        }
        return function (params, callback) {
            if (!arguments.length) return;
            var fn = arguments [arguments.length-1];
            if (typeof fn === 'function') {
                fn(new Error(path + ' is not a function'));
            }
        }
    };

exports.getFnProp = function(root, path, log) {
    if (typeof log !== 'function') log = function() {};
    return safeFunction(root, path, log);
};

////////////////////////////////////////////////////////////////////////////////////

var njs = {

    pasProp: hasProp,
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
            if (from[name] !== null && typeof from[name] === 'object') {
                if (typeof dest[name] !== 'object') {
                    dest[name] = {}
                }
                njs._fullExtend(dest[name],from[name]);
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

    clone_old: function (from) {
        var props = Object.getOwnPropertyNames(from), destination, dest = {};

        props.forEach(function (name) {
            if (from[name] instanceof Array) {
                //dest[name] = new Array(from[name]);
                dest[name] = [].concat(from[name]);
            } else
            if (from[name] !== null && typeof from[name] === 'object') {
                if (typeof dest[name] !== 'object') {
                    dest[name] = {}
                }
                _fullExtend(dest[name],from[name]);
            } else {
                destination = Object.getOwnPropertyDescriptor(from, name);
                Object.defineProperty(dest, name, destination);
            }
        });
        return dest;
    },

    clone: function _clone_ (from) {
        var props = Object.getOwnPropertyNames(from), destination, dest = {};

        props.forEach(function (name) {
            if (from[name] instanceof Array) {
                dest[name] = [].concat(from[name]);
                // var v = _clone_(from[name]);
                // dest[name] = [].concat(v);
            } else
            if (from[name] !== null && typeof from[name] === 'object') {
                if (typeof dest[name] !== 'object') {
                    dest[name] = {}
                }
                dest[name] = _clone_(from[name]);
                //_fullExtend(dest[name],from[name]);
            } else {
                destination = Object.getOwnPropertyDescriptor(from, name);
                Object.defineProperty(dest, name, destination);
            }
        });
        return dest;
    },


    safeCallback: function safeCallback(callback, val1, val2) {
        if (njs.iscb(callback)) {
            callback(val1, val2);
        }
    },

    forEachArrayCallback: function forEachArrayCallback (arr, readyCallback, func) {
        var cnt = -1, len = arr.length;

        function doit() {
            if (++cnt >= len) {
                return readyCallback && readyCallback();
            }
            func(arr[cnt], doit);
        }
        doit();
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

    dcs_old: function (deviceName, channelName, stateName) {
        if (stateName === undefined) {
            stateName = channelName;
            channelName = '';
        }
        if (stateName[0] === '.') {
            return stateName.substr(1);
        }

        var ret = '';
        [deviceName, channelName, stateName].forEach(function(v) {
            if (v) {
                if (!ret) ret = v;
                else ret += '.' + v;
            }
        });

        // var ar = [deviceName, channelName, stateName];
        // for (var i = 0; i < ar.length; i++) {//[deviceName, channelName, stateName]) {
        //     var s = ar[i];
        //     if (!ret) ret = s;
        //     else if (s) ret += '.' + s;
        // }
        return ret;
    },


    reDotTest: /^\./,
    reRemoveDupDots: /\.+/g,
    validatedId: function (id) {
        return id.replace(reRemoveDupDots, '.').replace(/^\./, '').replace(/\.$/, '');
    },
    //validateId: njs.validatedId,
    dcs1: function (deviceName, channelName, stateName) {
        if (channelName === undefined) {
            stateName = deviceName;
            deviceName = '';
        } else if (stateName === undefined) {
            stateName = channelName;
            channelName = '';
        }
        if (stateName[0] === '.') return njs.validatedId(stateName);
        if (channelName) deviceName += '.' + channelName;
        if (stateName) deviceName += '.' + stateName;
        return njs.validatedId(deviceName);
    },
    dcs: function (deviceName, channelName, stateName) {
        var argCnt = arguments.length;
        if (!argCnt) return '';
        if (arguments[argCnt-1] [0] === '.') return njs.validatedId(arguments[argCnt-1]);
        var id = '';
        for (var i=0; i<argCnt; i++) {
            if (arguments[i]) {
                if (!id) id = arguments[i];
                else id += '.' + arguments[i];
            }
        }
        return njs.validatedId(id);
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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    idWithoutNamespace: function (id, _adapter) {
        if (_adapter == undefined) _adapter = adapter;
        return id.substr(_adapter.namespace.length+1);
    },

    removeAllObjects: function  (adapter, callback) {

        adapter.getStates('*', function (err, states) {
            var st = [];
            for (var i in states) {
                st.push(i);
            }
            var s = 0;

            function dels() {

                if (s >= st.length) {
                    adapter.getChannels(function (err, channels) {
                        var c = 0;

                        function delc() {
                            if (c >= channels.length) {
                                adapter.getDevices(function (err, devices) {
                                    var d = 0;

                                    function deld() {
                                        if (d >= devices.length) {
                                            callback();
                                            return;
                                        }
                                        var did = devices[d++]._id;
                                        did = idWithoutNamespace(did);
                                        //adapter.delDevice(did, function(err,obj) {
                                        adapter.deleteDevice(did, function (err,obj) {
                                            deld();
                                        });
                                    }
                                    deld();
                                });
                                return;
                            }
                            adapter.deleteChannel(channels[c++]._id, function () {
                                delc();
                            });
                        }
                        delc();
                    });
                    return;
                }
                var nid = st[s++];
                adapter.delState(nid, function () {
                    adapter.delObject(nid, function() {
                        dels();
                    });
                });
            }
            dels();
        });
    },

    REMOVE_ALL: function  (adapter, callback) {
        if (callback) callback();
    },

    valtype: function (val) {
        switch (val) {
            //fastest way for most states
            case true:
                return true;
            case false:
                return false;
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
njs.normalizeName = njs.normalizedName;
njs.validateId = njs.validatedId;

for (var i in njs) {
    global[i] = njs[i];
}

function extendGlobalNamespace() {
    for (var i in njs) {
        global[i] = njs[i];
    }
}

var adapter;
function errmsg () { console.debug("adapter not assigned, use Device.setAdapter(yourAdapter)") };

if (hasProp(module, 'parent.exports.adapter')) {
    adapter = module.parent.exports.adapter;
} else {
    adapter = {
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
    //ack = ack || true;
    if (ack === undefined) ack = true;
    adapter.setState(id, val, ack);
}

function setObjectNotExists(id, newObj, callback) {
    getObject(id, {}, function (err, o) {
        if (!o) {
            setObject(id, newObj, {}, callback);
            return;
        }
        safeCallback(callback, "exists", o);
    })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function Devices (_adapter, _callback) {

    if (!_adapter || !_adapter.adapterDir) {
        _callback = _adapter;
        _adapter = undefined;
    }
    var that = this;
    this.list = [];

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
    this.remove = function(id) {
        delete objects[id];
    };
    this.setraw = function (id, obj) {
        objects[id] = obj;
    };

    this.getobjex = function (id) {
        var obj = this.get(id);
        if (obj || !adapter || !adapter.namespace) return obj;
        id = id.substr(adapter.namespace.length+1);
        return objects[id];
    };
    this._getobjex = function(id) {
        return this.getobjex(id) || { val: undefined };
    };
    this.getval = function (id, _default) {
        var o = this.get(id);
        if (o && o.val !== undefined) return o.val;
        return _default;
    };

    this.invalidate = function (id) {
        this._getobjex(id).val = undefined;
    };
    this.setrawval = function (id, val) {
        this._getobjex(id).val = val;
    };

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

    this.createObjectNotExists = function (id, obj, callback) {
        var val;
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
            if (typeof obj.val === 'number' && (newobj.common.role === undefined || newobj.common.role === 'state')) newobj.common.role = 'level';
            val = obj.val;
            delete newobj.val;
        }
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

    this._setState = function (id, val, ack) {
        if (val !== undefined) objects[id].val = val;
        else val = objects[id].val;
        if (ack === undefined) ack=true;
        setState(id, val, ack);
    };

    this.setState = function (o, id, val, ack) {
        var device = '', channel = '', state = id, changed;
        if (typeof o === 'object') {
            id = undefined;
            for (var n in o) switch (n[0]) {
                case 'i': id = soef.ns.no(o[n]); break;
                case 'v': val = o[n]; break;
                case 'd': device = o[n]; break;
                case 'c': channel = o[n]; break;
                case 's': state = o[n]; break;
                case 'a': ack = o[n]; break;
            }
            if (id === undefined) id = dcs (normalizedName (device), normalizedName (channel), state);
        } else {
            ack = val;
            val = id;
            id = soef.ns.no(o);
        }
        if (val !== undefined) {
            changed = (objects[id].val !== val);
            objects[id].val = val;
        }
        else val = objects[id].val;
        if (ack === undefined) ack=true;
        setState(id, val, ack);
        return changed;
    };

    this.xsetStateEx = function (id, newObj, ack, callback) {
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
            if (objects[id].val !== newObj.val) {
                that.setState(id, newObj.val, ack);
            }
            safeCallback(callback, 0);
        }
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
            var oldObj = objects[id];
            if (oldObj.val !== newObj.val) {
                that.setState(id, newObj.val, ack);
            }
            if (exports._extendObject_) {
                var nO;
                if (newObj.native && newObj.native !== oldObj.native) {
                    nO = { native: newObj.native };
                };
                if (newObj.common && newObj.common.name && (!oldObj.common || newObj.common.name !== oldObj.common.name)) {
                    nO = nO || {};
                    nO.common = newObj.common;
                }
                if (nO) {
                    Object.assign (oldObj, nO);
                    adapter.extendObject(id, nO, callback);
                } else {
                    safeCallback(callback, 0);
                }
            } else {
                safeCallback(callback, 0);
            }
        }
    };


    function val2obj(valOrObj, showName) {
        //if (valOrObj === null) return;
        //if (!valOrObj) return;
        if (typeof valOrObj === 'object') {
            var obj = valOrObj || {};
        } else {
            var obj = {};
            if (valOrObj !== undefined) {
                obj.val = valtype(valOrObj);
            }
        }
        if (showName && !hasProp(obj, 'common.name')) {
            //_fullExtend(obj, { common: { name: showName}});
            _setobjname(obj, showName);
        }
        return obj;
    }

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
            //list = that.list;
            //that.list = [];
            //if (that.root.list) that.root.list = that.list;
            list = that.list.slice();
            that.list.length = 0;

        }
        if (!list || list.length === 0) return safeCallback(callback, -1);

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
        }
        if (objects[id].common.name !== name) {
            adapter.getObject(id, {}, function (err, obj) {
                if (err || !obj) {
                    return;
                }
                if (obj.common.name !== name) {
                    obj.common.name = name;
                    adapter.setObject(id, obj);
                }
                objects[id].common.name = name;
            });
        }
    };

    this.readAllExistingObjects = function (callback) {
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
        });
    };


    this.CDevice = function CDevice (_name, showName, list) {
        //if (!(this instanceof that.CDevice)) {
        //    return new that.CDevice(_name, showName, list);
        //}

        var deviceName = '', channelName = '';
        var self = this;
        this.list = (list === undefined) ? that.list : list;
        this.force = false;

        function push (obj) {
            for (var i=0; i<self.list.length; i++) {
                if (self.list[i]._id === obj._id) {
                    return fullExtend(self.list[i], obj);
                }
            }
            self.list.push(obj);
            return obj;
        }

        this.push = push;
        this.pushNe = function (id, obj) {
            if (that.has (id)) return objects [id];
            obj._id = id;
            push (obj);
        };
        Object.defineProperty(this, 'device', {
            get: function () { return deviceName },
            set: function (val) { deviceName = val }
        });
        Object.defineProperty(this, 'channel', {
            get: function () { return channelName },
            set: function (val) { channelName = val }
        });


        this.setDevice = function (name, options) {
            channelName = "";
            if (!name) return;
            deviceName = normalizedName (name);
            var obj = { type: 'device', _id: deviceName };
            if (options) {
                if (typeof options === 'string') {
                    options = { common: { name: options }}
                }
                Object.assign(obj, options);
            }
            return push(obj);
        };
        this.setDeviceEx = function (name, options) {
            channelName = "";
            if (!name) return;
            deviceName = normalizedName (name.replace(/\\./g, '\n'));
            deviceName = deviceName.replace(/\n/g, '.');
            var obj = { type: 'device', _id: deviceName };
            if (options) {
                if (typeof options === 'string') {
                    options = { common: { name: options }}
                }
                Object.assign(obj, options);
            }
            return objects[deviceName] ? objects[deviceName] : push(obj);
        };
        this.setDevice(_name, showName && typeof showName == 'string' ? {common: {name: showName}} : showName);

        this.setObjectName = function (id, showName) {
            for (var i=0; i<self.list.length; i++) {
                if (self.list[i]._id == id) {
                    _setobjname(self.list[i], showName);
                    return i;
                }
            }
            return -1;
        };

        this.setChannel = function (name, showNameOrObject) {
            if (name === undefined) channelName = "";
            else {
                channelName = name;
                var id = dcs(deviceName, channelName);
                //if (!that.has(id)) {
                if (id && !that.has(id)) { // don't create channels without id
                    if (typeof showNameOrObject == 'object') {
                        var obj = {type: 'channel', _id: id, common: {name: name} };
                        Object.assign(obj, showNameOrObject);

                        if (showNameOrObject.common) obj.common = showNameOrObject.common;
                        if (showNameOrObject.native) obj.native = showNameOrObject.native;
                    } else {
                        var obj = {type: 'channel', _id: id, common: {name: showNameOrObject || name}};
                    }
                    return push(obj);
                }
            }
        };
        this.setChannelEx = function (name, showNameOrObject) {
            if (name === undefined) channelName = "";
            else {
                channelName = normalizedName(name);
                var id = dcs(deviceName, channelName);
                //if (!that.has(id)) {
                if (id && !that.has(id)) { // don't create channels without id
                    if (typeof showNameOrObject == 'object') {
                        var obj = {type: 'channel', _id: id, common: {name: name} };
                        if (showNameOrObject.common) obj.common = showNameOrObject.common;
                        if (showNameOrObject.native) obj.native = showNameOrObject.native;
                    } else {
                        var obj = {type: 'channel', _id: id, common: {name: showNameOrObject || name}};
                    }
                    return push(obj);
                }
            }
        };

        function split_old (id, valOrObj, showName) {
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

        function split (id, valOrObj, showName) {
            var ar = ((id && id[0] == '.') ? id.substr(1) : dcs(deviceName, channelName, id)).split('.');
            var dName = deviceName, cName = channelName;
            deviceName = channelName = '';
            exports.arrayRemoveEmptyEntries(ar);
            if (!ar.length) return;
            id = ar.pop();

            if (ar.length) deviceName = ar.shift();
            if (ar.length) channelName = ar.join('.');

            var ret = add (id, valOrObj, showName);

            deviceName = dName;
            channelName = cName;
            return ret;
        }

        this.__testSplit = function (id, valOrObj, showName) {
            return split(id, valOrObj, showName);
        };
        this.__testSplit__Old = function (id, valOrObj, showName) {
            return split_old(id, valOrObj, showName);
        };

        function add_old (name, valOrObj, showName) {
            //if (valOrObj === null) return;
            if (valOrObj == null) return;
            if (name.indexOf('.') >= 0) {
                return split(name, valOrObj, showName);
            }
            var obj = val2obj(valOrObj, showName || name);
            obj._id = dcs(deviceName, channelName, name);
            obj.type = 'state';
            return push(obj);
        }

        function add (name, valOrObj, showName) {
            if (valOrObj == null) return;
            var obj = val2obj(valOrObj, showName || name);
            obj._id = dcs(deviceName, channelName, name);
            obj.type = 'state';
            return push(obj);
        }

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

        this.add =
            this.set = function (id, newObj, showName) {
                if (newObj == undefined) return;
                var _id = dcs(deviceName, channelName, id);
                if (!objects[_id]) {
                    return add (id, newObj, showName);
                }
                var val = newObj['val'] !== undefined ? newObj.val : newObj;
                if (this.force || objects[_id].val !== val) {
                    that.setState(_id, val, true);
                    return true;
                }
                return false; //objects[_id];
            };

        this.oset = function (id, newObj, showName) {
            if (newObj == undefined) return;
            var _id = dcs(deviceName, channelName, id);
            if (!objects[_id]) {
                return add (id, newObj, showName);
            }
            var val = newObj['val'] !== undefined ? newObj.val : newObj;
            if (this.force || objects[_id].val !== val) {
                that.setState(_id, val, true);
                //return true;
            }
            return objects[_id];
        };



        this.setex = function (id, newObj, showName) {
            if (adapter && id.substr(0, adapter.namespace.length) === adapter.namespace) {
                id = id.substr(adapter.namespace.length+1);
            }
            return this.set(id, newObj, showName);
        };
        // this.setex = function (id, newObj, showName) {
        //     if (adapter) {
        //         id = exports.ns.no(id);
        //     }
        //     return this.set(id, newObj, showName);
        // };

        this.getobjex = function (id) {
            var id = dcs(deviceName, channelName, id);
            return that.getobjex(id);
        };
        this._getobjex = function(id) {
            return this.getobjex(id) || { val: undefined };
        };
        this.invalidate = function (id) {
            this._getobjex(id).val = undefined;
        };
        this.setraw = function (id, val) {
            this._getobjex(id).val = val;
        };
        this.setName = function (name) {
            //var id = dcs(deviceName, channelName, '');
            var id = dcs(deviceName, channelName);
            that.setObjectName(id, name);
        };

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
        this.setAndUpdate = function (id, newObj) {
            this.set(id, newObj);
            this.update();
        };
        this.setImmediately = this.setAndUpdate;

        this.clear = function(id) {
            id = exports.ns.no (id);
            Object.assign(dcs, exports.ns);
            var st = that.getobjex(id);
            if (st === undefined) return;
            switch(typeof st.val) {
                case 'string': st = ''; break;
                case 'boolean': st = false; break;
                case 'number': st = 0; break;
                default: return;
            }
            this.setAndUpdate(id, st);
        };

        this.update = function (callback) {
            if (this.list.length > 0) {
                that.update(this.list, callback);
            } else {
                safeCallback(callback);
            }
        };

    };

    this.CState = this.CDevice;
    this.root = new this.CDevice('');
    this.init = function (_adapter, callback) {
        this.setAdapter(_adapter);
        exports.ns = CNamespace(_adapter);
        this.readAllExistingObjects(callback);
    };

    if (_adapter) {
        this.init(_adapter, _callback);
    }

    return this;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var CNamespace = function (_adapter) {
    if (!(this instanceof CNamespace)) {
        return new CNamespace(_adapter);
    }

    var re = new RegExp('^' + _adapter.namespace + '.|^'); //  new/^adapter.0.|^/, '')
    var isre = new RegExp('^' + _adapter.namespace);
    this.without = this.no = function no (s) {
        return s.replace(re, '');
    };
    this.remove = this.no;
    this.is = isre.test.bind(isre); //.bind(this);
    this.with = this.add = function add (s) {
        return s.replace(re, _adapter.namespace + '.')
    };
    this.add2 = function add (s) {
        return s.replace(re, _adapter.namespace + (s ? '.' : ''));
    }
};
exports.CNamespace = CNamespace;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function parseIntVersion(vstr) {
    if (!vstr || vstr=='') return 0;
    var ar = vstr.split('.');
    var iVer = 0;
    for (var i=0; i<ar.length; i++) {
        iVer *= 1000;
        iVer += ar[i] >> 0;
    }
    return iVer;
}

function nop() {}

function savePrevVersion() {
    if(!hasProp(adapter, 'ioPack.common.version')) return;
    var id = 'system.adapter.' + adapter.namespace;
    var vid = id + '.prevVersion';

    function set() {
        adapter.states.setState(vid, { val: adapter.ioPack.common.version, ack: true, from: id });
    }

    adapter.objects.getObject(vid, function(err, obj) {
        if (err || !obj) {
            adapter.objects.setObject(vid, {
                type: 'state',
                common: {name: 'version', role: "indicator.state", desc: 'version check for updates'},
                native: {}
            }, function (err, obj) {
                set();
            });
            return;
        }
        set();
    })
}

function checkIfUpdated(doUpdateCallback, callback) {
    if(!adapter) return safeCallback(callback);
    if (!callback) callback = nop;
    var id = 'system.adapter.' + adapter.namespace;
    var vid = id + '.prevVersion';
    adapter.states.getState(vid, function(err, state) {
        var prevVersion = 0;
        var aktVersion = parseIntVersion(adapter.ioPack.common.version);
        prevVersion = parseIntVersion(hasProp(state, 'val') ? state.val : '0');
        if (prevVersion < aktVersion) {
            if (typeof doUpdateCallback == 'function') {
                doUpdateCallback(prevVersion, aktVersion, function (err) {
                    savePrevVersion();
                    callback();
                });
                return;
            } else {
                savePrevVersion();
            }
        }
        callback();
    });
}


function switchToDebug(force) {
    if (!adapter || !adapter.log) return;
    if (!force && !process.env.SOEF_DEBUG) return;
    adapter.log.debug = console.log;
    adapter.log.info = console.log;
    adapter.log.warn = console.log;
    module.parent.__DEBUG__ = true;
}
exports.switchToDebug = switchToDebug;

function _main (_adapter, options, callback ) {

    if (!_adapter || !_adapter.adapterDir) {
        options = _adapter;
        callback = options;
        _adapter = adapter;
    }

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
            adapter: _adapter
        };
    }

    switchToDebug();
    _devices.init(_adapter, function(err) {
        callback();
    });
};
exports.main = _main;

exports.Adapter = function (_args) {
    var args = arguments,
        fns = {};
    for (var i=0; i<args.length; i++) {
        var param = args[i];
        switch (typeof param) {
            case 'function':
                fns[param.name] = param;
                break;
            case 'object':
                fns.options = param;
                break;
            case 'string':
                fns.options = fns.options || {};
                fns.options.name = param;
                break;
        }
    }
    if (!fns.adapter) {
        var adpt = require('@iobroker/adapter-core');
        fns.adapter = adpt.adapter ? adpt.adapter : adpt.Adapter;
    }
    var options = fns.options;
    if (!options.unload) {
        options.unload = function (callback) {
            try {
                fns.onUnload ? fns.onUnload(callback) : callback();
            } catch (e) {
                callback();
            }
        }
    }
    if (!options.stateChange && fns.onStateChange) {
        options.stateChange = function (id, state) {
            if (state && !state.ack) {


                ///!!/////xxxxxxxxxxx//////////////////////////////////////
                //var _id = id.substr(fns.adapter.namespace.length+1);
                //_id = id.slice(fns.adapter.namespace.length+1);
                //if (global.devices) {
                //    global.devices.setrawval(_id, state.val);
                //}
                /////////////////////////////////////////////////////////

                fns.onStateChange(id, state);
            }
        };
    }
    if (!options.ready && fns.main) {
        options.ready = function () {
            checkIfUpdated(fns.onUpdate, function() {
                _main(fns.main);
            });
        }
    }
    if (!options.objectChange) {
        options.objectChange = function (id, obj) {
            if (id && obj == null && global.devices) {
                global.devices.remove(idWithoutNamespace(id));
            }
            if (fns.onObjectChange) fns.onObjectChange(id, obj);
        }
    }
    if (!options.message && fns.onMessage) {
        options.message = function(obj) {
            if (obj) fns.onMessage(obj);
        }
    }
    fns.adapter = fns.adapter(options);
    if (!adapter || !adapter.adapterDir) {
        adapter = fns.adapter;
    }
    return fns.adapter;
};

function changeAdapterConfig (_adapter, changeCallback, doneCallback) {
    _adapter.getForeignObject("system.adapter." + _adapter.namespace, function (err, obj) {
        if (!err && obj && !obj.native) obj['native'] = {};
        if (!err && obj && changeCallback(obj.native) !== false) {
            _adapter.setForeignObject(obj._id, obj, {}, function (err, s_obj) {
                _adapter.log.info("soef.changeAdapterConfig: changed");
                //_adapter.config = obj.native;   //?!?  nrmalisieren fehlt dann!!
                //_adapter.normalizeConfig ...
                if (doneCallback) doneCallback(err, obj);
            });
        }
    });
}
exports.changeAdapterConfig = changeAdapterConfig;

exports.changeConfig = function changeConfig(changeCallback, doneCallback) {
    if (!adapter) return false;
    return changeAdapterConfig(adapter, changeCallback, doneCallback)
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


exports.TimeDiff = function () {
    if (!(this instanceof exports.TimeDiff)) return new exports.TimeDiff();
    var start;
    this.get = process.hrtime.bind(process);

    this.getDif = function() {
        var ar = this.get();
        var _start = start[0] * 1e9 + start[1];
        var end = ar[0] * 1e9 + ar[1];
        return end - _start;
    };

    this.getMillis = function() {
        return this.getDif() / 1000000 >> 0;
    };
    this.getMicros = function() {
        return this.getDif() / 1000 >> 0;
    };
    this.start = function () {
        start = this.get();
    };

    start = process.hrtime();
    //return this;
}


exports.bufferIndexOf = function (buffer, search, offset, encoding){
    if (!Buffer.isBuffer(buffer)) return -1;

    if (typeof offset === 'string') {
        encoding = offset;
        offset = 0;
    }
    switch (typeof search) {
        case 'string':
            search = new Buffer(search, encoding || 'utf8');
            break;
        case 'number':
            search = new Buffer([search]);
            break;
        default:
            if (Array.isArray(search)) break;
            if (Buffer.isBuffer(search)) break;
            return -1;
    }

    var blen = buffer.length,
        slen = search.length;
    if (slen === 0) return -1;

    if (!offset || typeof offset != 'number') offset = 0;
    else if (offset < 0) offset = buffer.length + offset;
    if (offset < 0) offset = 0;

    for (var i=offset; i < blen; i++) {

        if(buffer[i] != search[0]) continue;
        for (var j=1; j<slen && i+j<blen; j++) {
            if(buffer[i+j] != search[j]) break;
        }
        if (j==slen) {
            return i;
        }
    }
    return -1;
};

exports.bufferSplit = function (buffer, delimiter) {
    var ar = [];

    for (var start= 0, idx=0; start<buffer.length; ) {
        idx = bufferIndexOf(buffer, delimiter, start);
        if (idx < 0) break;
        ar.push(buffer.slice(start, idx));
        start = idx+delimiter.length;
    }
    if (start <= buffer.length) {
        ar.push(buffer.slice(start, buffer.length));
    }
    return ar;
};

exports.bufferCat = function (buffer, chunk) {
    if (!chunk.length) return buffer;
    if (buffer && buffer.length) {
        var newBuffer = new Buffer(chunk.length + buffer.length);
        buffer.copy(newBuffer);
        chunk.copy(newBuffer,buffer.length);
        return newBuffer;
    }
    return chunk;
};

exports.Timer = function Timer (func, timeout, v1) {
    if (!(this instanceof Timer)) {
        return new Timer(func, timeout, v1);
    }
    var timer = null;
    this.inhibit = false;
    this.enable = function (bo) { this.inhibit = (bo === false); };
    this.set = function (func, timeout, v1) {
        if (timer) clearTimeout(timer);
        if (this.inhibit) return;
        timer = setTimeout(function() {
            timer = null;
            func(v1);
        }, timeout);
    };
    this.clear = function() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            return true;
        }
        return false;
    };
    this.clearAndInhibit = function () {
        this.inhibit = true;
        this.clear();
    };

    if (func) {
        this.set(func, timeout, v1);
    }
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

njs.dcs._forEach = forEachInSystemObjectView;
function forEachInSystemObjectView(type, id, readyCallback, callback) {
    adapter.objects.getObjectView('system', type, {startkey: id + '.', endkey: id + '.\u9999'}, null, function (err, res) {
        if (err || !res || !res.rows) return readyCallback && readyCallback();
        var i = 0;
        function doIt() {
            if (i >= res.rows.length) return readyCallback && readyCallback();
            var o = res.rows[i++];
            if (o) callback(o, doIt, type); else doIt();
        }
        doIt();
    });
};

njs.dcs.delOS = delObjectAndState;
function delObjectAndState(id, options, callback) {
    if (typeof options == 'function') {
        callback = options;
        options = null;
    }
    adapter.states.delState(id, function(err) {
        adapter.delObject(id, options, function (err) {
            return callback && callback();
        });
    });
}

// callback first all states, then all devices and then all channels
njs.dcs.forEach = forEachObjectChild;
function forEachObjectChild(id, options, readyCallback, callback) {
    if (typeof options === 'function') {
        callback = readyCallback;
        readyCallback = options;
        options = null;
    }
    if (!callback) {
        callback = readyCallback;
        readyCallback = null;
    }

    if (!adapter._namespaceRegExp.test(id)) id = adapter.namespace + (id ? '.' + id : '');

    function doChannels() {
        forEachInSystemObjectView('channel', id, readyCallback, callback);
    }
    function doDevices() {
        forEachInSystemObjectView('device', id, doChannels, function (o, next, type) {
            callback(o, function() {
                next(); //forEachObjectChild(o.id, options, callback, next);
            }, type);
        });
    }
    forEachInSystemObjectView('state', id, doDevices, callback);
};

//callback first all devices, then all channels and then all states
njs.dcs.forEach2 = forEachObjectChild2;
function forEachObjectChild2(id, options, readyCallback, callback) {
    if (typeof options === 'function') {
        callback = readyCallback;
        readyCallback = options;
        options = null;
    }
    if (!callback) {
        callback = readyCallback;
        readyCallback = null;
    }

    if (!adapter._namespaceRegExp.test(id)) id = adapter.namespace + (id ? '.' + id : '');

    function doStates() {
        forEachInSystemObjectView('state', id, readyCallback, callback);
    }
    function doChannels() {
        forEachInSystemObjectView('channel', id, doStates, callback);
    }
    forEachInSystemObjectView('device', id, doChannels, callback);
}


njs.dcs.del = delObjectWithStates;
function delObjectWithStates (id, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = undefined;
    }
    //if (!adapter._namespaceRegExp.test(id)) id = adapter.namespace + '.' + id;
    id = exports.ns.add(id);
    delObjectAndState(id, options, function (err) {
        forEachObjectChild(id, callback, function(o, next, type) {
            delObjectAndState(o.id, options, next);
            devices.remove(idWithoutNamespace(o.id));
        });
    });
}


njs.dcs.delall = function (callback) {
    var options = null;
    forEachObjectChild('', callback, function(o, next, type) {
        delObjectAndState(o.id, options, next);
    });
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function toHex (val) {
    return ('0' + val.toString(16)).substr(-2);
}
exports.toHex = toHex;

function arrayToHex(ar, len) {
    var s = "";
    if (len == undefined) len = ar.length;
    for (var i=0; i<len; i++) {
        s += toHex(ar[i]) + ' ';
    }
    return s;
}
exports.arrayToHex = arrayToHex;



function extendArray () {
    require('array-ext');
}
exports.extendArray = extendArray;

function extendNumber() {
    Number.prototype.toHex = function () {
        return ('0' + this.toString(16)).substr(-2);
    };
}
exports.extendNumber = extendNumber;
exports.extendAll = function () {
    extendArray ();
    extendNumber();
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.deleteOrphanedDevices = function (propName, _validArr, cb) {
    if (!adapter || !adapter.adapterDir) return;
    if (typeof propName !== 'string') {
        cb = _validArr;
        _validArr = propName;
        propName = undefined;
    }

    var validArr = [];
    _validArr.forEach(function(v) {
        validArr.push(normalizedName(propName ? v[propName] : v));
    });

    adapter.getDevices(function(err, res) {
        if (err || !res || res.length <= 0) return cb && cb();

        var toDelete = [];
        res.forEach(function(obj) {
            var v1 = obj._id.split('.')[2];
            if (!validArr.contains(v1)) {
                toDelete.push(obj._id);
            }
        });
        toDelete.forEachCallback(function(next, id) {
            dcs.del(id, next);
        }, cb);
    });
};

var fs = require('fs');

exports.isFile = exports.existFile = function (fn) {
    try {
        //_fs = _fs || require('fs');
        var stats = fs.lstatSync(fn);
        return stats.isFile();
    } catch(e) {
    }
    return false;
};

exports.isDirectory = exports.existDirectory = function (path) {
    try {
        //_fs = _fs || require('fs');
        var stats = fs.lstatSync(path);
        return stats.isDirectory();
    } catch(e) {
    }
    return false;
};


exports.readdirSync = function (fn, defaultReturnValue) {
    try {
        var list = fs.readdirSync (fn);
        if (list) {
            list.sort();
            var idx = list.indexOf('__DB__');
            if (idx >= 0) list.splice(idx, 1);
            return list;
        }
    } catch(e) {
        return defaultReturnValue;
    }
    return defaultReturnValue;
}


exports.lstatSync = function (path) {
    try {
        return (fs.lstatSync(path));
    } catch(e) {
        return e;
    }
}


'mkdirSync, unlinkSync, rmdirSync, renameSync, readFileSync, writeFileSync, unlink'.split(', ').forEach(function(funcName) {
    var func = fs[funcName];
    exports[funcName] = function (fn) {
        try {
            return func.apply(1, arguments) || true;
            //func (fn);
        } catch(e) {
            return false;
        }
        return true;
    }
});

exports.isWin = process.platform === 'win32';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var log = function (fmt, args) {
    adapter.log.info(exports.sprintf.apply (null, arguments));
};

log.error = function(fmt, args) { adapter.log.error(exports.sprintf.apply (null, arguments)); },
    log.info =  function(fmt, args) { adapter.log.info(exports.sprintf.apply (null, arguments)); },
    log.debug = function(fmt, args) {
        if (adapter.common.loglevel !== 'debug') {
            log.debug = function() {};
            return;
        }
        log.debug = function(fmt, args) {
            adapter.log.debug(exports.sprintf.apply (null, arguments));
        };
        adapter.log.debug(exports.sprintf.apply (null, arguments));
    };
log.warn  = function(fmt, args) { adapter.log.warn(exports.sprintf.apply (null, arguments)); };

exports.log = log;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var xmlParser, http;

var getHttpData =
    exports.getHttpData = function (url, options, cb) {
        if (!http) try { http = require('http'); } catch(e) { return cb && cb(-1) };
        if (cb == undefined) {
            cb = options;
            options = undefined;
        }
        options = options || {};
        if (options.encoding === undefined) options.encoding = 'utf8'; // utf-8 | binary

        if (/*options && */options.xml2json && xmlParser === -1) return cb && cb(-1);

        var request = http.get(url, function(response) {
            var data = '';
            //response.setEncoding(options.encoding);
            //response.setEncoding('binary'); // windows 1252?
            response.on('data', function(d) {
                data += d.toString(options.encoding);
            });
            response.on('end', function() {

                if (options && options.xml2json) {
                    if (xmlParser === undefined) try {
                        xmlParser = new require('xml2js').Parser({
                            explicitArray: false,
                            mergeAttrs: true,
                            normalizeTags: true,
                            ignoreAttrs: true
                        });
                    } catch (e) {
                        xmlParser = -1;
                        return cb && cb (-1);
                    }

                    xmlParser.parseString(data, function (err, json) {
                        cb(err, json);
                    });
                    return;
                }
                cb && cb(0, data);
            });
        });
        request.on('error', function(e) {
            console.error(e);
        });
        request.end();
        // request.setTimeout(timeout, function () {
        //     this.abort();
        //     cb && cb ('timeout', null, link);
        //     cb = null;
        // });

    };


var https;
var getHttpsData =
    exports.getHttpsData = function (url, options, cb) {
        if (!https) try { https = require('https'); } catch(e) { return cb && cb(-1) };
        if (cb == undefined) {
            cb = options;
            options = undefined;
        }
        options = options || {};
        if (options.encoding === undefined) options.encoding = 'utf8';

        if (options && options.xml2json && xmlParser === -1) return cb && cb(-1);

        var request = https.get(url, function(response) {
            var data = '';
            //response.setEncoding('utf8');
            response.on('data', function(d) {
                data += d.toString(options.encoding);
            });
            response.on('end', function() {

                if (options && options.xml2json) {
                    if (xmlParser === undefined) try {
                        xmlParser = new require('xml2js').Parser({
                            explicitArray: false,
                            mergeAttrs: true,
                            normalizeTags: true,
                            ignoreAttrs: true
                        });
                    } catch (e) {
                        xmlParser = -1;
                        return cb && cb (-1);
                    }

                    xmlParser.parseString(data, function (err, json) {
                        cb(err, json);
                    });
                    return;
                }
                cb && cb(0, data);
            });
        });
        request.on('error', function(e) {
            console.error(e);
        });
        request.end();
        // request.setTimeout(timeout, function () {
        //     this.abort();
        //     cb && cb ('timeout', null, link);
        //     cb = null;
        // });

    };



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function setPossibleStates(id, objarr, options, cb) {
    if (!adapter) return cb && cb('adapter not set');
    if (options === undefined) options = {};
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }
    adapter.getObject(id, function(err, obj) {
        if (err || !obj) return;
        if (objarr.remove || options.remove) {
            if (obj.common.states === undefined) return cb && cb('does not exist');
            delete obj.common.states;
        } else {
            if (!options.force && obj.common.states) return cb && cb('already set');
            obj.common.states = {};
            if (Array.isArray(objarr)) {
                objarr.forEach(function (v) {
                    obj.common.states[v] = v;
                });
            } else {
                obj.common.states = objarr;
            }
        }
        if (options.removeNativeValues && obj.native) delete obj.native.values;
        adapter.setObject(id, obj, function(err, _obj) {
            cb && cb(err, obj);
        });
    })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.arrayRemoveEE = function (ar) {
    for (var i=ar.length-1; i>=0; i--) {
        if (!ar[i]) ar.splice(i,1);
    }
};
exports.arrayRemoveEmptyEntries = exports.arrayRemoveEE;

exports.arrayJoinWithoutEmptyEntries = function (ar, sep) {
    var ret = '';
    ar.forEach(function (v) {
        if (v) {
            if (!ret) ret = v;
            else ret += sep + v;
        }
    });
    return ret;
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.getNodeVersion = function () {
    var version = 0;
    if (process || process.version) {
        var ar = process.version.split('.');
        if (ar[0].indexOf('v') === 0) ar[0] = ar[0].substr(1);
        for (var i=0; i<ar.length; i++) {
            version *= 1000;
            version += ~~ar[i];
        }
        //if (version >= 6000000) ;
    }
    return version;
};

exports.setAdapter = function (_adapter) {
    var ret = adapter;
    if (_adapter) adapter = _adapter;
    return ret;
};

var packageJson;
exports.getSoefVersion = exports.getOwnVersion = function () {
    try {
        if (!packageJson) packageJson = require('package.sjson');
        return packageJson.version;
    } catch(e) {
    }
    return undefined;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Merges dest to source recursive and returns changed
 *
 * @alias merge or mergeObject
 * @param {object} dest object
 * @param {object} source
 */
exports.merge = exports.mergeObject = function (dest, source) {
    var changed = false;
    Object.getOwnPropertyNames(source).forEach(function (name) {
        if (typeof source[name] === 'object') {
            if (typeof dest[name] !== 'object') {
                dest[name] = {}
            }
            changed |= exports.merge (dest[name], source[name]);
        } else {
            changed = changed || dest[name] !== source[name];
            dest[name] = source[name];
        }
    });
    return !!changed;
};

/**
 * Modifies an ioBroker object
 *
 * @alias modifyObject or modifyForeignObject
 * @param {string} id of the object to modify
 * @param {object or function} callback (obj)
 *        <pre><code>
 *            function (obj) {
         *              obj.common.name = 'name'
         *            }
 *            cann return false to not write the object.
 *
 *            if object, object will be merged.
 *            { common: { name: 'name }}
 *        </code></pre>

 */

/**
 * Creates or overwrites object in objectDB.
 *
 * This function can create or overwrite objects in objectDB for this adapter.
 * Only Ids that belong to this adapter can be modified. So the function automatically adds "adapter.X." to ID.
 * <b>common</b>, <b>native</b> and <b>type</b> attributes are mandatory and it will be checked.
 * Additionally type "state" requires <b>role</b>, <b>type</b> and <b>name</b>, e.g.:
 * <pre><code>{
         *     common: {
         *          name: 'object name',
         *          type: 'number', // string, boolean, object, mixed, array
         *          role: 'value'   // see https://github.com/ioBroker/ioBroker/blob/master/doc/SCHEMA.md#state-commonrole
         *     },
         *     native: {},
         *     type: 'state' // channel, device
         * }</code></pre>
 * @param {function} callback called after the object is written
 *        <pre><code>
 *            function (err, obj) {
         *              // obj is {id: id}
         *              if (err) adapter.log.error('Cannot write object: ' + err);
         *            }
 *        </code></pre>
 *
 *        lastIdToModify will be set to the id. can be used in objectChanged to ignore the change.
 *
 **/
exports.lastIdToModify = '';
exports.modifyObject = exports.modifyForeignObject = function (id, callbackOrObject, readyCallback) {
    adapter.getForeignObject(id, {}, function(err, obj) {
        if (err || !obj) return readyCallback && readyCallback(err);
        if (typeof callbackOrObject === 'function') {
            if (callbackOrObject (obj) === false) return readyCallback && readyCallback ('not changed');
        } else if (typeof callbackOrObject === 'object') {
            var changed = exports.merge(obj, callbackOrObject);
            if (!changed) return readyCallback && readyCallback ('not changed');
        }
        exports.lastIdToModify = id;
        adapter.setForeignObject(id, obj, {}, function(err,obj) {
            exports.lastIdToModify = undefined;
            readyCallback && readyCallback(err,obj);
        });
    })
}

var nodeVersion;
exports.minNodeVersion = function (minVersion) {
    var re = /^v*([0-9]+)\.([0-9]+)\.([0-9]+)/;
    if (nodeVersion === undefined) {
        var nv = re.exec (process.version);
        nodeVersion = nv[1]*100*100 + nv[2] * 100 + nv[3];
    }
    var rv = re.exec(minVersion);
    var mv = rv[1] * 100*100 + rv[2]*100 + rv[3];
    return nodeVersion >= mv;
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.callbackOrTimeout = function (timeout, callback) {
    if (typeof timeout === 'function') {
        var cb = timeout;
        timeout = callback;
        callback = cb;
    }
    var timer = setTimeout(function() {
        callback('timeout', null);
        callback = null;
    }, timeout);

    return function(err, data) {
        if (timer) clearTimeout(timer);
        return callback && callback(err, data);
    }
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.Devices = Devices;
exports.njs = njs;
exports.extendGlobalNamespace = extendGlobalNamespace;
exports._extendObject_ = false;


try {
    var _sprintf = require('sprintf-js');
    exports.sprintf = _sprintf.sprintf;
    exports.vsprintf = _sprintf.vsprintf;
} catch(e) {
    exports.sprintf = function(fs) { return 'sprintf-js not loaded ' + fs};
    exports.vsprintf = exports.sprintf
}

/*
 Object.defineProperty(O.prototype, 'b', {
 get: function() {
 return this.a;
 },
 set: function(val) {
 this.a = val;
 }
 });
 */

