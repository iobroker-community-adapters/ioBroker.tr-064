/**
 * Presence of persons, groups, guests and unknown devices - the functions of the adapter
 * fb-checkpresence.
 *
 * A person (tab "Persons") has one or more MAC addresses and is present while one of its devices
 * is active. Everything is written below `presence`:
 *
 * - `presence.persons.<name>`: `present`, `lastArrival`/`lastDeparture` (ms), `presentSince`/
 *   `absentSince` (minutes), `presentToday`/`absentToday` (minutes since midnight), `devices`
 *   (the active devices) and `history` (the last comings and goings as JSON, newest first)
 * - `presence.groups.<group>` and `presence` itself: `present` (anybody), `allPresent`,
 *   `presentCount`/`absentCount`, `presentNames`/`absentNames` and `json`
 * - `presence.guests` (devices of the guest network) and `presence.unknown` (active devices which
 *   are neither in the tab "Devices" nor in "Persons"): `present`, `count`, `names`, `json`
 *
 * All of it comes from one XML host list per poll cycle. A firmware without that list only gets
 * the persons, asked for MAC by MAC with `GetSpecificHostEntry`.
 */
import type { Tr064Adapter } from '../main';
import type { TR064Client } from './tr064';
import type { HostEntry, PresenceEvent, PresenceHostInfo, PresencePersonInfo, PresenceResponse } from './types';
import { normalizedName, normalizeMac, splitAddresses, splitMacs } from './utils';

export const CHANNEL_PRESENCE = 'presence';

/** Default and upper limit of `presenceHistory` */
const DEFAULT_HISTORY = 50;
const MAX_HISTORY = 1000;

const MINUTE = 60_000;

/**
 * Longest time between two poll cycles which is added to `presentToday`/`absentToday`. A longer gap
 * (the box did not answer, the adapter was stopped) is not counted - nobody knows what happened.
 */
const MAX_GAP = 10 * MINUTE;

/** The states of a person */
const PERSON_STATES: Record<string, Partial<ioBroker.StateCommon>> = {
    present: { name: 'Present', type: 'boolean', role: 'indicator', def: false },
    lastArrival: { name: 'Last arrival', type: 'number', role: 'date', def: 0 },
    lastDeparture: { name: 'Last departure', type: 'number', role: 'date', def: 0 },
    presentSince: { name: 'Present since', type: 'number', role: 'value', unit: 'min', def: 0 },
    absentSince: { name: 'Absent since', type: 'number', role: 'value', unit: 'min', def: 0 },
    presentToday: { name: 'Present today', type: 'number', role: 'value', unit: 'min', def: 0 },
    absentToday: { name: 'Absent today', type: 'number', role: 'value', unit: 'min', def: 0 },
    devices: { name: 'Active devices', type: 'string', role: 'text', def: '' },
    history: { name: 'Last comings and goings', type: 'string', role: 'json', def: '[]' },
};

/** The summary of a list of persons: of all persons in `presence`, of a group in `presence.groups.<group>` */
const SUMMARY_STATES: Record<string, Partial<ioBroker.StateCommon>> = {
    present: { name: 'Anybody present', type: 'boolean', role: 'indicator', def: false },
    allPresent: { name: 'All present', type: 'boolean', role: 'indicator', def: false },
    presentCount: { name: 'Number of present persons', type: 'number', role: 'value', def: 0 },
    absentCount: { name: 'Number of absent persons', type: 'number', role: 'value', def: 0 },
    presentNames: { name: 'Present persons', type: 'string', role: 'text', def: '' },
    absentNames: { name: 'Absent persons', type: 'string', role: 'text', def: '' },
    json: { name: 'Persons as JSON', type: 'string', role: 'json', def: '[]' },
};

/** `presence.guests` and `presence.unknown` */
const HOSTS_STATES: Record<string, Partial<ioBroker.StateCommon>> = {
    present: { name: 'Any device active', type: 'boolean', role: 'indicator', def: false },
    count: { name: 'Number of active devices', type: 'number', role: 'value', def: 0 },
    names: { name: 'Active devices', type: 'string', role: 'text', def: '' },
    json: { name: 'Active devices as JSON', type: 'string', role: 'json', def: '[]' },
};

