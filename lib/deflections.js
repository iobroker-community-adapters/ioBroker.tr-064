'use strict';

var soef = require('soef');
var xml2js = require('xml2js');
//var parser = new require('xml2js').Parser({
var parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    normalizeTags: true,
    ignoreAttrs: true
});
var adapter;


function Deflections (sslDevice, _adapter, devices) {
    if (!(this instanceof Deflections)) return new Deflections(sslDevice, _adapter, devices);
    Array.call(this);
    this.sslDevice = sslDevice;
    this.devices = devices;
    this.init(sslDevice);
    adapter = _adapter;
}
module.exports = Deflections;

Deflections.prototype = Object.create(Array.prototype);
Deflections.prototype.CHANNEL_DEFLECTIONS = "callForwarding";
Deflections.CHANNEL_DEFLECTIONS = "callForwarding";

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

    if (typeof source.services === 'object') source = source.services;
    source = soef.getProp(source, path.endsWith('.actions') ? path : path + '.actions');
    if (!source) return false;

    function getFunction (funcName) {
        var func = source[funcName];
        return function () {
            var errCallback, args = [].slice.call(arguments);
            var len = args.length-1;
            var cb = len >= 0 ? args[len] : undefined;

            if (typeof cb === 'function') {
                args[len] = function (err, data) {
                    if (err || !data) {
                        if (cb && cb.length >= 2) return cb (err, data);
                    }
                    var keys = Object.keys(data);

                    if (keys.length === 1 && data[keys[0]].startsWith ('<List><Item>')) {
                        parser.parseString (data[keys[0]], function (err, json) {
                            console.log ('in parseString callback');
                            if (err || !json || !json.list || !json.list.item) return;
                            var ar = json.list.item;
                            ar.returnedName = keys[0];
                            if (cb) {
                                cb.length >= 2 ? cb (err, ar) : cb (ar)
                            }
                        });
                        return;
                    }
                    if (cb) {
                        cb.length >= 2 ? cb (err, data) : cb (data)
                    }
                }
            } else {
                args.push (function (err, data) {
                });
            }
            func.apply(null, args);
        }
    }

    var only;
    if (options && options.only) {
        if (typeof options.only === 'string') only = options.only.split(',');
        else only = options.only;
    }

    Object.keys(source).forEach(function (funcName) {
        if (only && only.indexOf(funcName) < 0) return;
        if (funcName.startsWith('X_AVM-DE_')) {
            if (!dest.avm) dest.avm = {};
            dest.avm[funcName.substr(9)] = getFunction (funcName);
        } else {
            dest[funcName] = getFunction(funcName);
        }
    });
    if (!options) return true;
    var ar;
    if (options.only) options.expected = options.only; //??
    if (typeof options === 'string') ar = options.split(',');
    else if (Array.isArray(options)) ar = options;
    else if (options.expected) {
        ar = Array.isArray (options.expected) ? options.expected : options.expected.split (',');
    }
    if (ar) {
        var nop = function () {};
        ar.forEach(function (fn) {
            if (!dest[fn]) dest[fn] = nop;
        })
    }
    return true;
}


Deflections.prototype.init = function (sslDevice, cb, options) {
    var self = this;
    var ret = getFunctions(self.OnTel = {}, sslDevice, 'urn:dslforum-org:service:X_AVM-DE_OnTel:1', { only: ['GetDeflections','SetDeflectionEnable','GetDeflection' ] });
    if (!ret) return;

    getFunctions(self.VoIP = {}, sslDevice, 'urn:dslforum-org:service:X_VoIP:1', 'GetExistingVoIPNumbers');
    this.get(undefined, true);
};


Deflections.prototype.get = function (callback, create) {
    var voips = {};
    var self = this;
    self.OnTel.GetDeflections (function (deflections) {
        //timer.set (self.createStates.bind (self, deflections, voips), 2000);

        self.VoIP.GetExistingVoIPNumbers (function (data) {
            var i = data.NewExistingVoIPNumbers;
            self.VoIP.avm.GetNumbers (function (numbers) {

                (function doIt () {
                    if (--i < 0) {
                        //timer.clear();
                        self[create ? 'createStates' : 'updateStates'](deflections, voips);
                        callback && callback();
                        return;
                    }
                    self.VoIP.avm.GetVoIPAccount ({NewVoIPAccountIndex: i}, function (account) {
                        if (i < numbers.length && numbers[i]) {
                            var num = numbers[i];
                            account.name = num.name;
                        }
                        voips[num.number] = account;
                        //console.log(i, account);
                        doIt ();
                    });
                }) ();
            });
        });
    });
};

Deflections.prototype.createStates = function (deflections, voips) {
    var dev = new devices.CDevice(this.CHANNEL_DEFLECTIONS, 'Call forwarding');
    for (var i=0; i < deflections.length; i++) {
        var entry = deflections[i];
        var showName = '';
        if (entry.type === 'toVoIP' && voips[entry.number]) {
            var voip = voips[entry.number];
            showName = voip.name || voip.NewVoIPNumber;
            if (showName) showName = ' (' + showName + ')';
        }
        var name = entry.type + ' ' + entry.number + showName + ' -> ' + entry.deflectiontonumber;
        dev.set(entry.deflectionid, { val: entry.enable === '1', common: { name: name, type: 'boolean', role: 'state' }});
        adapter.log.debug('setting ' + entry.deflectionid + ' (' + name + ') enable=' + (entry.enable === '1'));
    }
    this.devices.update();
};

Deflections.prototype.updateStates = function (deflections, voips) {
    var dev = new devices.CDevice(this.CHANNEL_DEFLECTIONS, 'Call forwarding');
    for (var i=0; i < deflections.length; i++) {
        var entry = deflections[i];
        dev.set(entry.deflectionid, entry.enable === '1');
        adapter.log.debug('setting ' + entry.deflectionid + ' enable=' + (entry.enable === '1'));
    }
    this.devices.update();
};


Deflections.prototype.enable = function (id, val) {
    if (!this.OnTel.SetDeflectionEnable) return;
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
