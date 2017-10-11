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


function Deflections (sslDevice, adapter, devices) {
    if (!(this instanceof Deflections)) return new Deflections(sslDevice, adapter, devices);
    Array.call(this);
    this.sslDevice = sslDevice;
    this.devices = devices;
    this.init(sslDevice);
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
 *                noErrorChecking:
 * @returns {boolean}
 */

function getFunctions(dest, source, path, options) {

    if (typeof source.services === 'object') source = source.services;
    source = soef.getProp(source, path.endsWith('.actions') ? path : path + '.actions');
    if (!source) return false;

    function getFunction (funcName) {
        var func = source[funcName];
        return function () {
            //for (var j=0; i<arguments.length; j++) args.push(arguments[j]);
            var args = [].slice.call(arguments);
            var len = args.length-1;
            var cb = len >= 0 ? args[len] : undefined;

            if (typeof cb === 'function') {
                args[len] = function (err, data) {
                    if (err || !data) {
                        //console.log('Error: ' + funcName + ' err=' + err.message);
                        return options && options.noErrorChecking && cb(err, data);
                    }
                    var keys = Object.keys(data);

                    if (keys.length === 1 && data[keys[0]].startsWith ('<List><Item>')) {
                        parser.parseString (data[keys[0]], function (err, json) {
                            if (err || !json || !json.list || !json.list.item) return;
                            var ar = json.list.item;
                            ar.returnedName = keys[0];
                            if (options && options.errParam && cb) cb (err, er);
                            else cb && cb (ar);
                        });
                        return;
                    }
                    if (options && options.errParam) cb && cb(err, data);
                    else cb && cb (data);
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

    // self.VoIP.avm.GetNumberOfClients(function(data) {
    //     data = data;
    // });
    // self.VoIP.avm.GetClient3 ({'NewX_AVM-DE_ClientIndex': 0 }, function(data) {
    //     data = data;
    // });
    // self.VoIP.avm.GetClients (function(data) {
    //     data = data;
    // });
    //
    // self.VoIP.avm.GetPhonePort({NewIndex: "1"}, function (data) {
    //     data = data;
    // });

    var timer = new soef.Timer();
    var voips = {};

    self.OnTel.GetDeflections (function (deflections) {
        timer.set (self.createStates.bind (self, deflections, voips), 2000);

        self.VoIP.GetExistingVoIPNumbers (function (data) {
            var i = data.NewExistingVoIPNumbers;
            self.VoIP.avm.GetNumbers (function (numbers) {

                (function doIt () {
                    if (--i < 0) {
                        timer.clear();
                        self.createStates(deflections, voips);
                        return;
                    }
                    self.VoIP.avm.GetVoIPAccount ({NewVoIPAccountIndex: i}, function (account) {
                        var num = numbers[i];
                        account.name = num.name;
                        voips[num.number] = account;
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