interface Person {
    name: string;
    group: string;
    /** ID of the channel relative to the namespace, e.g. `presence.persons.Anna` */
    channel: string;
    /** MAC addresses as `AA:BB:CC:DD:EE:FF` */
    macs: string[];
    /** IP addresses in lower case - only usable with the XML host list */
    ips: string[];
    /** `null` until the presence was determined once */
    present: boolean | null;
    lastArrival: number;
    lastDeparture: number;
    /** Since when all devices are inactive while the person still counts as present (`presenceDelay`) */
    pendingSince: number;
    history: PresenceEvent[];
    /** ms present and absent on `day` */
    presentMs: number;
    absentMs: number;
    /** `toDateString()` of the day which `presentMs`/`absentMs` belong to */
    day: string;
    /** host names of the active devices */
    devices: string[];
}

function dayOf(ts: number): string {
    return new Date(ts).toDateString();
}

function isActive(host: HostEntry | undefined): boolean {
    return !!host && !!~~Number(host.NewActive);
}

function hostInfo(host: HostEntry): PresenceHostInfo {
    return {
        name: host.NewHostName || host.NewMACAddress,
        ip: host.NewIPAddress,
        mac: host.NewMACAddress,
        interface: host.NewInterfaceType || '',
    };
}

/**
 * An object ID out of a name, unique within `used`: forbidden characters become `_`, umlauts are
 * written out, a name which occurs twice gets a number
 */
function uniqueId(name: string, forbidden: RegExp, used: Set<string>): string {
    const base = normalizedName(name.trim().replace(forbidden, '_'));
    let id = base;
    for (let n = 2; used.has(id.toLowerCase()); n++) {
        id = `${base}_${n}`;
    }
    used.add(id.toLowerCase());
    return id;
}

export class Presence {
    private readonly persons: Person[] = [];
    /** group name -> ID of its channel */
    private readonly groups = new Map<string, string>();
    /** last written value of every state, by ID relative to the namespace */
    private readonly values = new Map<string, ioBroker.StateValue>();
    private lastTick = 0;
    private noHostListLogged = false;
    /** `init()` is through: the objects exist and the stored values are taken over */
    private initialized = false;
    private readonly delayMs: number;
    private readonly historyLength: number;

    public constructor(
        private readonly adapter: Tr064Adapter,
        private readonly client: TR064Client,
    ) {
        const config = adapter.config;
        this.delayMs = Math.max(0, Number(config.presenceDelay) || 0) * MINUTE;
        this.historyLength = Math.min(MAX_HISTORY, Math.max(1, ~~Number(config.presenceHistory) || DEFAULT_HISTORY));

        const usedPersons = new Set<string>();
        const usedGroups = new Set<string>();
        for (const entry of config.persons || []) {
            const name = String(entry?.name || '').trim();
            if (!name || entry.enabled === false) {
                continue;
            }
            const { macs, ips, invalid } = splitAddresses(String(entry.addresses || ''));
            if (invalid.length) {
                adapter.log.warn(
                    `Person "${name}": "${invalid.join('", "')}" is neither a MAC nor an IP address and is ignored`,
                );
            }
            if (!macs.length && !ips.length) {
                adapter.log.warn(`Person "${name}" has no MAC or IP address in the tab "Persons" and is ignored`);
                continue;
            }
            const group = String(entry.group || '').trim();
            if (group && !this.groups.has(group)) {
                this.groups.set(
                    group,
                    `${CHANNEL_PRESENCE}.groups.${uniqueId(group, adapter.FORBIDDEN_CHARS, usedGroups)}`,
                );
            }
            this.persons.push({
                name,
                group,
                channel: `${CHANNEL_PRESENCE}.persons.${uniqueId(name, adapter.FORBIDDEN_CHARS, usedPersons)}`,
                macs,
                ips,
                present: null,
                lastArrival: 0,
                lastDeparture: 0,
                pendingSince: 0,
                history: [],
                presentMs: 0,
                absentMs: 0,
                day: dayOf(Date.now()),
                devices: [],
            });
        }
    }

    /** Something to do: persons, guests or unknown devices are configured */
    public get enabled(): boolean {
        return !!this.persons.length || this.adapter.config.presenceGuests || this.adapter.config.presenceUnknown;
    }

