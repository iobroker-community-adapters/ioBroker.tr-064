'use strict';

let systemData;
let adapter;

const LINESTART = '<!!--Entry-->';
const LINEEND   = '<!!--EntryEnd-->';
const NO2NAME   = {0: 'all', 1: 'inbound', 2: 'missed', 3: 'outbound'};
const TYPES     = { all: 0, inbound: 1, missed: 2, outbound: 3};
//var SYMS      = {1: '⯈' /*blau*/,  2: '⯁' /*rot*/, 3: '⯇' /*grün*/ };
const SYMS      = {
    1: '>' /*blau*/,  2: 'x' /*rot*/, 3: '<' /*grün*/, // completed entries.
    9: '>' /*blau*/,  10: 'x' /*rot*/, 11: '<' /*grün*/  // currently running (10= Blocked)
};

//var ESCAPED_SYMS = {};
// for (var symNumber in SYMS) {
//     ESCAPED_SYMS [symNumber] = '&#' + SYMS[symNumber].charCodeAt(0) + ';';
// }

let xmlParser, http;

function getHttpData(url, options, cb) {
    http = http || require('http');

    if (typeof cb !== 'function') {
        cb = options;
        options = undefined;
    }

    if (options && options.xml2json && xmlParser === -1) {
        return cb && cb(-1);
    }

    const request = http.get(url, response => {
        let data = '';
        response.on('data', d => data += d);
        response.on('end', () => {

            if (options && options.xml2json) {
                if (xmlParser === undefined) {
                    try {
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
                }

                return xmlParser.parseString(data, (err, json) => cb(err, json));
            }
            cb && cb(0, data);
        });
    });
    request.on('error', e => console.error(e));
    request.end();

}

const normalizeConfig =
exports.normalizeConfig = function normalizeConfig (cfg, self) {
    cfg.use = false;
    for (const n in TYPES) {
        const o = cfg[n];
        if (!o) {
            continue;
        }
        if (o.generateHTML !== undefined && o.generateHtml === undefined) {
            o.generateHtml = o.generateHTML;
        }
        if (o.generateJSON !== undefined && o.generateJson === undefined) {
            o.generateJson = o.generateJSON;
        }
        const use = !!(o.generateHtml || o.generateJson) && o.maxEntries > 0;
        if (self && self[n]) {
            self[n].use = use;
            self[n].cfg = o;
        }
        cfg.use = cfg.use || use;
    }
};

const CallList = function (type) {
    this.count = 0;
    this.lastId = 0;
    this.array = [];
    this.type = type;
};

exports.ROOT = 'calllists';
exports.S_HTML_TEMPLATE = exports.ROOT + '.htmlTemplate.htmlTemplate';

const callLists = function () {
    if (this.lastTimestamp === undefined) {
        this.lastId = 0;
        this.lastTimestamp = 0;
        for (const n in TYPES) {
            this[n] = new CallList(n);
        }
    }
    const self = this;
    const html = {
        _template: '' +
            '<!-- Variables: id, type, caller, called, callednumber, name, numbertype, device, port date, duration, count, path.' +
            'to use with %() e.g. %(date) -->' +
            '<div>The last call was from %(name) at %(date) from %(caller)</div>' +
            '<div>%(type): %(count)' +
            '<table>' +
            LINESTART + '<tr><td>%(date)</td><td>%(name)</td><td>%(caller)</td></tr>' + LINEEND +
            '</table>' +
            '</div>',
        template: '',
        line: '',
        result: '',

        reLine: /%\((.*?)\)/g,
        re: new RegExp (LINESTART + '(.*?)' + LINEEND),
        set: function (s)  {
            adapter.log.debug('Set Template: ' + JSON.stringify(s));
            //if (!s) return;
            let start = 0;
            s = s || this._template;
            if (typeof s !== 'string') s = s.toString();
            this.origTemplate = s;
            s = s.replace(/^<!--.*?-->/, '');
            this.template = s.replace(this.re, function (match, cmd, pos) {
                this.line = cmd;
                //this.lineStart = pos;
                start = pos;
                return '';
            }.bind(this));
            this._result = this.template.substr(0, start);
            this._result2 = this.template.substr(start);
        },
        replace: function(str, obj) {
            if (!obj) {
                return str;
            }
            return str.replace(/%\((.*?)\)/g, function (match, p) {
                if (obj[p]) {
                    return obj[p];
                }
                return '';
            });
        },
        addLine: function(call) {
            this.result += this.replace(this.line, call);
        },
        prep: function(list) {
            if (!this._result || !this._result2) {
                adapter.log.info('Calllist HTML Template not initialized. Use default');
                this.set();
            }
            this.result = this.replace(this._result, list);
            this.result2 = this.replace(this._result2, list);
            this.result = this.replace(this.result, list.array[0]);
            this.result2 = this.replace(this.result2, list.array[0]);
        },
        build: function(list) {
            this.prep(list);
            for (let i=list.array.length-1; i>=0; i--) {
                this.addLine(list.array[i]);
            }
            this.result += this.result2;
        }
    };
    Object.defineProperty(this, 'htmlTemplate', {
        get: function () {
            return html.origTemplate;
        },
        set: html.set.bind(html)
    });

    normalizeConfig(adapter.config.calllists, self);

    // var externalMapping = {
    //     0: '',
    //     1: 'caller',
    //     2: 'caller',
    //     3: 'called'
    // };

    this.addCall2List = function (call, listName) {
        if (!call) {
            return;
        }
        const list = this[listName];
        if (!list || !list.use) {
            adapter.log.debug('list ' + listName + ' not used, ignore');
            return;
        }
        if (!list.array.find(function (v) {
            return v.id === call.id;
        })) {
            list.array.unshift(call);
            while(list.array.length > list.cfg.maxEntries) {
                list.array.pop();
            }
            if (list.lastId < call.id) {
                list.lastId = call.id;
                list.count += 1;
            }
        }
    };

    this.addCall = function(call){
        call.id = ~~call.id;

        if (call.type > 3) {
            adapter.log.debug('Ignoring call ID' + call.id + ' because call still active or blocked (call.type = ' + call.type + ')');
        } else {
            adapter.log.debug('Processing call ID' + call.id + ' (call.type = ' + call.type + ')');
            call.sym = SYMS[call.type];
            //call.external = call [externalMapping[~~call.type]];
            call.external = call [(~~call.type) === 3 ? 'called' : 'caller'];
            //call.escapedSym = ESCAPED_SYMS[call.type];
            this.addCall2List(call, NO2NAME[call.type] || call.type);
            this.addCall2List(call, 'all');
        }
    };

    this.add = function(call, timestamp) {
        if (!call) {
            return;
        }
        if (timestamp && timestamp > this.lastTimestamp) {
            this.lastTimestamp = timestamp;
        }

        let blocker = false;

        if (Array.isArray(call)) {
            adapter.log.debug('Separating parallel calls for calllist handling');
            call.reverse();
            call.forEach(singleCall => {
                this.addCall(singleCall); // process all calls of the array
                // but don't update lastId if an earlier started call is still active
                if (singleCall.type == 9 || singleCall.type == 11) {
                    blocker = true;
                }

                if (!blocker && singleCall.id > systemData.native.callLists.lastId) {
                    systemData.native.callLists.lastId = singleCall.id;
                }
            });
        } else {
            this.addCall(call);

            if (call.id > this.lastId) {
                this.lastId = call.id;
            }
        }
    };

    this.forEach = function (cb) {
        for (const n in TYPES) {
            const list = self[n];
            if (!list || !list.use) {
                continue;
            }
            list.cfg.generateHtml && html.build(list);
            cb(list, n, html.result, self);
        }
    };
};

exports.init = function (_adapter, _systemData) {
    if (module.parent.exports.adapter !== undefined) {
        adapter = module.parent.exports.adapter;
    } else {
        adapter = _adapter;
    }

    systemData = _systemData;
};

function refresh(err, data, cb, done, fallbackTry) {
    if (err || !data) {
        return done && done();
    }
    if (!systemData.native.callLists) {
        return done && done();
    }
    let url = data.NewCallListURL;
    if (systemData.native.callLists.lastTimestamp && url) {
        url += '&timestamp=' + systemData.native.callLists.lastTimestamp;
    }
    if (systemData.native.callLists.lastId && url) {
        url += '&id=' + systemData.native.callLists.lastId;
    }
    //url += '&max=999';
    if (!url || url.startsWith('https:')) {
        return done && done();
    }

    adapter.log.debug('Request Calllist JSON: url = ' + url);
    getHttpData(url, {xml2json: true}, (err, json) => {
        adapter.log.debug('Result Calllist JSON: ' + JSON.stringify(json));
        if (json && json.root) {
            // it seems that the latest id is smaller then our stored latest one,
            // so something happened, read again with timestamp only
            if (!fallbackTry && (
                (Array.isArray(json.root.call) && json.root.call[0] && json.root.call[0].id && json.root.call[0].id < systemData.native.callLists.lastId) ||
                (!Array.isArray(json.root.call) && json.root.call && typeof json.root.call === 'object' && json.root.call.id && json.root.call.id < systemData.native.callLists.lastId)
            )) {
                systemData.native.callLists.lastId = 0;
                for (const n in TYPES) {
                    const list = systemData.native.callLists[n];
                    if (!list || !list.use) {
                        continue;
                    }
                    list.lastId = 0;
                }

                adapter.log.info('Reset of call ids in Fritzbox detected, re-add all calls since ' + systemData.native.callLists.lastTimestamp);
                return refresh(err, data, cb, done, true);
            }

            systemData.native.callLists.add(json.root.call, ~~json.root.timestamp);
        }
        systemData.native.callLists.forEach(cb);
        // save system data in namespace
        adapter.setObject(adapter.namespace, systemData);
        done && done();
    });
}

exports.callLists = callLists;
exports.refresh = refresh;
