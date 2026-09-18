/**
 * Call lists of the Fritz!Box.
 *
 * The box only delivers a URL for the call list; the XML behind it is read with `node:http` and
 * converted to JSON. The lists themselves are kept in the `meta` object of the adapter, so that
 * the counters survive a restart.
 */
import type { ActionResult, TR064Error } from 'tr-O64';

import { getXml, redactUrl } from './utils';
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

/** `dd.mm.yy hh:mm` of the call list as sortable `yymmddhhmm`, empty if the date has another form */
function dateKey(date?: string): string {
    const m = /^(\d\d)\.(\d\d)\.(\d\d) (\d\d):(\d\d)/.exec(date ?? '');
    return m ? `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}` : '';
}

/** A call which is still running: the box writes its final entry when it ends */
function isActive(call: CallEntry): boolean {
    return ~~call.type === 9 || ~~call.type === 11;
}

/** Identifies a call without its ID */
function callSignature(call: CallEntry): string {
    return `${call.date}|${~~call.type}|${call.caller ?? ''}|${call.called ?? ''}`;
}

/** `root.call` of the call list XML as an array, in the order of the box: the newest call first */
function getCalls(json: CallListXml): CallEntry[] {
    const call = json.root?.call;
    if (!call) {
        return [];
    }
    return Array.isArray(call) ? call : [call];
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

    /**
     * Adds a call to one list, the oldest entries are removed
     *
     * @param call the call
     * @param listName the list
     * @param counted false: the call is not new, the counter of the list stays as it is
     */
    public addCall2List(call: CallEntry, listName: CallListName | number, counted = true): void {
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
                if (counted) {
                    list.count += 1;
                }
            }
        }
    }

    public addCall(call: CallEntry, counted = true): void {
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
        this.addCall2List(call, NO2NAME[~~call.type] || call.type, counted);
        this.addCall2List(call, 'all', counted);
    }

    /**
     * Adds the calls of the box to the lists.
     *
     * @param calls the calls in the order of the box: the newest call first
     * @param timestamp `timestamp` of the call list
     * @param isNew decides whether a call increases the counters, by default every call which is not known yet
     */
    public add(calls: CallEntry[], timestamp: number, isNew?: (call: CallEntry) => boolean): void {
        if (timestamp) {
            // Not a point in time but the ID of the call list of the box: a list which the box has
            // created again (e.g. another box) may have a smaller one, therefore it is not compared.
            this.lastTimestamp = timestamp;
        }

        let blocker = false;

        // the oldest call first
        for (const call of [...calls].reverse()) {
            this.addCall(call, isNew ? isNew(call) : true);
            // do not move lastId past a call which is still active, its final entry has to be read again
            if (isActive(call)) {
                blocker = true;
            }

            if (!blocker && call.id > this.lastId) {
                this.lastId = call.id;
            }
        }
    }

    /**
     * Builds the lists again from the complete call list of the box.
     *
     * The IDs of the calls cannot be compared any more (the box has numbered its calls from the
     * beginning again), therefore a call is counted as new if it is not older than the newest known
     * call and not one of the known calls.
     *
     * @param calls the complete call list of the box, the newest call first
     * @param timestamp `timestamp` of the call list
     */
    public rebuild(calls: CallEntry[], timestamp: number): void {
        const known = new Set<string>();
        let newest = '';
        for (const n of TYPES) {
            for (const call of this[n].array) {
                known.add(callSignature(call));
                const key = dateKey(call.date);
                if (key > newest) {
                    newest = key;
                }
            }
        }

        this.lastId = 0;
        for (const n of TYPES) {
            this[n].array = [];
            this[n].lastId = 0;
        }

        this.add(calls, timestamp, call => {
            const key = dateKey(call.date);
            return !!key && key >= newest && !known.has(callSignature(call));
        });
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

/**
 * Reads the call list of the box and adds the new calls to the lists.
 *
 * Only the calls after the last known one are requested (`timestamp` together with `id`). A box
 * which numbers its calls from the beginning again - another box, a factory reset, a list which
 * the box has created again - answers that request with an empty list for good, because it has no
 * call after that ID. Therefore an empty answer is checked against the newest call of the box, and
 * the lists are built again from the complete call list if the IDs do not fit (issue #582).
 *
 * @param adapter the adapter instance
 * @param systemData the meta object with the stored lists
 * @param err error of `GetCallList`
 * @param data result of `GetCallList` with the URL of the list
 * @param cb called for every regenerated list
 * @param done called when all lists are processed
 */
export function refresh(
    adapter: Tr064Adapter,
    systemData: SystemData,
    err: TR064Error | string | null,
    data: ActionResult | null,
    cb: (list: CallList, name: CallListName, html: string, self: CallLists) => void,
    done?: () => void,
): void {
    const callLists = systemData.native.callLists;
    const url = data?.NewCallListURL;

    if (err || !callLists || !url || url.startsWith('https:')) {
        done?.();
        return;
    }

    const stored = JSON.stringify(callLists);
    const finish = (): void => {
        callLists.forEach(cb);
        // the list is read every minute, the object is only written if something changed
        if (JSON.stringify(callLists) !== stored) {
            systemData.save();
        }
        done?.();
    };

    const read = (params: string, onRead: (calls: CallEntry[], timestamp: number) => void): void => {
        adapter.log.debug(`Request Calllist JSON: url = ${redactUrl(url + params)}`);
        getXml<CallListXml>(url + params, (httpErr, json) => {
            if (httpErr || !json?.root) {
                adapter.log.warn(
                    `Cannot read the call list: ${httpErr ? httpErr.message : 'no call list in the answer'}`,
                );
                done?.();
                return;
            }
            // the calls contain phone numbers and names
            adapter.log.debug('Calllist received');
            adapter.log.silly(`Result Calllist JSON: ${JSON.stringify(json)}`);
            onRead(getCalls(json), ~~Number(json.root.timestamp));
        });
    };

    const rebuild = (reason: string): void => {
        adapter.log.info(`${reason}, the call lists are read again completely`);
        read('', (calls, timestamp) => {
            callLists.rebuild(calls, timestamp);
            finish();
        });
    };

    const lastId = callLists.lastId;
    // AVM: the parameters work only together, one of them alone is ignored
    if (!lastId || !callLists.lastTimestamp) {
        read('', (calls, timestamp) => {
            callLists.add(calls, timestamp);
            finish();
        });
        return;
    }

    read(`&timestamp=${callLists.lastTimestamp}&id=${lastId}`, (calls, timestamp) => {
        if (calls.some(call => ~~call.id < lastId)) {
            // the box has not filtered the list, it does not know the ID
            rebuild(`The FRITZ!Box sent calls before the last known call ID ${lastId}`);
            return;
        }
        if (calls.length) {
            callLists.add(calls, timestamp);
            finish();
            return;
        }

        // "no new calls" - or no call after `lastId` any more: the newest call of the box tells
        read('&max=1', ([newest]) => {
            const newestId = ~~(newest?.id ?? 0);
            if (newestId && newestId < lastId) {
                rebuild(
                    `The FRITZ!Box numbers its calls from the beginning again (last known call ID ${lastId}, newest ${newestId})`,
                );
            } else if (newestId > lastId && !isActive(newest)) {
                // the box has newer calls, but not for this request (a call which has just started is not
                // a reason, it is read with the next refresh)
                rebuild(`The FRITZ!Box did not send the calls after the last known call ID ${lastId}`);
            } else {
                // an empty call list of the box (e.g. deleted by the user) keeps the lists as they are
                callLists.add([], timestamp);
                finish();
            }
        });
    });
}
