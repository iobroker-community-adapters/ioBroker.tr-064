/**
 * Persons of the presence detection (`tr-064.<n>.presence.persons.<name>`) for the widgets.
 *
 * A widget stores the **name** of a person, not an object ID: `loadPersons()` lists the persons of
 * an instance, `findPerson()` finds one by its name. The comings and goings come from a history
 * instance (history, sql, influxdb) if one logs `<person>.present`, otherwise from the state
 * `<person>.history` which the adapter keeps itself (`loadPresenceHistory()`).
 *
 * No React in here - the file is used by vis-2, admin and ioBroker.devices.
 */

/** The states of a person, below its channel */
export const PERSON_STATES = {
    present: 'present',
    lastArrival: 'lastArrival',
    lastDeparture: 'lastDeparture',
    presentSince: 'presentSince',
    absentSince: 'absentSince',
    presentToday: 'presentToday',
    absentToday: 'absentToday',
    devices: 'devices',
    history: 'history',
} as const;

export type PersonStateName = keyof typeof PERSON_STATES;

/** One person of an instance */
export interface PersonRef {
    /** name as configured in the tab "Persons" */
    name: string;
    /** full ID of the channel, e.g. `tr-064.0.presence.persons.Anna` */
    id: string;
    group: string;
}

/** One coming (`present: true`) or going */
export interface PresenceEvent {
    /** ms */
    ts: number;
    present: boolean;
}

/** Where the events of `loadPresenceHistory()` come from */
export type PresenceHistorySource = 'history' | 'adapter' | 'none';

export interface PresenceHistory {
    /** newest first */
    events: PresenceEvent[];
    source: PresenceHistorySource;
    /** the history instance, e.g. `history.0`, if `source` is `history` */
    instance?: string;
}

/** The part of the socket of admin, vis-2 and ioBroker.devices which is used here */
export interface PresenceSocket {
    getObjectViewSystem(type: 'channel', start?: string, end?: string): Promise<Record<string, any>>;
    getObject(id: string): Promise<ioBroker.Object | null | undefined>;
    getState(id: string): Promise<ioBroker.State | null | undefined>;
    getHistory?(id: string, options: ioBroker.GetHistoryOptions): Promise<ioBroker.GetHistoryResult>;
}

/** Adapters whose custom settings make a state readable with `getHistory()` */
const HISTORY_ADAPTERS = /^(history|sql|influxdb)\.\d+$/;

function text(name: unknown): string {
    if (typeof name === 'string') {
        return name;
    }
    if (name && typeof name === 'object') {
        const names = name as Record<string, string>;
        return names.en || Object.values(names)[0] || '';
    }
    return '';
}

/**
 * The persons of an instance, sorted by name. Empty if the instance has none (or does not exist).
 *
 * @param socket connection of the host
 * @param instanceId e.g. `tr-064.0`
 */