    /**
     * Creates the objects, deletes the ones of persons and groups which are not configured any
     * more and takes over the stored values, so that times and history survive a restart
     */
    public async init(): Promise<void> {
        const wanted = new Map<string, ioBroker.SettableObject>();
        const folder = (id: string, name: string): void => {
            wanted.set(id, { type: 'folder', common: { name }, native: {} });
        };
        const channel = (id: string, name: string, native: Record<string, unknown> = {}): void => {
            wanted.set(id, { type: 'channel', common: { name }, native });
        };
        const states = (prefix: string, defs: Record<string, Partial<ioBroker.StateCommon>>): void => {
            for (const [name, common] of Object.entries(defs)) {
                wanted.set(`${prefix}.${name}`, {
                    type: 'state',
                    common: { read: true, write: false, ...common } as ioBroker.StateCommon,
                    native: {},
                });
            }
        };

        if (this.enabled) {
            folder(CHANNEL_PRESENCE, 'Presence');
        }
        if (this.persons.length) {
            states(CHANNEL_PRESENCE, SUMMARY_STATES);
            folder(`${CHANNEL_PRESENCE}.persons`, 'Persons');
            for (const person of this.persons) {
                // `native.person` is how the widgets find a person by its name
                channel(person.channel, person.name, { person: person.name, group: person.group });
                states(person.channel, PERSON_STATES);
            }
        }
        if (this.groups.size) {
            folder(`${CHANNEL_PRESENCE}.groups`, 'Groups');
            for (const [group, id] of this.groups) {
                channel(id, group, { group });
                states(id, SUMMARY_STATES);
            }
        }
        if (this.adapter.config.presenceGuests) {
            channel(`${CHANNEL_PRESENCE}.guests`, 'Guests');
            states(`${CHANNEL_PRESENCE}.guests`, HOSTS_STATES);
        }
        if (this.adapter.config.presenceUnknown) {
            channel(`${CHANNEL_PRESENCE}.unknown`, 'Unknown devices');
            states(`${CHANNEL_PRESENCE}.unknown`, HOSTS_STATES);
        }

        const prefix = `${this.adapter.namespace}.`;
        const existing = await this.adapter.getForeignObjectsAsync(`${prefix}${CHANNEL_PRESENCE}*`);
        const obsolete = Object.keys(existing || {})
            .map(id => id.substring(prefix.length))
            .filter(id => (id === CHANNEL_PRESENCE || id.startsWith(`${CHANNEL_PRESENCE}.`)) && !wanted.has(id))
            // children first
            .sort((a, b) => b.length - a.length);
        for (const id of obsolete) {
            await this.adapter.delObjectAsync(id);
        }

        // extendObject keeps `common.custom`, i.e. the settings of history/sql/influxdb
        for (const [id, obj] of wanted) {
            await this.adapter.extendObjectAsync(id, obj);
        }

        if (!this.persons.length) {
            this.initialized = true;
            return;
        }
        const stored = (await this.adapter.getStatesAsync(`${CHANNEL_PRESENCE}.persons.*`)) || {};
        const today = dayOf(Date.now());
        for (const person of this.persons) {
            const state = (name: string): ioBroker.State | undefined => stored[`${prefix}${person.channel}.${name}`];
            const present = state('present');
            if (present && typeof present.val === 'boolean') {
                person.present = present.val;
            }
            person.lastArrival = Number(state('lastArrival')?.val) || 0;
            person.lastDeparture = Number(state('lastDeparture')?.val) || 0;
            try {
                const history = JSON.parse(String(state('history')?.val || '[]')) as PresenceEvent[];
                if (Array.isArray(history)) {
                    person.history = history
                        .filter(event => event && typeof event.ts === 'number')
                        .slice(0, this.historyLength);
                }
            } catch {
                // a broken list starts empty
            }
            // the sums of today go on, the ones of another day start at 0
            const presentToday = state('presentToday');
            if (presentToday && dayOf(presentToday.ts) === today) {
                person.presentMs = (Number(presentToday.val) || 0) * MINUTE;
            }
            const absentToday = state('absentToday');
            if (absentToday && dayOf(absentToday.ts) === today) {
                person.absentMs = (Number(absentToday.val) || 0) * MINUTE;
            }
        }
        this.initialized = true;
    }

