'use strict';

var soef = require('soef');

var systemData;
var adapter;

var LINESTART = "<!!--Entry-->";
var LINEEND   = "<!!--EntryEnd-->";
var NO2NAME   = {0: 'all', 1: 'inbound', 2: 'missed', 3: 'outbound'};
var TYPES     = { all: 0, inbound: 1, missed: 2, outbound: 3};
//var SYMS      = {1: '⯈' /*blau*/,  2: '⯁' /*rot*/, 3: '⯇' /*grün*/ };
var SYMS      = {1: '>' /*blau*/,  2: 'x' /*rot*/, 3: '<' /*grün*/ };

//var ESCAPED_SYMS = {};
// for (var symNumber in SYMS) {
//     ESCAPED_SYMS [symNumber] = '&#' + SYMS[symNumber].charCodeAt(0) + ';';
// }

var normalizeConfig =
exports.normalizeConfig = function normalizeConfig (cfg, self) {
    cfg.use = false;
    for (var n in TYPES) {
        var o = cfg[n];
        if (!o) continue;
        var use = !!(o.generateHtml || o.generateJson) && o.maxEntries > 0;
        if (self && self[n]) {
            self[n].use = use;
            self[n].cfg = o;
        }
        cfg.use = cfg.use || use;
    }
};

var CallList = function (type) {
    this.count = 0;
    this.lastId = 0;
    this.array = [];
    this.type = type;
};


exports.ROOT = 'calllists';
exports.S_HTML_TEMPLATE = exports.ROOT + '.htmlTemplate.htmlTemplate';

var callLists = function () {
    if (this.lastTimestamp === undefined) {
        this.lastId = 0;
        this.lastTimestamp = 0;
        for (var n in TYPES) {
            this[n] = new CallList(n);
        }
    }
    var self = this;
    var html = {
        _template: "" +
            "<!-- Variables: id, type, caller, called, callednumber, name, numbertype, device, port date, duration, count, path." +
            "to use with %() e.g. %(date) -->" +
            "<div The last call was from %(name) at %(date) from %(caller)></div>" +
            "<div %(type): %(count)>" +
            "<table>" +
            LINESTART + "<tr><td>%(date)</td><td>%(name)</td><td>%(caller)</td></tr>" + LINEEND +
            "</table>" +
            "</div>",
        template: "",
        line: "",
        result: "",
    
        reLine: /\%\((.*?)\)/g,
        re: new RegExp (LINESTART + '(.*?)' + LINEEND),
        set: function(s)  {
            //if (!s) return;
            var start;
            s = s || this._template;
            s = s.replace(/^<!--.*?-->/, '');
            this.template = s.replace(this.re, function(match, cmd, pos) {
                this.line = cmd;
                //this.lineStart = pos;
                start = pos;
                return "";
            }.bind(this));
            this._result = this.template.substr(0, start);
            this._result2 = this.template.substr(start);
        },
        replace: function(str, obj) {
            if (!obj) return str;
            return str.replace(/\%\((.*?)\)/g, function(match, p) {
                if (obj[p]) return obj[p];
                return "";
            });
        },
        addLine: function(call) {
            this.result += this.replace(this.line, call);
        },
        prep: function(list) {
            this.result = this.replace(this._result, list);
            this.result2 = this.replace(this._result2, list);
            this.result = this.replace(this.result, list.array[0]);
            this.result2 = this.replace(this.result2, list.array[0]);
        },
        build: function(list) {
            this.prep(list);
            for (var i=list.array.length-1; i>=0; i--) {
                this.addLine(list.array[i]);
            }
            this.result += this.result2;
        }
    };
    Object.defineProperty(this, 'htmlTemplate', {
        get: function () { return html._template },
        //set: function (template) { html.set(emplate); }
        set: html.set.bind(html)
    });

    normalizeConfig(adapter.config.calllists, self);
    
    // var externalMapping = {
    //     0: '',
    //     1: 'caller',
    //     2: 'caller',
    //     3: 'called'
    // };
    
    this.addListItem = function (listName, call) {
        var list = this[listName];
        if (!list || !list.use) return;
        call.sym = SYMS[call.type];
        //call.external = call [externalMapping[~~call.type]];
        call.external = call [(~~call.type) === 3 ? 'called' : 'caller'];
        //call.escapedSym = ESCAPED_SYMS[call.type];
        if (!list.array.find(function (v) { return v.id === call.id; })) list.array.unshift(call);
        if (list.array.length > list.cfg.maxEntries) list.array.length = list.cfg.maxEntries;
        if (list.lastId < call.id) {
            list.lastId = call.id;
            list.count += 1;
        }
    };
    
    this.add = function(call, timestamp) {
        if (!call) return;
        if (timestamp != undefined && timestamp > this.lastTimestamp) this.lastTimestamp = timestamp;
        if (Array.isArray(call)) {
            call.reverse();
            call.forEach(function(v) { this.add(v); }.bind(this));
            return;
        }
        call.id = ~~call.id;
        var n = NO2NAME[call.type] || call.type;
        this.addListItem(n, call);
        this.addListItem('all', call);
        if (call.id > this.lastId) this.lastId = call.id;
        
    };
    this.forEach = function (cb) {
        for (var n in TYPES) {
            var list = self[n];
            if (!list || !list.use) continue;
            if (list.cfg.generateHtml) html.build(list);
            cb(list, n, html.result, self);
        }
    };
};


exports.init = function (_adapter, _systemData) {
    if (module.parent.exports.adapter !== undefined) {
        adapter = module.parent.exports.adapter;
    } else adapter = _adapter;
    systemData = _systemData;
};


function refresh (err, data, cb, done) {
    if (err || !data) return;
    if (!systemData.native.callLists) return;
    var url = data.NewCallListURL;
    if (systemData.native.callLists.lastTimestamp) url += '&timestamp=' + systemData.native.callLists.lastTimestamp;
    if (systemData.native.callLists.lastId) url += '&id=' + systemData.native.callLists.lastId;
    //url += '&max=999';
    soef.getHttpData(url, {xml2json: true}, function (err, json) {
        systemData.native.callLists.add(json.root.call, ~~json.root.timestamp);
        systemData.native.callLists.forEach(cb);
        systemData.save();
        done && done();
    });
}

exports.callLists = callLists;
exports.refresh = refresh;
