/**
 * Call lists of the Fritz!Box.
 *
 * The box only delivers a URL for the call list; the XML behind it is read with `node:http` and
 * converted to JSON. The lists themselves are kept in the `meta` object of the adapter, so that
 * the counters survive a restart.
 */
import { get as httpGet } from 'node:http';
import { Parser } from 'xml2js';
import type { ActionResult, TR064Error } from 'tr-O64';

import type { CallEntry, CallListName, CallListsConfig, CallListTypeConfig, CallListXml } from './types';
import type { Tr064Adapter } from '../main';
import type { SystemData } from './systemdata';

const LINESTART = '<!!--Entry-->';
const LINEEND = '<!!--EntryEnd-->';
/** `type` of a call in the XML of the box to the name of the list */
const NO2NAME: Record<number, CallListName> = { 0: 'all', 1: 'inbound', 2: 'missed', 3: 'outbound' };
const TYPES: CallListName[] = ['all', 'inbound', 'missed', 'outbound'];
const SYMS: Record<number, string> = {
    1: '>' /* blue */,
    2: 'x' /* red */,
    3: '<' /* green */, // completed entries
    9: '>' /* blue */,
    10: 'x' /* red */,
    11: '<' /* green */, // currently running (10 = blocked)
};

/** Channel below which the call lists are created */
export const ROOT = 'calllists';
/** State with the HTML template of the call lists */
export const S_HTML_TEMPLATE = `${ROOT}.htmlTemplate.htmlTemplate`;

/** One call list with its entries */
export interface CallList {
    count: number;
    lastId: number;
    array: CallEntry[];
    type: CallListName;
    /** Set by `normalizeConfig()` */
    use?: boolean;
    /** Set by `normalizeConfig()`: the configuration of this list */
    cfg?: CallListTypeConfig;
}

function createCallList(type: CallListName): CallList {
    return { count: 0, lastId: 0, array: [], type };
}

/**
 * Brings the configuration of the call lists into the current form and determines which lists
 * are used at all.
 *
 * Adapter versions before 4.x wrote `generateJSON`/`generateHTML`, since then the admin writes
 * `generateJson`/`generateHtml`. Both spellings still occur in existing installations.
 */
export function normalizeConfig(cfg: CallListsConfig, self?: CallLists): void {
    cfg.use = false;

    for (const n of TYPES) {
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
        if (self?.[n]) {
            self[n].use = use;
            self[n].cfg = o;
        }
        cfg.use = cfg.use || use;
    }
}

/** Values which can be put into a template with `%(name)` */
type Replaceable = Record<string, string | number | boolean | null | undefined>;

/** Builds the HTML output of a call list from a template */
class HtmlTemplate {
    private static readonly DEFAULT_TEMPLATE =
        '<!-- Variables: id, type, caller, called, callednumber, name, numbertype, device, port date, duration, count, path.' +
        'to use with %() e.g. %(date) -->' +
        '<div>The last call was from %(name) at %(date) from %(caller)</div>' +
        '<div>%(type): %(count)' +
        '<table>' +
        `${LINESTART}<tr><td>%(date)</td><td>%(name)</td><td>%(caller)</td></tr>${LINEEND}` +
        '</table>' +
        '</div>';

    private readonly re = new RegExp(`${LINESTART}(.*?)${LINEEND}`);
    private readonly log: ioBroker.Logger;

    public origTemplate = '';
    public template = '';
    public line = '';
    public result = '';
    public result2 = '';

    private beforeLines = '';
    private afterLines = '';

    public constructor(log: ioBroker.Logger) {
        this.log = log;
    }

    public set(s?: ioBroker.StateValue): void {
        this.log.debug(`Set Template: ${JSON.stringify(s)}`);
        let start = 0;
        let template = (s || HtmlTemplate.DEFAULT_TEMPLATE) as string;
        if (typeof template !== 'string') {
            template = String(template);
        }
        this.origTemplate = template;
        template = template.replace(/^<!--.*?-->/, '');

        this.template = template.replace(this.re, (_match: string, cmd: string, pos: number): string => {
            this.line = cmd;
            start = pos;
            return '';
        });

        this.beforeLines = this.template.substring(0, start);
        this.afterLines = this.template.substring(start);
    }