    /** Reads the devices from the box and writes all presence states. `callback` is called exactly once */
    public update(callback: () => void): void {
        if (!this.enabled || !this.initialized) {
            callback();
            return;
        }
        const done = (promise: Promise<void>): void => {
            promise.catch(e => this.adapter.log.warn(`Presence: ${e instanceof Error ? e.message : String(e)}`));
            void promise.finally(callback);
        };

        this.client.getHostListXml((err, hosts) => {
            if (!err) {
                done(this.evaluate(hosts, true));
                return;
            }
            if (!this.noHostListLogged) {
                this.noHostListLogged = true;
                this.adapter.log.debug(
                    `Presence: no host list (${err.message}), the devices of the persons are asked one by one`,
                );
                if (this.persons.some(person => person.ips.length)) {
                    this.adapter.log.info(
                        'The FritzBox does not deliver its host list - persons are detected only by their MAC addresses, not by IP addresses',
                    );
                }
                if (this.adapter.config.presenceGuests || this.adapter.config.presenceUnknown) {
                    this.adapter.log.info(
                        'The FritzBox does not deliver its host list - guests and unknown devices cannot be detected',
                    );
                }
            }
            if (!this.persons.length) {
                callback();
                return;
            }
            const macs = [...new Set(this.persons.flatMap(person => person.macs))];
            this.client.getHostEntries(macs, answers => {
                if (answers.some(answer => answer.error === 'timeout')) {
                    // no answer is no information: the persons stay as they are
                    callback();
                    return;
                }
                const found = answers.map((answer, i) =>
                    answer.entry ? { ...answer.entry, NewMACAddress: macs[i] } : undefined,
                );
                done(
                    this.evaluate(
                        found.filter((host): host is HostEntry => !!host),
                        false,
                    ),
                );
            });
        });
    }

    /** The persons and groups for the message `presence` */
    public info(): PresenceResponse {
        return {
            persons: this.persons.map(person => this.personInfo(person)),
            groups: [...this.groups.keys()],
        };
    }

    private personInfo(person: Person): PresencePersonInfo {
        return {
            name: person.name,
            id: `${this.adapter.namespace}.${person.channel}`,
            group: person.group,
            present: person.present,
            lastArrival: person.lastArrival,
            lastDeparture: person.lastDeparture,
        };
    }

    /**
     * @param hosts the devices of the box
     * @param complete `hosts` is the whole host list, not only the devices of the persons
     */
    private async evaluate(hosts: HostEntry[], complete: boolean): Promise<void> {
        const now = Date.now();
        const byMac = new Map<string, HostEntry>();
        const byIp = new Map<string, HostEntry>();
        for (const host of hosts) {
            const mac = normalizeMac(host.NewMACAddress || '');
            // a MAC address may be listed twice (e.g. LAN and WLAN) - the active entry wins
            if (mac && (!byMac.has(mac) || isActive(host))) {
                byMac.set(mac, host);
            }
            // an IP address stays in the list of an inactive device until the box gives it to another one
            const ip = (host.NewIPAddress || '').toLowerCase();
            if (ip && (!byIp.has(ip) || isActive(host))) {
                byIp.set(ip, host);
            }
        }
        const delta = this.lastTick ? Math.min(Math.max(0, now - this.lastTick), MAX_GAP) : 0;
        this.lastTick = now;

        for (const person of this.persons) {
            if (!complete && person.ips.length) {
                // without the host list the IP addresses cannot be asked - the person stays as it is
                continue;
            }
            this.count(person, delta, now);
            const active = [
                ...new Set([...person.macs.map(mac => byMac.get(mac)), ...person.ips.map(ip => byIp.get(ip))]),
            ].filter(host => isActive(host)) as HostEntry[];
            person.devices = active.map(host => host.NewHostName || host.NewMACAddress);

            if (person.present === null) {
                // the first determination is no event - nobody knows when the person came or left
                person.present = !!active.length;
            } else if (active.length) {
                person.pendingSince = 0;
                if (!person.present) {
                    this.change(person, true, now);
                }
            } else if (person.present) {
                // a smartphone switches off its WLAN for a while - `presenceDelay` bridges that
                person.pendingSince ||= now;
                if (now - person.pendingSince >= this.delayMs) {
                    this.change(person, false, person.pendingSince);
                    person.pendingSince = 0;
                }
            }
            await this.writePerson(person, now);
        }

        if (this.persons.length) {
            await this.writeSummary(CHANNEL_PRESENCE, this.persons);
            for (const [group, id] of this.groups) {
                await this.writeSummary(
                    id,
                    this.persons.filter(person => person.group === group),
                );
            }
        }

        if (complete) {
            const active = hosts.filter(host => isActive(host));
            if (this.adapter.config.presenceGuests) {
                await this.writeHosts(
                    `${CHANNEL_PRESENCE}.guests`,
                    active.filter(host => !!~~Number(host['NewX_AVM-DE_Guest'])),
                );
            }
            if (this.adapter.config.presenceUnknown) {
                const knownIps = new Set(this.persons.flatMap(person => person.ips));
                const known = new Set<string>([
                    ...this.persons.flatMap(person => person.macs),
                    ...(this.adapter.config.devices || []).flatMap(entry =>
                        splitMacs(entry.mac || '').map(normalizeMac),
                    ),
                ]);
                await this.writeHosts(
                    `${CHANNEL_PRESENCE}.unknown`,
                    active.filter(
                        host =>
                            !~~Number(host['NewX_AVM-DE_Guest']) &&
                            !known.has(normalizeMac(host.NewMACAddress || '')) &&
                            !knownIps.has((host.NewIPAddress || '').toLowerCase()),
                    ),
                );
            }
        }
    }

