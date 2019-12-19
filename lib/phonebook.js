'use strict';

function Phonebook () {
    Array.call(this);
    this.areaCode = '';
    this.countryCode = '';
    this.countryAndAreaCode = '';
}

Phonebook.prototype = Object.create(Array.prototype);

Phonebook.prototype.start = function (sslDevice, cb, options) {
    this.init(sslDevice, function (err, res) {
        this.read(cb);
    }.bind(this), options);
};

let adapter = {
    log: { debug: console.log, error: console.log, info: console.log }
};

Phonebook.prototype.init = function (sslDevice, cb, options) {
    let _adapter;
    if (options !== undefined) {
        _adapter = options.adapter;
    }
    if (module.parent.exports.adapter !== undefined) {
        adapter = module.parent.exports.adapter;
    } else if (_adapter) {
        adapter = _adapter;
    }

    this.sslDevice = sslDevice;

    // repeater has no phonebook, so check it
    if (sslDevice && sslDevice.services) {
        const tel = sslDevice.services['urn:dslforum-org:service:X_AVM-DE_OnTel:1'];
        if (tel && tel.actions) {
            this.getPhonebookList  = tel.actions.GetPhonebookList;
            this.getPhonebookEntry = tel.actions.GetPhonebookEntry;
            this.getPhonebook      = tel.actions.GetPhonebook;
        }
        const voip = sslDevice.services['urn:dslforum-org:service:X_VoIP:1'];
        if (voip && voip.actions) {
            this.getVoIPCommonAreaCode    = voip.actions.GetVoIPCommonAreaCode;
            this.getVoIPCommonCountryCode = voip.actions.GetVoIPCommonCountryCode;
        }
    }

    const self = this;
    if (self.getVoIPCommonCountryCode) {
        self.getVoIPCommonCountryCode(function (err, res) {
            adapter.log.debug('getVoIPCommonCountryCode: ' + (err ? err.message : res.NewVoIPCountryCode));
            if (!err && res) {
                self.countryCode = res.NewVoIPCountryCode;
            }
            self.getVoIPCommonAreaCode(function (err, res) {
                adapter.log.debug('getVoIPCommonAreaCode: ' + (err ? err.message : res.NewVoIPAreaCode));
                if (!err && res) {
                    self.areaCode = res.NewVoIPAreaCode;
                    self.countryAndAreaCode = self.countryCode + self.areaCode.substr(1);
                }
                if (cb) cb(0);
            });
        });
    } else {
        if (cb) cb(-1);
    }
};


function loadImage(url) {
    const Inliner = require('inliner');
    new Inliner(url, {},  function (error, html) {
        // compressed and inlined HTML page
        console.log(html);
    });
}

function testLoadInmage(url) {
    setTimeout(loadImage, 100, url);
}


