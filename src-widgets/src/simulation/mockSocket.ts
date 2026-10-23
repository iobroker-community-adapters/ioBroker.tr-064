// Only for the simulation (npm start) - never part of the widget build.
// Answers like the vis-2 socket (`Connection`) with the states of a `tr-064.0` instance.
import { bigMeshMock, meshMock } from './mockMesh';

type Handler = (id: string, state: ioBroker.State | null | undefined) => void;

export interface MockOptions {
    /** `full` (default), `offline`, `stopped`, `minimal` (an old box without rates and WLAN states) */
    box: string;
    ringing: boolean;
    /** random changes of the rates every 2 seconds */
    live: boolean;
    /** `sendTo('mesh')` answers with this error */
    meshError: string;
    /** clients of a big mesh, 0 = the normal mock */
    clients: number;
}

const NS = 'tr-064.0';

function fullStates(options: MockOptions): Record<string, ioBroker.StateValue> {
    return {
        [`system.adapter.${NS}.alive`]: options.box !== 'stopped',
        [`${NS}.info.connection`]: options.box !== 'offline' && options.box !== 'stopped',
        [`${NS}.states.boxModel`]: 'FRITZ!Box 7590 AX',
        [`${NS}.states.boxFirmware`]: '256.08.02',
        [`${NS}.states.wanAccessType`]: 'DSL',
        [`${NS}.states.wanLinkStatus`]: options.box === 'offline' ? 'Down' : 'Up',
        [`${NS}.states.wanProvider`]: 'Telekom',
        [`${NS}.states.externalIP`]: '91.12.34.56',
        [`${NS}.states.externalIPv6`]: '2003:e4:1f0a:7b00:3ea6:2fff:fe01:23ab',
        [`${NS}.states.wanReceiveRate`]: options.box === 'offline' ? 0 : 10_912_500,
        [`${NS}.states.wanSendRate`]: options.box === 'offline' ? 0 : 1_512_500,
        [`${NS}.states.wanDownstreamMax`]: 250_000_000,
        [`${NS}.states.wanUpstreamMax`]: 40_000_000,
        [`${NS}.states.wlan`]: true,
        [`${NS}.states.wlan24`]: true,
        [`${NS}.states.wlan50`]: true,
        [`${NS}.states.wlanGuest`]: false,
        [`${NS}.states.abNewMessages`]: 2,
        [`${NS}.calllists.missed.count`]: 3,
        [`${NS}.callmonitor.ringing`]: options.ringing,
        [`${NS}.callmonitor.connected`]: true,
    };
}

/** An old box: no rates, no WLAN states, no call lists */
function minimalStates(): Record<string, ioBroker.StateValue> {
    return {
        [`system.adapter.${NS}.alive`]: true,
        [`${NS}.info.connection`]: true,
        [`${NS}.states.boxModel`]: 'FRITZ!Box 7490',
    };
}

/** The configured devices (tab "Devices") for the presence widget */
const DEVICES: { channel: string; name: string; active: boolean; accessPoint: string; connection: string }[] = [
    {
        channel: 'Handy_Anna',
        name: 'Handy Anna (192.168.178.21)',
        active: true,
        accessPoint: 'FRITZ!Box 7590 AX',
        connection: '5 GHz',
    },
    { channel: 'Handy_Max', name: 'Handy Max (192.168.178.34)', active: false, accessPoint: '', connection: '' },
    {
        channel: 'Tablet_Kueche',
        name: 'Tablet Küche (192.168.178.40)',
        active: true,
        accessPoint: 'Repeater Garten',
        connection: '2.4 GHz',
    },
    {
        channel: 'Laptop_Arbeit',
        name: 'Laptop Arbeit (192.168.178.52)',
        active: true,
        accessPoint: 'Repeater Keller',
        connection: 'LAN',
    },
    { channel: 'iPad_Oma', name: 'iPad Oma (192.168.178.61)', active: false, accessPoint: '', connection: '' },
];