    public replace(str: string, obj?: Replaceable): string {
        if (!obj) {
            return str;
        }

        return str.replace(/%\((.*?)\)/g, (_match: string, p: string): string => {
            const value = obj[p];
            return value ? String(value) : '';
        });
    }

    public addLine(call: CallEntry): void {
        this.result += this.replace(this.line, call as unknown as Replaceable);
    }

    private prep(list: CallList): void {
        if (!this.beforeLines || !this.afterLines) {
            this.log.info('Calllist HTML Template not initialized. Use default');
            this.set();
        }
        this.result = this.replace(this.beforeLines, list as unknown as Replaceable);
        this.result2 = this.replace(this.afterLines, list as unknown as Replaceable);
        this.result = this.replace(this.result, list.array[0] as unknown as Replaceable);
        this.result2 = this.replace(this.result2, list.array[0] as unknown as Replaceable);
    }

    public build(list: CallList): void {
        this.prep(list);
        for (let i = list.array.length - 1; i >= 0; i--) {
            this.addLine(list.array[i]);
        }
        this.result += this.result2;
    }
}

/**
 * All four call lists.
 *
 * An instance of this class is stored in `native.callLists` of the `meta` object of the adapter.
 * Therefore only the attributes which really have to survive a restart may be normal properties -
 * everything else is a `#` field, because those are not written by `JSON.stringify()`.
 */
export class CallLists {
    public lastId = 0;
    public lastTimestamp = 0;
    public all: CallList = createCallList('all');
    public inbound: CallList = createCallList('inbound');
    public missed: CallList = createCallList('missed');
    public outbound: CallList = createCallList('outbound');

    readonly #adapter: Tr064Adapter;
    readonly #html: HtmlTemplate;

    /**
     * @param adapter the adapter instance
     * @param saved the content of `native.callLists` of a previous run
     */
    public constructor(adapter: Tr064Adapter, saved?: Partial<CallLists>) {
        this.#adapter = adapter;
        this.#html = new HtmlTemplate(adapter.log);

        if (saved) {
            this.lastId = saved.lastId ?? 0;
            this.lastTimestamp = saved.lastTimestamp ?? 0;
            for (const n of TYPES) {
                const list = saved[n];
                if (list) {
                    this[n] = { ...createCallList(n), ...list, type: n };
                }
            }
        }

        normalizeConfig(adapter.config.calllists, this);
    }

    /**
     * Template of the HTML output.
     *
     * An accessor on purpose: it must not be written into the `meta` object, but it has to be
     * assignable like a normal attribute, because that is how it was used before.
     */
    public get htmlTemplate(): string {
        return this.#html.origTemplate;
    }

    public set htmlTemplate(value: ioBroker.StateValue) {
        this.#html.set(value);
    }

    /** Adds a call to one list, the oldest entries are removed */
    public addCall2List(call: CallEntry, listName: CallListName | number): void {
        if (!call) {
            return;
        }

        const list = this[listName as CallListName];
        if (!list || !list.use) {
            this.#adapter.log.debug(`list ${listName} not used, ignore`);
            return;
        }

        if (!list.array.find(v => v.id === call.id)) {
            list.array.unshift(call);
            while (list.array.length > (list.cfg?.maxEntries ?? 0)) {
                list.array.pop();
            }
            if (list.lastId < call.id) {
                list.lastId = call.id;
                list.count += 1;
            }
        }
    }

    public addCall(call: CallEntry): void {
        call.id = ~~call.id;

        if ((call.type as number) > 3) {
            this.#adapter.log.debug(
                `Ignoring call ID${call.id} because call still active or blocked (call.type = ${call.type})`,
            );
            return;
        }