Phonebook.prototype.read = function (bo, cb) {
    if (bo === undefined || typeof bo === 'function') {
        cb = bo;
    }
    if (!bo) return cb ? cb(0) : 0;
    const self = this;
    adapter.log.debug('Phonebook.read');

    if (!self.getPhonebookList) {
        adapter.log.warn('Phonebook not supported');
        return cb ? cb(-1) : 0;
    }
    self.getPhonebookList(function (err, res) {
        if (err || !res) return cb ? cb(-1) : 0;
        adapter.log.debug('Phonebook.read: NewPhonebookList=' + res.NewPhonebookList);
        const books = res.NewPhonebookList.split(',');
        let no = 0;
        self.length = 0; //phoneBook = [];

        const url = require('url'),
            Parser = new require('xml2js').Parser({
                explicitArray: false,
                mergeAttrs: true,
                normalizeTags: true,
                ignoreAttrs: true
            });

        function doIt() {
            if (no >= books.length) {
                if (cb) cb(0);
                return;
            }
            const phonebookId = books[no++];
            self.getPhonebook({NewPhonebookID: phonebookId}, function (err, res) {
                adapter.log.debug('Phonebook ' + phonebookId + ': ' + JSON.stringify(res) + ' / err=' + err);
                if (err || !res) return cb ? cb(err) : 0;
                let u = url.parse(res.NewPhonebookURL),
                    data = '';
                //self.NewPhonebookURL = res.NewPhonebookURL;
                //self.ownUrl = res.NewPhonebookURL.replace(/\/phonebook.lua/, '\/download.lua');
                //if (self.ownUrl) self.ownUrl += "&path=";

                const ar = /^(.*)\/phonebook.lua\?(.*)/.exec(res.NewPhonebookURL);
                if (ar.length >= 3) {
                    self.ownUrl = ar[1] + '{imageurl}&' + ar[2];
                }

                require(u.protocol.slice(0,-1)).get({
                    hostname: u.hostname,
                    port: u.port,
                    path: u.path,
                    rejectUnauthorized: false
                }, function (result) {
                    result.on('data', function (chunk) {
                        data += chunk;
                    });
                    result.on('end', function () {
                        //adapter.log.debug('get.https: onEnd');
                        Parser.parseString(data, function (err, json) {
                            if (err || !json || !json.phonebooks || !json.phonebooks.phonebook || !json.phonebooks.phonebook.contact) return cb ? cb(err) : 0;
                            for (let i = 0; i < json.phonebooks.phonebook.contact.length; i++) {
                                const contact = json.phonebooks.phonebook.contact[i];
                                const numbers = (contact.telephony.number instanceof Array) ? contact.telephony.number : [contact.telephony.number];
                                //var numbers = (typeof contact.telephony.numer != 'string') ? contact.telephony.number : [contact.telephony.number];
                                for (let j = 0; j < numbers.length; j++) {
                                    if (!numbers[j] || numbers[j] === '' || !numbers[j].normalizeNumber) {
                                        continue;
                                    }
                                    // if (contact.person.imageurl) {
                                    //     self.getPhonebookEntry( { NewPhonebookID: ~~phonebookId, NewPhonebookEntryID: i/*~~contact.uniqueid*/ }, function(err, data) {
                                    //         err = err;
                                    //     });
                                    // }
                                    const newEntry = {
                                        name: contact.person.realname,
                                        normalizedName: normalizeName(contact.person.realname),
                                        number: self.complete(numbers[j]),
                                        id: contact.uniqueid,
                                        phonebookId: phonebookId
                                    };
                                    if (contact.person.imageurl && self.ownUrl) {
                                        //newEntry.imageurl = self.ownUrl + contact.person.imageurl.replace(/^.*?path\=/, '');
                                        newEntry.imageurl = self.ownUrl.replace(/\{imageurl\}/, contact.person.imageurl);
                                        //if (!/^https*:\/\//.test(newEntry.imageurl)) {
                                        //    newEntry.imageurl = self.NewPhonebookURL.replace (/\/phonebook.lua\?/, contact.person.imageurl + '&');
                                        //}
                                        // if (contact.person.imageurl.indexOf('://') >= 0) {
                                        //     newEntry.imageurl = contact.person.imageurl.replace(/^.*(https*:\/\/.?)/, '$1');
                                        // } else {
                                        //     newEntry.imageurl = self.NewPhonebookURL.replace (/\/phonebook.lua\?/, contact.person.imageurl + '&');
                                        //     //testLoadInmage(newEntry.imageurl);
                                        // }
                                    }
                                    adapter.log.debug('Phonebook ' + phonebookId + ' New Entry: ' + JSON.stringify(newEntry));
                                    self.push(newEntry);
                                }
                            }
                            //adapter.log.debug('get.https: calling doIt()');
                            setTimeout(doIt, 10);
                        });
                    });
                    result.on('error', function (e) {
                        if (cb) cb(e);
                    });
                });
            });
        }

        doIt();
    });
};


Phonebook.prototype.start = function (sslDevice, cb, options) {
    if(typeof cb !== 'function' && typeof options === 'function') {
        const _cb = options;
        options = cb;
        cb = _cb;
    }

    if (options !== undefined && options.return) return cb ? cb(0) : 0;

    this.init(sslDevice, function(_res) {
        this.read(cb);
    }.bind(this), options);
};

Phonebook.prototype.complete = function (number) {
    number = number.normalizeNumber();
    if (this.areaCode !== '') {
        if (this.countryAndAreaCode !== '' && number.indexOf(this.countryAndAreaCode) !== 0) {
            if (number[0] === '0') {
                if (number.substr(0, 2) === '00') return number;
                return this.countryCode + number.substr(1);
            }
            return this.countryAndAreaCode + number;
        }
    }
    return number;
};

Phonebook.prototype.findNumber = function (number) {
    const v = this.byNumber(number);
    return v ? v.name : '';
};

Phonebook.prototype.byNumber = function (number) {
    number = this.complete(number);
    const entry = this.find(function (v) {
        return v.number === number;
    });
    adapter.log.debug('Search number ' + number + ' in phonebook: ' + JSON.stringify(entry));
    return entry;
};


const umls = { '\u00e4': 'ae', '\u00fc': 'ue', '\u00f6': 'oe', '\u00c4': 'Ae', '\u00d6': 'Oe', '\u00dc': 'Ue', '\u00df': 'ss' };
function normalizeName(name) {
    name = name.replace(/[\u00e4\u00fc\u00f6\u00c4\u00d6\u00dc\u00df]/g, function (p) { return umls [p]; });
    name = name.toLowerCase().replace(/[^a-z]/g, '');
    return name;
}

Phonebook.prototype.byName = function (name) {
    name = normalizeName(name);
    let entry = this.find(function (v) {
        return v.normalizedName === name;
    });
    let fallbackUsed = false;
    if (!entry) {
        entry = this.find(function (v) {
            return v.normalizedName.indexOf(name) >= 0;
        });
        fallbackUsed = true;
    }
    adapter.log.debug('Search name ' + name + ' in phonebook (Fallback=' + fallbackUsed + '): ' + JSON.stringify(entry));
    return entry;
};

module.exports = new Phonebook();