/** The persons of the presence detection (tab "Persons"); `history` = logged by history.0 */
const PERSONS: {
    channel: string;
    name: string;
    group: string;
    present: boolean;
    devices: string;
    /** minutes ago, newest first, alternating: the first is the current state */
    changes: number[];
    history?: boolean;
}[] = [
    {
        channel: 'Anna',
        name: 'Anna',
        group: 'Family',
        present: true,
        devices: 'Handy Anna, Tablet Küche',
        changes: [135, 610, 1520, 1980, 2950, 3400, 4410],
        history: true,
    },
    { channel: 'Max', name: 'Max', group: 'Family', present: false, devices: '', changes: [42, 520, 1460, 2010, 2900] },
    {
        channel: 'Oma',
        name: 'Oma',
        group: 'Guests',
        present: false,
        devices: '',
        changes: [3 * 1440 + 200, 3 * 1440 + 420],
    },
    { channel: 'Lena', name: 'Lena', group: 'Family', present: true, devices: 'Laptop Arbeit', changes: [8] },
];

export default class MockSocket {
    private readonly states: Record<string, ioBroker.State> = {};

    private readonly handlers = new Map<string, Set<Handler>>();

    private readonly objects: Record<string, ioBroker.Object> = {};

    private readonly options: MockOptions;

    /** values of the states which history.0 logs */
    private readonly history: Record<string, ioBroker.GetHistoryResult> = {};

    constructor(options: MockOptions) {
        this.options = options;
        const values = options.box === 'minimal' ? minimalStates() : fullStates(options);
        for (const device of DEVICES) {
            const id = `${NS}.devices.${device.channel}`;
            this.objects[id] = {
                _id: id,
                type: 'channel',
                common: { name: device.name },
                native: {},
            };
            values[`${id}.active`] = device.active;
            values[`${id}.accessPoint`] = device.accessPoint;
            values[`${id}.connection`] = device.connection;
        }
        if (options.box !== 'minimal') {
            this.addPersons(values);
        }
        for (const [id, val] of Object.entries(values)) {
            this.write(id, val, false);
        }
        if (options.live) {
            setInterval(() => {
                const down = this.states[`${NS}.states.wanReceiveRate`];
                const up = this.states[`${NS}.states.wanSendRate`];
                if (down && up) {
                    this.write(`${NS}.states.wanReceiveRate`, Math.round(Math.random() * 25_000_000));
                    this.write(`${NS}.states.wanSendRate`, Math.round(Math.random() * 4_000_000));
                }
            }, 2000);
        }
    }

    /** `presence.persons.*` and `presence.guests` like the adapter writes them */
    private addPersons(values: Record<string, ioBroker.StateValue>): void {
        const now = Date.now();
        const midnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
        const sinceMidnight = Math.floor((now - midnight) / 60_000);
        for (const person of PERSONS) {
            const id = `${NS}.presence.persons.${person.channel}`;
            this.objects[id] = {
                _id: id,
                type: 'channel',
                common: { name: person.name },
                native: { person: person.name, group: person.group },
            };
            const events = person.changes.map((minutes, i) => ({
                ts: now - minutes * 60_000,
                present: i % 2 === 0 ? person.present : !person.present,
            }));
            const last = (present: boolean): number => events.find(e => e.present === present)?.ts || 0;
            const since = Math.floor((now - events[0].ts) / 60_000);
            values[`${id}.present`] = person.present;
            values[`${id}.lastArrival`] = last(true);
            values[`${id}.lastDeparture`] = last(false);
            values[`${id}.presentSince`] = person.present ? since : 0;
            values[`${id}.absentSince`] = person.present ? 0 : since;
            values[`${id}.presentToday`] = person.present ? Math.min(since, sinceMidnight) : 0;
            values[`${id}.absentToday`] = sinceMidnight - (person.present ? Math.min(since, sinceMidnight) : 0);
            values[`${id}.devices`] = person.devices;
            values[`${id}.history`] = JSON.stringify(events);
            if (person.history) {
                // logged by history.0: `loadPresenceHistory()` asks the history instance
                this.objects[`${id}.present`] = {
                    _id: `${id}.present`,
                    type: 'state',
                    common: {
                        name: 'Present',
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                        custom: { 'history.0': { enabled: true } },
                    },
                    native: {},
                };
                this.history[`${id}.present`] = [...events]
                    .reverse()
                    .map(e => ({ ts: e.ts, val: e.present, ack: true }) as ioBroker.GetHistoryResult[number]);
            }
        }
        values[`${NS}.presence.guests.count`] = 2;
    }

