'use strict';

const xml2js = require('xml2js');
const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    normalizeTags: true,
    ignoreAttrs: true
});

let adapter;

function Deflections(sslDevice, _adapter, devices) {
    if (!(this instanceof Deflections)) {
        return new Deflections(sslDevice, _adapter, devices);
    }

    Array.call(this);
    this.sslDevice = sslDevice;
    this.devices = devices;
    this.init(sslDevice);
    adapter = _adapter;
}

module.exports = Deflections;

Deflections.prototype = Object.create(Array.prototype);
Deflections.prototype.CHANNEL_DEFLECTIONS = 'callForwarding';
Deflections.CHANNEL_DEFLECTIONS = 'callForwarding';

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

/**
 *
 * @param dest
 * @param source
 * @param path
 * @param options only: array or string with function names. only this function will be generated.
 *                expected: expected functions. if not, a nop function will be used
 *                errParam:
 * @returns {boolean}
 */

function getFunctions(dest, source, path, options) {
    if (typeof source.services === 'object') {
        source = source.services;
    }

    source = getProp(source, path.endsWith('.actions') ? path : path + '.actions');

    if (!source) {
        return false;
    }

    function getFunction (funcName) {
        const func = source[funcName];
        return function () {
            const args = [].slice.call(arguments);
            const len = args.length-1;
            const cb = len >= 0 ? args[len] : undefined;

            if (typeof cb === 'function') {
                args[len] = function (err, data) {
                    if (err || !data) {
                        if (cb && cb.length >= 2) return cb (err, data);
                        return;
                    }
                    const keys = Object.keys(data);

                    if (keys.length === 1 && data[keys[0]].startsWith ('<List><Item>')) {
                        parser.parseString (data[keys[0]], (err, json) => {
                            console.log ('in parseString callback');
                            if (err || !json || !json.list || !json.list.item) {
                                return;
                            }

                            const ar = json.list.item;
                            ar.returnedName = keys[0];

                            if (cb) {
                                cb.length >= 2 ? cb (err, ar) : cb (ar);
                            }
                        });
                        return;
                    }
                    if (cb) {
                        cb.length >= 2 ? cb (err, data) : cb (data);
                    }
                };
            } else {
                args.push((_err, _data) => {});
            }
            func.apply(null, args);
        };
    }

    let only;
    if (options && options.only) {
        if (typeof options.only === 'string') {
            only = options.only.split(',');
        } else {
            only = options.only;
        }
    }

    Object.keys(source).forEach(funcName => {
        if (only && !only.includes(funcName)) {
            return;
        }
        if (funcName.startsWith('X_AVM-DE_')) {
            dest.avm = dest.avm || {};
            dest.avm[funcName.substr(9)] = getFunction(funcName);
        } else {
            dest[funcName] = getFunction(funcName);
        }
    });
    if (!options) {
        return true;
    }

    let ar;
    if (options.only) {
        options.expected = options.only;
    } //??

    if (typeof options === 'string') {
        ar = options.split(',');
    } else if (Array.isArray(options)) {
        ar = options;
    } else if (options.expected) {
        ar = Array.isArray (options.expected) ? options.expected : options.expected.split (',');
    }

    if (ar) {
        const nop = function () {};
        ar.forEach(fn => dest[fn] = dest[fn] || nop);
    }
    return true;
}

Deflections.prototype.init = function (sslDevice, _cb, _options) {
    const self = this;
    const ret = getFunctions(self.OnTel = {}, sslDevice, 'urn:dslforum-org:service:X_AVM-DE_OnTel:1', { only: ['GetDeflections','SetDeflectionEnable','GetDeflection' ] });
    if (!ret) {
        return;
    }

    getFunctions(self.VoIP = {}, sslDevice, 'urn:dslforum-org:service:X_VoIP:1', 'GetExistingVoIPNumbers');
    this.get(undefined, true);
};


Deflections.prototype.get = function (callback, create) {
    const voips = {};
    const self = this;
    self.OnTel.GetDeflections(deflections => {
        //timer.set (self.createStates.bind (self, deflections, voips), 2000);

        self.VoIP.GetExistingVoIPNumbers(data => {
            let i = data.NewExistingVoIPNumbers;

            self.VoIP.avm.GetNumbers(numbers => {
                (function doIt () {
                    if (--i < 0) {
                        //timer.clear();
                        self[create ? 'createStates' : 'updateStates'](deflections, voips);
                        callback && callback();
                        return;
                    }

                    self.VoIP.avm.GetVoIPAccount ({NewVoIPAccountIndex: i}, account => {
                        if (i < numbers.length && numbers[i]) {
                            const num = numbers[i];
                            account.name = num.name;
                            voips[num.number] = account;
                        }
                        //console.log(i, account);
                        doIt ();
                    });
                }) ();
            });
        });
    });
};

Deflections.prototype.createStates = function (deflections, voips) {
    const dev = new this.devices.CDevice(this.CHANNEL_DEFLECTIONS, 'Call forwarding');
    for (let i = 0; i < deflections.length; i++) {
        const entry = deflections[i];
        let showName = '';

        if (entry.type === 'toVoIP' && voips[entry.number]) {
            const voip = voips[entry.number];
            showName = voip.name || voip.NewVoIPNumber;
            if (showName) {
                showName = ' (' + showName + ')';
            }
        }

        const name = entry.type + ' ' + entry.number + showName + ' -> ' + entry.deflectiontonumber;
        dev.set(entry.deflectionid, { val: entry.enable === '1', common: { name: name, type: 'boolean', role: 'state' }});
        adapter.log.debug('setting ' + entry.deflectionid + ' (' + name + ') enable=' + (entry.enable === '1'));
    }

    this.devices.update();
};

Deflections.prototype.updateStates = function (deflections, _voips) {
    const dev = new this.devices.CDevice(this.CHANNEL_DEFLECTIONS, 'Call forwarding');

    for (let i = 0; i < deflections.length; i++) {
        const entry = deflections[i];
        dev.set(entry.deflectionid, entry.enable === '1');
        adapter.log.debug('setting ' + entry.deflectionid + ' enable=' + (entry.enable === '1'));
    }

    this.devices.update();
};


Deflections.prototype.enable = function (id, val) {
    if (!this.OnTel.SetDeflectionEnable) {
        return;
    }
    this.OnTel.SetDeflectionEnable({NewDeflectionId: id, NewEnable: ~~val});
};

// Deflections.prototype.set = function(id, state, val) {
//     if (!this.GetFeflection || !this.SetDeflection) return;
//     this.GetDeflection({ NewDeflectionId: id }, function (err, data) {
//         err = err;
//     })
// };

Deflections.prototype.onStateChange = function (id, cmd, val) {
    this.enable(id, val);
    // switch (cmd) {
    //     case 'enable':
    //         this.enable(id, val);
    //         break;
    //     // case 'deflectionToNumber':
    //     // case 'number':
    //     //     this.set(id, cmd.toLowerCase(), val);
    //     //     break;
    // }
};
