function forEachObjSync(objects, step, func, readyCallback) {
    if (typeof step === 'function') {
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
    const pop = step === -1 ? objs.pop : objs.shift;

    function doit(ret) {
        if (objs.length <= 0) {
            return typeof readyCallback === 'function' && readyCallback(ret);
        }
        func(pop.call(objs), doit);
    }

    doit(-1);
}

function _fullExtend(dest, from) {
    const props = Object.getOwnPropertyNames(from);
    let destination;

    props.forEach(name => {
        if (typeof from[name] === 'object') {
            if (typeof dest[name] !== 'object') {
                dest[name] = {};
            }
            _fullExtend(dest[name], from[name]);
        } else {
            destination = Object.getOwnPropertyDescriptor(from, name);
            Object.defineProperty(dest, name, destination);
        }
    });
}
function fullExtend(dest, from) {
    _fullExtend(dest, from);
    return dest;
}

function dcs(deviceName, channelName, stateName) {
    if (!stateName) {
        stateName = channelName;
        channelName = '';
    }
    if (stateName[0] === '.') {
        return stateName.substr(1);
    }
    return [deviceName, channelName, stateName].filter(t => t).join('.');
}

function valType(val) {
    switch (val) {
        //fastest way for most states
        case true:
        case 'true':
            return true;
        case false:
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
    const sVal = val.toString();

    const number = parseInt(sVal);
    if (number.toString() === sVal) {
        return number;
    }
    const float = parseFloat(sVal);

    if (float.toString() === sVal) {
        return float;
    }

    return val;
}

const tr = {
    '\u00e4': 'ae',
    '\u00fc': 'ue',
    '\u00f6': 'oe',
    '\u00c4': 'Ae',
    '\u00d6': 'Oe',
    '\u00dc': 'Ue',
    '\u00df': 'ss',
    ' ': '_',
    '.': '_'
};

function normalizedName(name) {
    return name.replace(/[\u00e4\u00fc\u00f6\u00c4\u00d6\u00dc\u00df .]/g, $0 => tr[$0]);
}

function hasProp (obj, propString) {
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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function Devices(adapter, onReady) {
    const that = this;
    this.list = [];
    const objects = {};

    this.has = function (id, prop) {
        const b = Object.prototype.hasOwnProperty.call(objects, id);
        if (prop === undefined) {
            return b;
        }
        return b && objects[id] !== null && Object.prototype.hasOwnProperty.call(objects[id], prop);
    };

    this.get = function (id) {
        return objects[id];
    };

    this.remove = function(id) {
        delete objects[id];
    };

    this.setraw = function (id, obj) {
        objects[id] = obj;
    };

    this.getobjex = function (id) {
        const obj = this.get(id);
        if (obj || !adapter.namespace) {
            return obj;
        }
        id = id.substr(adapter.namespace.length + 1);
        return objects[id];
    };
    this._getobjex = function(id) {
        return this.getobjex(id) || { val: undefined };
    };
    this.getval = function (id, _default) {
        const o = this.get(id);
        if (o && o.val !== undefined) {
            return o.val;
        }
        return _default;
    };

    this.createObjectNotExists = function (id, obj, callback) {
        let val;
        const newobj = {
            type: 'state',
            common: {
                name: id,
                type: 'string',
                role: obj.type || 'state'
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

        adapter.setObjectNotExists(id, newobj, (err, o) => {
            if (!err) {
                objects[newobj._id] = newobj;
                if (val !== undefined) {
                    that.setState(newobj._id, val, true);
                }
            }
            typeof callback === 'function' && callback(err, o);
        });
    };

    this.setState = function (id, val, ack) {
        if (val !== undefined) {
            objects[id].val = val;
        } else {
            val = objects[id].val;
        }
        if (ack === undefined) {
            ack = true;
        }
        adapter.setState(id, val, ack);
    };

    this.setStateEx = function (id, newObj, ack, callback) {
        if (typeof ack === 'function') {
            callback = ack;
            ack = true;
        }
        if (typeof newObj !== 'object') {
            newObj = {val: newObj};
        }

        if (ack === undefined) {
            ack = true;
        }

        if (!that.has(id)) {
            that.createObjectNotExists(id, newObj, callback);
        } else {
            if (objects[id].val !== newObj.val) {
                that.setState(id, newObj.val, ack);
            }
            typeof callback === 'function' && callback(0);
        }
    };

    function val2obj(valOrObj, showName) {
        //if (valOrObj === null) return;
        //if (!valOrObj) return;
        let obj;
        if (typeof valOrObj === 'object') {
            obj = valOrObj || {};
        } else {
            obj = {};
            if (valOrObj !== undefined) {
                obj.val = valType(valOrObj);
            }
        }
        if (showName && !hasProp(obj, 'common.name')) {
            //_fullExtend(obj, { common: { name: showName}});
            _setobjname(obj, showName);
        }
        return obj;
    }

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
        if (!list || !list.length) {
            return callback && callback(-1);
        } else {
            forEachObjSync(list, (obj, doit) => that.setStateEx(obj._id, obj, true, doit), callback);
        }
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
        adapter.getForeignStates(adapter.namespace + '.*', (err, states) => {
            if (err || !states) {
                return typeof callback === 'function' && callback(-1);
            }

            const namespacelen = adapter.namespace.length + 1;

            for (const fullId in states) {
                const id = fullId.substr(namespacelen);
                const as = id.split('.');
                let s = as[0];

                for (let i = 1; i < as.length; i++) {
                    //if (!that.has(s)) that.setraw(s, { exist: true });
                    //!!
                    if (!that.has(s)) {
                        that.setraw(s, {});
                    }
                    s += '.' + as[i];
                }

                that.setraw(id, {val: states[fullId] ? states[fullId].val : null});
            }

            function doIt(list) {
                for (let i = 0; i < list.length; i++) {
                    const id = list[i]._id.substr(namespacelen);
                    const o = {common: {name: list[i].common.name}};
                    if (!objects[id]) {
                        objects[id] = {};
                    }
                    if (list[i].native) {
                        o.native = list[i].native;
                    }
                    fullExtend(objects[id], o);
                }
            }

            adapter.getDevices((err, devices) => {
                doIt(devices);

                adapter.getChannels('', (err, channels) => {
                    doIt(channels);
                    typeof callback === 'function' && callback(0);
                });
            });
        });
    };

    this.CDevice = function CDevice (_name, showName, list) {
        let deviceName = '';
        let channelName = '';
        const self = this;
        this.list = list === undefined ? that.list : list;

        function push(obj) {
            for (let i = 0; i < self.list.length; i++) {
                if (self.list[i]._id === obj._id) {
                    return fullExtend(self.list[i], obj);
                }
            }
            self.list.push(obj);
            return obj;
        }

        this.setDevice = function (name, options) {
            channelName = '';
            if (!name) {
                return;
            }
            deviceName = normalizedName(name);
            const obj = {type: 'device', _id: deviceName};
            if (options) {
                Object.assign(obj, options);
            }
            return push(obj);
        };

        this.setDevice(_name, showName && typeof showName == 'string' ? {common: {name: showName}} : showName);

        this.setObjectName = function (id, showName) {
            for (let i = 0; i < self.list.length; i++) {
                if (self.list[i]._id === id) {
                    _setobjname(self.list[i], showName);
                    return i;
                }
            }
            return -1;
        };

        this.setChannel = function (name, showNameOrObject) {
            if (name === undefined) {
                channelName = '';
            } else {
                channelName = name;
                const id = dcs(deviceName, channelName);

                if (!that.has(id)) {
                    let obj;
                    if (typeof showNameOrObject === 'object') {
                        obj = {type: 'channel', _id: id, common: {name: name} };
                        if (showNameOrObject.common) {
                            obj.common = showNameOrObject.common;
                        }
                        if (showNameOrObject.native) {
                            obj.native = showNameOrObject.native;
                        }
                    } else {
                        obj = {type: 'channel', _id: id, common: {name: showNameOrObject || name}};
                    }

                    return push(obj);
                }
            }
        };
        this.setChannelEx = function (name, showNameOrObject) {
            if (name === undefined) {
                channelName = '';
            } else {
                channelName = normalizedName(name);
                const id = dcs(deviceName, channelName);
                if (!that.has(id)) {
                    let obj;
                    if (typeof showNameOrObject == 'object') {
                        obj = {type: 'channel', _id: id, common: {name}};
                        if (showNameOrObject.common) {
                            obj.common = showNameOrObject.common;
                        }
                        if (showNameOrObject.native) {
                            obj.native = showNameOrObject.native;
                        }
                    } else {
                        obj = {type: 'channel', _id: id, common: {name: showNameOrObject || name}};
                    }
                    return push(obj);
                }
            }
        };

        function split(id, valOrObj, showName) {
            const ar = ((id && id[0] === '.') ? id.substr(1) : dcs(deviceName, channelName, id)).split('.');
            const dName = deviceName, cName = channelName;
            let ret;
            switch(ar.length) {
                case 3:
                    self.setDevice(ar.shift());
                    // BF: Hope it is desired without break here
                case 2:
                    self.setChannel(ar.shift());
                    // BF: Hope it is desired without break here
                default:
                    ret = add(ar[0], valOrObj, showName);
                    deviceName = dName;
                    channelName = cName;
                    return ret;
            }
        }

        function add(name, valOrObj, showName) {
            if (valOrObj === null) {
                return;
            }

            if (name.includes('.')) {
                return split(name, valOrObj, showName);
            }
            const obj = val2obj(valOrObj, showName || name);
            obj._id = dcs(deviceName, channelName, name);
            obj.type = 'state';
            return push(obj);
        }

        this.set = function (id, newObj, showName) {
            if (newObj === undefined || newObj === null) {
                return;
            }
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

        this.getobjex = function (id) {
            id = dcs(deviceName, channelName, id);
            return that.getobjex(id);
        };
        this._getobjex = function(id) {
            return this.getobjex(id) || {val: undefined};
        };

        this.setraw = function (id, val) {
            this._getobjex(id).val = val;
        };

        this.get = function(channel, id) {
            let _id;
            if (id === undefined) {
                _id = dcs(deviceName, channelName, channel);
            } else {
                _id = dcs(deviceName, channel, id);
            }
            return objects[_id];
        };

        this.createNew = function (id, newObj, showName) {
            if (this.get(id)) {
                return;
            }
            this.set(id, newObj, showName);
        };
        this.setAndUpdate = function (id, newObj, cb) {
            this.set(id, newObj);
            this.update(cb);
        };

        this.clear = function(id) {
            id = id.startsWith(adapter.namespace + '.') ? id.replace(adapter.namespace + '.', '') : id;
            let st = that.getobjex(id);
            if (st === undefined) {
                return;
            }

            switch(typeof st.val) {
                case 'string':
                    st = '';
                    break;
                case 'boolean':
                    st = false;
                    break;
                case 'number':
                    st = 0;
                    break;
                default:
                    return;
            }
            this.setAndUpdate(id, st);
        };

        this.update = function (callback) {
            if (this.list.length > 0) {
                that.update(this.list, callback);
            } else {
                typeof callback === 'function' && callback();
            }
        };
    };

    this.root = new this.CDevice('');

    this.readAllExistingObjects(onReady);

    return this;
}

module.exports = Devices;