        this.#adapter.log.debug(`Processing call ID${call.id} (call.type = ${call.type})`);
        call.sym = SYMS[~~call.type];
        call.external = ~~call.type === 3 ? call.called : call.caller;
        this.addCall2List(call, NO2NAME[~~call.type] || call.type);
        this.addCall2List(call, 'all');
    }

    public add(call: CallEntry | CallEntry[], timestamp?: number): void {
        if (!call) {
            return;
        }
        if (timestamp && timestamp > this.lastTimestamp) {
            this.lastTimestamp = timestamp;
        }

        let blocker = false;

        if (Array.isArray(call)) {
            this.#adapter.log.debug('Separating parallel calls for calllist handling');
            call.reverse();
            call.forEach(singleCall => {
                this.addCall(singleCall); // process all calls of the array
                // but don't update lastId if an earlier started call is still active
                if (~~singleCall.type === 9 || ~~singleCall.type === 11) {
                    blocker = true;
                }

                if (!blocker && singleCall.id > this.lastId) {
                    this.lastId = singleCall.id;
                }
            });
        } else {
            this.addCall(call);

            if (call.id > this.lastId) {
                this.lastId = call.id;
            }
        }
    }

    /** Calls `cb` for every used list, `html` contains the generated HTML */
    public forEach(cb: (list: CallList, name: CallListName, html: string, self: CallLists) => void): void {
        for (const n of TYPES) {
            const list = this[n];
            if (!list || !list.use) {
                continue;
            }
            if (list.cfg?.generateHtml) {
                this.#html.build(list);
            }
            cb(list, n, this.#html.result, this);
        }
    }
}

/** Reads a URL of the Fritz!Box and converts the XML into JSON */
function getHttpData(url: string, cb: (err: Error | number | null, json?: CallListXml) => void): void {
    const parser = new Parser({
        explicitArray: false,
        mergeAttrs: true,
        normalizeTags: true,
        ignoreAttrs: true,
    });

    const request = httpGet(url, response => {
        let data = '';
        response.on('data', d => (data += d));
        response.on('end', () => parser.parseString(data, (err: Error | null, json: CallListXml) => cb(err, json)));
    });
    request.on('error', e => console.error(e));
    request.end();
}

/**
 * Reads the call list of the box and adds the new calls to the lists.
 *
 * @param adapter the adapter instance
 * @param systemData the meta object with the stored lists
 * @param err error of `GetCallList`
 * @param data result of `GetCallList` with the URL of the list
 * @param cb called for every regenerated list
 * @param done called when all lists are processed
 * @param fallbackTry internal: second attempt after the box has reset its call IDs
 */
export function refresh(
    adapter: Tr064Adapter,
    systemData: SystemData,
    err: TR064Error | string | null,
    data: ActionResult | null,
    cb: (list: CallList, name: CallListName, html: string, self: CallLists) => void,
    done?: () => void,
    fallbackTry?: boolean,
): void {
    const callLists = systemData.native.callLists;

    if (err || !data || !callLists) {
        done?.();
        return;
    }

    let url = data.NewCallListURL;
    if (callLists.lastTimestamp && url) {
        url += `&timestamp=${callLists.lastTimestamp}`;
    }
    if (callLists.lastId && url) {
        url += `&id=${callLists.lastId}`;
    }
    if (!url || url.startsWith('https:')) {
        done?.();
        return;
    }

    adapter.log.debug(`Request Calllist JSON: url = ${url}`);
    getHttpData(url, (_err, json) => {
        adapter.log.debug(`Result Calllist JSON: ${JSON.stringify(json)}`);

        if (json?.root) {
            const firstCall = Array.isArray(json.root.call) ? json.root.call[0] : json.root.call;

            // it seems that the latest id is smaller than our stored latest one,
            // so something happened, read again with timestamp only
            if (!fallbackTry && firstCall?.id && firstCall.id < callLists.lastId) {
                callLists.lastId = 0;
                for (const n of TYPES) {
                    const list = callLists[n];
                    if (!list || !list.use) {
                        continue;
                    }
                    list.lastId = 0;
                }

                adapter.log.info(
                    `Reset of call ids in Fritzbox detected, re-add all calls since ${callLists.lastTimestamp}`,
                );
                refresh(adapter, systemData, err, data, cb, done, true);
                return;
            }

            callLists.add(json.root.call as CallEntry | CallEntry[], ~~Number(json.root.timestamp));
        }

        callLists.forEach(cb);
        // save system data in namespace
        systemData.save();
        done?.();
    });
}