    /** Adds the time since the last poll cycle to the sums of today, which start at 0 at midnight */
    private count(person: Person, delta: number, now: number): void {
        const today = dayOf(now);
        if (person.day !== today) {
            person.day = today;
            person.presentMs = 0;
            person.absentMs = 0;
            // only the part after midnight belongs to today
            delta = Math.min(delta, now - new Date(now).setHours(0, 0, 0, 0));
        }
        if (person.present === true) {
            person.presentMs += delta;
        } else if (person.present === false) {
            person.absentMs += delta;
        }
    }

    private change(person: Person, present: boolean, ts: number): void {
        person.present = present;
        if (present) {
            person.lastArrival = ts;
        } else {
            person.lastDeparture = ts;
        }
        person.history.unshift({ ts, present });
        person.history.length = Math.min(person.history.length, this.historyLength);
        this.adapter.log.debug(`Presence: a person ${present ? 'came' : 'left'}`);
        this.adapter.log.silly(`Presence: ${person.name} ${present ? 'came' : 'left'}`);
    }

    private async writePerson(person: Person, now: number): Promise<void> {
        const minutes = (ms: number): number => Math.floor(ms / MINUTE);
        const since = person.present ? person.lastArrival : person.lastDeparture;
        const sinceMinutes = since ? minutes(Math.max(0, now - since)) : 0;

        await this.write(`${person.channel}.present`, !!person.present);
        await this.write(`${person.channel}.lastArrival`, person.lastArrival);
        await this.write(`${person.channel}.lastDeparture`, person.lastDeparture);
        await this.write(`${person.channel}.presentSince`, person.present ? sinceMinutes : 0);
        await this.write(`${person.channel}.absentSince`, person.present ? 0 : sinceMinutes);
        await this.write(`${person.channel}.presentToday`, minutes(person.presentMs));
        await this.write(`${person.channel}.absentToday`, minutes(person.absentMs));
        await this.write(`${person.channel}.devices`, person.devices.join(', '));
        await this.write(`${person.channel}.history`, JSON.stringify(person.history));
    }

    private async writeSummary(prefix: string, persons: Person[]): Promise<void> {
        const present = persons.filter(person => person.present);
        const absent = persons.filter(person => !person.present);

        await this.write(`${prefix}.present`, present.length > 0);
        await this.write(`${prefix}.allPresent`, !!persons.length && !absent.length);
        await this.write(`${prefix}.presentCount`, present.length);
        await this.write(`${prefix}.absentCount`, absent.length);
        await this.write(`${prefix}.presentNames`, present.map(person => person.name).join(', '));
        await this.write(`${prefix}.absentNames`, absent.map(person => person.name).join(', '));
        await this.write(`${prefix}.json`, JSON.stringify(persons.map(person => this.personInfo(person))));
    }

    private async writeHosts(prefix: string, hosts: HostEntry[]): Promise<void> {
        const list = hosts.map(hostInfo).sort((a, b) => a.name.localeCompare(b.name));
        await this.write(`${prefix}.present`, list.length > 0);
        await this.write(`${prefix}.count`, list.length);
        await this.write(`${prefix}.names`, list.map(host => host.name).join(', '));
        await this.write(`${prefix}.json`, JSON.stringify(list));
    }

    /** Writes a value which changed - or every value with `updateUnchanged` */
    private async write(id: string, val: ioBroker.StateValue): Promise<void> {
        if (this.values.get(id) === val && !this.adapter.config.updateUnchanged) {
            return;
        }
        this.values.set(id, val);
        await this.adapter.setStateAsync(id, val, true);
    }
}
