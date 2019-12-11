/**

 Copyright (c) 2016 - 2017 soef <soef@gmx.net>
 All rights reserved.

 **/

'use strict';


if (!Object.assign) {
    Object.prototype.assign = function (target) {
        target = target || {};
        for (let i = 1; i < arguments.length; i++) {
            const source = arguments[i];
            for (const key in source) {
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
    const ar = propString.split('.');
    const len = ar.length;
    for (let i = 0; i < len; i++) {
        obj = obj[ar[i]];
        if (obj === undefined) return false;
    }
    return true;
}
exports.hasProp = hasProp;
exports.hasProperty = hasProp;

function getLastValidProp (obj, propString) {
    if (!obj) return undefined;
    const ar = propString.split('.');
    const len = ar.length;
    for (let i = 0; i < len; i++) {
        if (obj[ar[i]] === undefined) return obj;
        obj = obj[ar[i]];
    }
    return obj;
}
exports.getLastValidProp = getLastValidProp;

function getLastValidPropEx (obj, propString) {
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
exports.getLastValidPropEx = getLastValidPropEx;


function getProp (obj, propString) {
    if (!obj) return undefined;
    const ar = propString.split('.');
    const len = ar.length;
    for (let i = 0; i < len; i++) {
        obj = obj[ar[i]];
        if (obj === undefined) return undefined;
    }
    return obj;
}
exports.getProp = getProp;

function safeFunction(root, path, log) {
    const fn = getProp(root, path);
    if (typeof fn === 'function') return fn;
    if (log) {
        const err = getLastValidPropEx(root, path);
        if (typeof log !== 'function') log = adapter.log.debug;
        log(err.errPath + ' is not a function (' + path +')');
    }
    return function (params, callback) {
        if (!arguments.length) return;
        const fn = arguments [arguments.length-1];
        if (typeof fn === 'function') {
            fn(new Error(path + ' is not a function'));
        }
    };
}
exports.safeFunction = safeFunction;
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
        let props = Object.getOwnPropertyNames(from), destination;

        props.forEach(function (name) {
            if (typeof from[name] === 'object') {
                if (typeof dest[name] !== 'object') {
                    dest[name] = {};
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

    clone: function (from) {
        let props = Object.getOwnPropertyNames(from), destination, dest = {};

        props.forEach(function (name) {
            if (from[name] instanceof Array) {
                //dest[name] = new Array(from[name]);
                dest[name] = [].concat(from[name]);
            } else
            if (typeof from[name] === 'object') {
                if (typeof dest[name] !== 'object') {
                    dest[name] = {};
                }
                _fullExtend(dest[name],from[name]);
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
        let cnt = -1, len = arr.length;

        function doit() {
            if (++cnt >= len) {
                return readyCallback && readyCallback();
            }
            func(arr[cnt], doit);
        }
        doit();
    },

    forEachCB: function (maxcnt, func, readyCallback) {
        let cnt = -1;

        function doit(ret) {
            if (++cnt >= maxcnt) {
                return njs.safeCallback(readyCallback, ret);
            }
            func(cnt, doit);
        }

        doit(-1);
    },
    forEachSync: function (maxcnt, func, readyCallback) {
        let cnt = -1;

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
        let objs = [];
        if (!(objects instanceof Array)) {
            for (const i in objects) {
                objs.push(i);
            }
        } else {
            objs = objects;
        }
        const pop = step == -1 ? objs.pop : objs.shift;

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
        let ret = '';
        const ar = [deviceName, channelName, stateName];
        for (let i = 0; i < ar.length; i++) {
            const s = ar[i];
            if (!ret) ret = s;
            else if (s) ret += '.' + s;
        }
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
            return njs.tr[$0];
        });
    },


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    idWithoutNamespace: function (id, _adapter) {
        if (_adapter == undefined) _adapter = adapter;
        return id.substr(_adapter.namespace.length+1);
    },

    removeAllObjects: function  (adapter, callback) {

        adapter.getStates('*', function (err, states) {
            const st = [];
            for (const i in states) {
                st.push(i);
            }
            let s = 0;

            function dels() {

                if (s >= st.length) {
                    adapter.getChannels(function (err, channels) {
                        let c = 0;

                        function delc() {
                            if (c >= channels.length) {
                                adapter.getDevices(function (err, devices) {
                                    let d = 0;

                                    function deld() {
                                        if (d >= devices.length) {
                                            callback();
                                            return;
                                        }
                                        let did = devices[d++]._id;
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
                const nid = st[s++];
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
        const number = parseInt(val);
        if (number.toString() === val) return number;
        const float = parseFloat(val);
        if (float.toString() === val) return float;
        return val;
    },

    formatValue: function (value, decimals, _format) {
        if (_format === undefined) _format = '.,';
        if (typeof value !== 'number') value = parseFloat(value);

        const ret = isNaN(value) ? '' : value.toFixed(decimals || 0).replace(_format[0], _format[1]).replace(/\B(?=(\d{3})+(?!\d))/g, _format[0]);
        return (ret);
    }

};

for (const i in njs) {
    global[i] = njs[i];
}

function extendGlobalNamespace() {
    for (const i in njs) {
        global[i] = njs[i];
    }
}

let adapter;
function errmsg () { console.debug('adapter not assigned, use Device.setAdapter(yourAdapter)'); }

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

const objects = {};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function setObject(id, obj, options, callback) {
    adapter.log.debug('Set Object ' + id + ': ' + JSON.stringify(obj));
    return adapter.objects.setObject(adapter.namespace + '.' + id, obj, options, callback);
}
function getObject(id, options, callback) {
    return adapter.objects.getObject(adapter.namespace + '.' + id, options, callback);
}
function setState(id, val, ack) {
    //ack = ack || true;
    if (ack === undefined) ack = true;
    adapter.log.debug('Set State ' + id + ': ' + JSON.stringify(val) + ' / ack=' + ack);
    adapter.setState(id, val, ack);
}

function setObjectNotExists(id, newObj, callback) {
    getObject(id, {}, function (err, o) {
        if (!o) {
            setObject(id, newObj, {}, callback);
            return;
        }
        safeCallback(callback, 'exists', o);
    });
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function Devices (_adapter, _callback) {

    if (!_adapter || !_adapter.adapterDir) {
        _callback = _adapter;
        _adapter = undefined;
    }
    const that = this;
    this.list = [];

    this.setAdapter = function (_adapter) {
        adapter = _adapter;
    };
    this.has = function (id, prop) {
        const b = objects.hasOwnProperty(id);
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
        const obj = this.get(id);
        if (obj || !adapter || !adapter.namespace) return obj;
        id = id.substr(adapter.namespace.length+1);
        return objects[id];
    };
    this._getobjex = function(id) {
        return this.getobjex(id) || { val: undefined };
    };
    this.getval = function (id, _default) {
        const o = this.get(id);
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
        const r = new RegExp(pattern2RegEx(pattern));
        const result = [];
        for (const id in objects) {
            if (r.test(id)) result.push(id);
        }
        return result;
    };

    this.foreach = function (pattern, callback) {
        const r = new RegExp(pattern2RegEx(pattern));
        for (const id in objects) {
            if (r.test(id)) {
                if (callback (id, objects[id]) === false) {
                    return { id: id, val: objects[id]};
                }
            }
        }
    };

    this.createObjectNotExists = function (id, obj, callback) {
        let val;
        const newobj = {
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
            delete newobj.val;
        }
        setObjectNotExists(id, newobj, function(err, o) {
            if (!err) {
                //that.states[newobj._id] = newobj;
                objects[newobj._id] = newobj;
                if (val !== undefined) {
                    that.setState(newobj._id, val, true);
                }
            }
            safeCallback(callback, err, o);
        });
    };

    this.setState = function (id, val, ack) {
        if (val !== undefined) objects[id].val = val;
        else val = objects[id].val;
        //ack = ack || true;
        if (ack === undefined) ack=true;
        setState(id, val, ack);
    };

    this.setStateEx = function (id, newObj, ack, callback) {
        if (typeof ack === 'function') {
            callback = ack;
            ack = true;
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
            for (let i=0; i<list.length; i++) {
                const objName = Object.keys( list[i] )[ 0 ];
                this.setStateEx(objName, list[i][objName]);
            }
        } else {
            for (const id in list) {
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
            const o = {common: {name: ''} };
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
            const namespacelen = adapter.namespace.length + 1;
            for (const fullId in states) {
                let id = fullId.substr(namespacelen),
                    as = id.split('.'),
                    s = as[0];
                for (let i=1; i<as.length; i++) {
                    //if (!that.has(s)) that.setraw(s, { exist: true });
                    //!!
                    if (!that.has(s)) that.setraw(s, {});
                    s += '.' + as[i];
                }
                that.setraw(id, { val: states[fullId] ? states[fullId].val : null});
            }

            function setObjectProperty(obj, names, val) {
                const dot = names.indexOf('.');
                if (dot > 0) {
                    const n = names.substr(0, dot-1);
                    if (obj[n] === undefined) {
                        obj[n] = {};
                    }
                    setObjectProperty(obj[n], names.substr(dot+1), val);
                }
                obj[names] = val;
            }

            function doIt(list) {
                for (let i = 0; i < list.length; i++) {
                    const id = list[i]._id.substr(namespacelen);
                    const o = {common: {name: list[i].common.name}};
                    if (!objects[id]) {
                        objects[id] = {};
                    }
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

        let deviceName = '', channelName = '';
        const self = this;
        this.list = (list === undefined) ? that.list : list;

        function push (obj) {
            for (let i=0; i<self.list.length; i++) {
                if (self.list[i]._id === obj._id) {
                    return fullExtend(self.list[i], obj);
                }
            }
            self.list.push(obj);
            return obj;
        }

        this.setDevice = function (name, options) {
            channelName = '';
            if (!name) return;
            deviceName = normalizedName (name);
            const obj = { type: 'device', _id: deviceName };
            if (options) {
                Object.assign(obj, options);
            }
            return push(obj);
        };
        this.setDevice(_name, showName && typeof showName == 'string' ? {common: {name: showName}} : showName);

        this.setObjectName = function (id, showName) {
            for (let i=0; i<self.list.length; i++) {
                if (self.list[i]._id == id) {
                    _setobjname(self.list[i], showName);
                    return i;
                }
            }
            return -1;
        };

        this.setChannel = function (name, showNameOrObject) {
            if (name === undefined) channelName = '';
            else {
                channelName = name;
                const id = dcs(deviceName, channelName);
                if (!that.has(id)) {
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
        this.setChannelEx = function (name, showNameOrObject) {
            if (name === undefined) channelName = '';
            else {
                channelName = normalizedName(name);
                const id = dcs(deviceName, channelName);
                if (!that.has(id)) {
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

        function split(id, valOrObj, showName) {
            const ar = ((id && id[0] == '.') ? id.substr(1) : dcs(deviceName, channelName, id)).split('.');
            const dName = deviceName, cName = channelName;
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
            //if (valOrObj === null) return;
            if (valOrObj == null) return;
            if (name.indexOf('.') >= 0) {
                return split(name, valOrObj, showName);
            }
            const obj = val2obj(valOrObj, showName || name);
            obj._id = dcs(deviceName, channelName, name);
            obj.type = 'state';
            return push(obj);
        }

        function __setVal(_id, newObj) {
            const val = newObj['val'] !== undefined ? newObj.val : newObj;
            if (objects[_id].val !== val) {
                that.setState(_id, val, true);
            }
        }

        this.dset = function(d,s,v,showName) {
            const _id = dcs(d, '', s);
            if (!objects[_id]) {
                return add ('.'+_id, v, showName);
            }
            __setVal(_id, v);
        };

        this.rset = function (id, newObj, showName) {
            return this.set('.' + id, newObj, showName);
        };

        this.set = function (id, newObj, showName) {
            if (newObj == undefined) return;
            const _id = dcs(deviceName, channelName, id);
            if (!objects[_id]) {
                return add (id, newObj, showName);
            }
            const val = newObj['val'] !== undefined ? newObj.val : newObj;
            if (objects[_id].val !== val) {
                that.setState(_id, val, true);
                return true;
            }
            return false; //objects[_id];
        };
        this.setex = function (id, newObj, showName) {
            if (adapter && id.substr(0, adapter.namespace.length) == adapter.namespace) {
                id = id.substr(adapter.namespace.length+1);
            }
            return this.set(id, newObj, showName);
        };

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
            const id = dcs(deviceName, channelName, '');
            that.setObjectName(id, name);
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
            return objects[_id];
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
            let st = that.getobjex(id);
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

    const re = new RegExp('^' + _adapter.namespace + '.|^'); //  new/^adapter.0.|^/, '')
    const isre = new RegExp('^' + _adapter.namespace);
    this.no = function no (s) {
        return s.replace(re, '');
    };
    this.remove = this.no;
    this.is = isre.test.bind(isre); //.bind(this);
    this.add = function add (s) {
        return s.replace(re, _adapter.namespace + '.');
    };
    this.add2 = function add (s) {
        return s.replace(re, _adapter.namespace + (s ? '.' : ''));
    };
};
exports.CNamespace = CNamespace;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function parseIntVersion(vstr) {
    if (!vstr || vstr=='') return 0;
    const ar = vstr.split('.');
    let iVer = 0;
    for (let i=0; i<ar.length; i++) {
        iVer *= 1000;
        iVer += ar[i] >> 0;
    }
    return iVer;
}

function nop() {}

function savePrevVersion() {
    if(!hasProp(adapter, 'ioPack.common.version')) return;
    const id = 'system.adapter.' + adapter.namespace;
    const vid = id + '.prevVersion';

    function set() {
        adapter.states.setState(vid, { val: adapter.ioPack.common.version, ack: true, from: id });
    }

    adapter.objects.getObject(vid, function(err, obj) {
        if (err || !obj) {
            adapter.objects.setObject(vid, {
                type: 'state',
                common: {name: 'version', role: 'indicator.state', desc: 'version check for updates'},
                native: {}
            }, function (err, obj) {
                set();
            });
            return;
        }
        set();
    });
}

function checkIfUpdated(doUpdateCallback, callback) {
    if(!adapter) return safeCallback(callback);
    if (!callback) callback = nop;
    const id = 'system.adapter.' + adapter.namespace;
    const vid = id + '.prevVersion';
    adapter.states.getState(vid, function(err, state) {
        let prevVersion = 0;
        const aktVersion = parseIntVersion(adapter.ioPack.common.version);
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
    let _devices;
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
}
exports.main = _main;

exports.Adapter = function (_args) {
    const args = arguments,
        fns = {};
    for (let i=0; i<args.length; i++) {
        const param = args[i];
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
        const adpt = require('@iobroker/adapter-core');
        fns.adapter = adpt.adapter ? adpt.adapter : adpt.Adapter;
    }
    const options = fns.options;
    if (!options.unload) {
        options.unload = function (callback) {
            try {
                fns.onUnload ? onUnload(calback) : callback();
            } catch (e) {
                callback();
            }
        };
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
        };
    }
    if (!options.objectChange) {
        options.objectChange = function (id, obj) {
            if (id && obj == null && global.devices) {
                global.devices.remove(idWithoutNamespace(id));
            }
        };
    }
    if (!options.message && fns.onMessage) {
        options.message = function(obj) {
            if (obj) fns.onMessage(obj);
        };
    }
    fns.adapter = fns.adapter(options);
    if (!adapter || !adapter.adapterDir) {
        adapter = fns.adapter;
    }
    return fns.adapter;
};

function changeAdapterConfig (_adapter, changeCallback, doneCallback) {
    _adapter.getForeignObject('system.adapter.' + _adapter.namespace, function (err, obj) {
        if (!err && obj && !obj.native) obj['native'] = {};
        if (!err && obj && changeCallback(obj.native) !== false) {
            _adapter.setForeignObject(obj._id, obj, {}, function (err, s_obj) {
                _adapter.log.info('soef.changeAdapterConfig: changed');
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
    return changeAdapterConfig(adapter, changeCallback, doneCallback);
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


exports.TimeDiff = function () {
    if (!(this instanceof exports.TimeDiff)) return new exports.TimeDiff();
    this.get = process.hrtime;

    this.getDif = function() {
        const ar = this.get();
        const start = this.start[0] * 1e9 + this.start[1];
        const end = ar[0] * 1e9 + ar[1];
        return end - start;
    };

    this.getMillis = function() {
        return this.getDif() / 1000000 >> 0;
    };
    this.getMicros = function() {
        return this.getDif() / 1000 >> 0;
    };
    this.start = function () {
        this.start = this.get();
    };

    this.start = process.hrtime();
    return this;
};


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

    const blen = buffer.length,
        slen = search.length;
    if (slen === 0) return -1;

    if (!offset || typeof offset != 'number') offset = 0;
    else if (offset < 0) offset = buffer.length + offset;
    if (offset < 0) offset = 0;

    for (let i=offset; i < blen; i++) {

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
    const ar = [];

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
        const newBuffer = new Buffer(chunk.length + buffer.length);
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
    let timer = null;
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
        let i = 0;
        function doIt() {
            if (i >= res.rows.length) return readyCallback && readyCallback();
            const o = res.rows[i++];
            if (o) callback(o, doIt, type); else doIt();
        }
        doIt();
    });
}

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
}

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
    exports.ns.add(id);
    delObjectAndState(id, options, function (err) {
        forEachObjectChild(id, callback, function(o, next, type) {
            delObjectAndState(o.id, options, next);
            devices.remove(idWithoutNamespace(o.id));
        });
    });
}


njs.dcs.delall = function (callback) {
    const options = null;
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
    let s = '';
    if (len == undefined) len = ar.length;
    for (let i=0; i<len; i++) {
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

    const validArr = [];
    _validArr.forEach(function(v) {
        validArr.push(normalizedName(propName ? v[propName] : v));
    });

    adapter.getDevices(function(err, res) {
        if (err || !res || res.length <= 0) return cb && cb();

        const toDelete = [];
        res.forEach(function(obj) {
            const v1 = obj._id.split('.')[2];
            if (!validArr.contains(v1)) {
                toDelete.push(obj._id);
            }
        });
        toDelete.forEachCallback(function(next, id) {
            dcs.del(id, next);
        }, cb);
    });
};

let _fs;
exports.existFile = function (fn) {
    try {
        _fs = _fs || require('fs');
        const stats = _fs.lstatSync(fn);
        return stats.isFile();
    } catch(e) {
    }
    return false;
};
exports.existDirectory = function (path) {
    try {
        _fs = _fs || require('fs');
        const stats = _fs.lstatSync(path);
        return stats.isDirectory();
    } catch(e) {
    }
    return false;
};
exports.isWin = process.platform === 'win32';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const log = function (fmt, args) {
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

let xmlParser, http;

function getHttpData(url, options, cb) {
    if (!http) try { http = require('http'); } catch(e) { return cb && cb(-1); }
    if (cb == undefined) {
        cb = options;
        options = undefined;
    }

    if (options && options.xml2json && xmlParser === -1) return cb && cb(-1);

    const request = http.get(url, function(response) {
        let data = '';
        response.on('data', function(d) {
            data += d;
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

}
exports.getHttpData = getHttpData;

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
    });
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.callbackOrTimeout = function (timeout, callback) {
    if (typeof timeout === 'function') {
        const cb = timeout;
        timeout = callback;
        callback = cb;
    }
    const timer = setTimeout(function() {
        callback('timeout', null);
        callback = null;
    }, timeout);

    return function(err, data) {
        if (timer) clearTimeout(timer);
        return callback && callback(err, data);
    };
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


exports.Devices = Devices;
exports.njs = njs;
exports.extendGlobalNamespace = extendGlobalNamespace;

try {
    const _sprintf = require('sprintf-js');
    exports.sprintf = _sprintf.sprintf;
    exports.vsprintf = _sprintf.vsprintf;
} catch(e) {
    exports.sprintf = function(fs) { return 'sprintf-js not loaded ' + fs;};
    exports.vsprintf = exports.sprintf;
}

/*
var O = function () {
    this.a = 1;
    this.c = 3;
};

Object.defineProperty(O.prototype, 'b', {
    get: function() {
        return this.a;
    },
    set: function(val) {
        this.a = val;
    }
});

var o = new O();
o.a = 11;
o.b = 2;
*/