export async function loadPersons(socket: PresenceSocket, instanceId: string): Promise<PersonRef[]> {
    const prefix = `${instanceId}.presence.persons.`;
    try {
        const channels = (await socket.getObjectViewSystem('channel', prefix, `${prefix}香`)) || {};
        return Object.keys(channels)
            .filter(id => id.length > prefix.length && !id.substring(prefix.length).includes('.'))
            .map(id => {
                const obj = channels[id] as ioBroker.ChannelObject | undefined;
                const native = (obj?.native || {}) as { person?: string; group?: string };
                return {
                    id,
                    name: native.person || text(obj?.common?.name) || id.substring(prefix.length),
                    group: native.group || '',
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.warn(`Cannot read the persons of ${instanceId}: ${String(e)}`);
        return [];
    }
}

/**
 * The person with this name: exactly, then without regard to case
 *
 * @param persons result of `loadPersons()`
 * @param name name of the person as stored by the widget
 */
export function findPerson(persons: PersonRef[], name: string | undefined | null): PersonRef | undefined {
    const wanted = (name || '').trim();
    if (!wanted) {
        return undefined;
    }
    const lower = wanted.toLowerCase();
    return persons.find(p => p.name === wanted) || persons.find(p => p.name.toLowerCase() === lower);
}

/** The groups of the persons, sorted */
export function personGroups(persons: PersonRef[]): string[] {
    return [...new Set(persons.map(p => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * The events of the state `<person>.history` (JSON, newest first)
 *
 * @param val value of the state
 */
export function parseHistoryJson(val: unknown): PresenceEvent[] {
    if (typeof val !== 'string' || !val) {
        return [];
    }
    try {
        const list = JSON.parse(val) as PresenceEvent[];
        return Array.isArray(list)
            ? list
                  .filter(e => e && typeof e.ts === 'number')
                  .map(e => ({ ts: e.ts, present: !!e.present }))
                  .sort((a, b) => b.ts - a.ts)
            : [];
    } catch {
        return [];
    }
}

/**
 * The history instance which logs a state, if one does
 *
 * @param obj the object of the state
 */
export function historyInstanceOf(obj: ioBroker.Object | null | undefined): string | undefined {
    const custom = (obj?.common as { custom?: Record<string, { enabled?: boolean } | null> } | undefined)?.custom;
    if (!custom) {
        return undefined;
    }
    return Object.keys(custom).find(key => HISTORY_ADAPTERS.test(key) && custom[key]?.enabled);
}

/**
 * The last comings and goings of a person, newest first. Never throws.
 *
 * With a history instance which logs `<person>.present` the events of the last `days` days come
 * from there, otherwise (or if it delivers nothing) from the state `<person>.history`.
 *
 * @param socket connection of the host
 * @param personId full ID of the channel of the person
 * @param options `count` events at most (default 20), from the last `days` days (default 7)
 * @param options.count events at most
 * @param options.days how far back a history instance is asked
 */
export async function loadPresenceHistory(
    socket: PresenceSocket,
    personId: string,
    options: { count?: number; days?: number } = {},
): Promise<PresenceHistory> {
    const count = Math.max(1, options.count || 20);
    const days = Math.max(1, options.days || 7);
    const presentId = `${personId}.${PERSON_STATES.present}`;

    try {
        const instance = socket.getHistory ? historyInstanceOf(await socket.getObject(presentId)) : undefined;
        if (instance && socket.getHistory) {
            const end = Date.now();
            const result = await socket.getHistory(presentId, {
                instance,
                start: end - days * 24 * 3600_000,
                end,
                aggregate: 'none',
                ack: true,
                from: false,
                q: false,
                addId: false,
                returnNewestEntries: true,
                count: count * 4,
            });
            const values = (Array.isArray(result) ? result : []) as { ts: number; val: unknown }[];
            const events: PresenceEvent[] = [];
            // ascending, so that a repeated value (logging without "only changes") is dropped
            values
                .filter(v => v && typeof v.ts === 'number' && v.val !== null && v.val !== undefined)
                .sort((a, b) => a.ts - b.ts)
                .forEach(v => {
                    const present = v.val === true || v.val === 'true' || v.val === 1 || v.val === '1';
                    if (!events.length || events[events.length - 1].present !== present) {
                        events.push({ ts: v.ts, present });
                    }
                });
            if (events.length) {
                return { events: events.reverse().slice(0, count), source: 'history', instance };
            }
        }
    } catch (e) {
        console.warn(`Cannot read the history of ${presentId}: ${String(e)}`);
    }

    try {
        const state = await socket.getState(`${personId}.${PERSON_STATES.history}`);
        const events = parseHistoryJson(state?.val).slice(0, count);
        return { events, source: events.length ? 'adapter' : 'none' };
    } catch {
        return { events: [], source: 'none' };
    }
}

function intlLang(lang: string): string {
    return lang === 'zh-cn' ? 'zh-CN' : lang || 'en';
}

/**
 * A duration in the words of the language: `3 days 4 h`, `2 h 15 min`, `5 min` - the two largest units
 *
 * @param ms duration
 * @param lang language of the host, e.g. `de`
 */
export function formatDuration(ms: number, lang: string): string {
    const minutes = Math.max(0, Math.floor(ms / 60_000));
    const parts: [number, 'day' | 'hour' | 'minute'][] = [
        [Math.floor(minutes / 1440), 'day'],
        [Math.floor((minutes % 1440) / 60), 'hour'],
        [minutes % 60, 'minute'],
    ];
    const first = parts.findIndex(([value]) => value > 0);
    const used = first === -1 ? [parts[2]] : parts.slice(first, first + 2).filter(([value]) => value > 0);
    return used
        .map(([value, unit]) => {
            try {
                return new Intl.NumberFormat(intlLang(lang), {
                    style: 'unit',
                    unit,
                    unitDisplay: unit === 'day' ? 'long' : 'short',
                }).format(value);
            } catch {
                return `${value} ${unit === 'day' ? 'd' : unit === 'hour' ? 'h' : 'min'}`;
            }
        })
        .join(' ');
}

/**
 * A point in time: only the time for today, `yesterday 18:04` style for yesterday (in the language), date and time otherwise
 *
 * @param ts ms
 * @param lang language of the host
 */
export function formatEventTime(ts: number, lang: string): string {
    if (!ts) {
        return '—';
    }
    const date = new Date(ts);
    const now = new Date();
    const locale = intlLang(lang);
    const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= startOfToday) {
        return time;
    }
    if (ts >= startOfToday - 24 * 3600_000) {
        try {
            const yesterday = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day');
            return `${yesterday} ${time}`;
        } catch {
            // falls through to the date
        }
    }
    const sameYear = date.getFullYear() === now.getFullYear();
    return `${date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        ...(sameYear ? {} : { year: 'numeric' }),
    })} ${time}`;
}