    private write(id: string, val: ioBroker.StateValue, notify = true): void {
        const now = Date.now();
        this.states[id] = {
            val,
            ack: true,
            ts: now,
            lc: now,
            from: 'system.adapter.simulation',
            q: 0,
        };
        if (notify) {
            this.handlers.get(id)?.forEach(handler => handler(id, this.states[id]));
        }
    }

    getState(id: string): Promise<ioBroker.State | null> {
        return Promise.resolve(this.states[id] ?? null);
    }

    subscribeState(ids: string | string[], cb: Handler): Promise<void> {
        const list = Array.isArray(ids) ? ids : [ids];
        for (const id of list) {
            if (!this.handlers.has(id)) {
                this.handlers.set(id, new Set());
            }
            this.handlers.get(id)!.add(cb);
        }
        // like the real socket: the current values of the existing states, a missing one never calls back
        setTimeout(() => {
            for (const id of list) {
                if (this.states[id] && this.handlers.get(id)?.has(cb)) {
                    cb(id, this.states[id]);
                }
            }
        }, 20);
        return Promise.resolve();
    }

    unsubscribeState(ids: string | string[], cb: Handler): void {
        for (const id of Array.isArray(ids) ? ids : [ids]) {
            this.handlers.get(id)?.delete(cb);
        }
    }

    /** `context.setValue()` of vis-2: the adapter confirms the value */
    setValue(id: string, val: ioBroker.StateValue): void {
        console.log(`setValue(${id}, ${JSON.stringify(val)})`);
        setTimeout(() => this.write(id, val), 150);
    }

    getObjectViewSystem(type: string, start: string, end: string): Promise<Record<string, ioBroker.Object>> {
        const result: Record<string, ioBroker.Object> = {};
        for (const [id, obj] of Object.entries(this.objects)) {
            if (obj.type === type && id >= start && id <= end) {
                result[id] = obj;
            }
        }
        return Promise.resolve(result);
    }

    getObject(id: string): Promise<ioBroker.Object | null> {
        return Promise.resolve(this.objects[id] ?? null);
    }

    getHistory(id: string, options: ioBroker.GetHistoryOptions): Promise<ioBroker.GetHistoryResult> {
        const start = options.start || 0;
        const end = options.end || Date.now();
        return Promise.resolve((this.history[id] || []).filter(entry => entry.ts >= start && entry.ts <= end));
    }

    sendTo(_instance: string, command: string, _data?: unknown): Promise<unknown> {
        return new Promise(resolve =>
            setTimeout(() => {
                if (command === 'guestWlan') {
                    const params = new URLSearchParams(window.location.search);
                    const error = params.get('guestError');
                    resolve(
                        error
                            ? { error }
                            : {
                                  enabled: params.get('guestOff') !== '1',
                                  ssid: 'FRITZ!Box Gastzugang',
                                  password: 'Willkommen; im Garten!',
                                  security: 'WPA',
                                  hidden: false,
                              },
                    );
                } else if (command !== 'mesh') {
                    resolve(null);
                } else if (this.options.meshError) {
                    resolve({ error: this.options.meshError, nodes: [], links: [] });
                } else if (this.options.clients) {
                    resolve(bigMeshMock(this.options.clients));
                } else {
                    resolve(meshMock());
                }
            }, 300),
        );
    }
}
