// SIMULATION ONLY (`npm start`) - not part of the federation build.
// States of a tr-064 instance in several situations and a mesh topology with a master, two
// repeaters and 26 clients.

import type { MeshLinkInfo, MeshNodeInfo, MeshResponse } from './shared/types';

export type Scenario = 'full' | 'offline' | 'minimal' | 'ringing';

export const SCENARIOS: { id: Scenario; title: string }[] = [
    { id: 'full', title: 'DSL, all states' },
    { id: 'ringing', title: 'Fiber, 6 GHz, a call comes in' },
    { id: 'minimal', title: 'Cable, no call lists / call monitor / 5 GHz' },
    { id: 'offline', title: 'Box not reachable' },
];

/** States relative to `tr-064.0.` */
export function mockStates(scenario: Scenario): Record<string, ioBroker.StateValue> {
    const full: Record<string, ioBroker.StateValue> = {
        'info.connection': true,
        'states.boxModel': 'FRITZ!Box 7590 AX',
        'states.boxFirmware': '254.08.03',
        'states.wanAccessType': 'DSL',
        'states.wanLinkStatus': 'Up',
        'states.wanProvider': 'Telekom',
        'states.externalIP': '93.184.216.34',
        'states.wanReceiveRate': 6_025_000, // 48,2 Mbit/s
        'states.wanSendRate': 640_000, // 5,1 Mbit/s
        'states.wanDownstreamMax': 250_000_000,
        'states.wanUpstreamMax': 40_000_000,
        'states.wlan': true,
        'states.wlan24': true,
        'states.wlan50': true,
        'states.wlanGuest': false,
        'states.abNewMessages': 2,
        'calllists.missed.count': 3,
        'callmonitor.ringing': false,
        'callmonitor.connected': true,
    };

    switch (scenario) {
        case 'ringing':
            return {
                ...full,
                'states.boxModel': 'FRITZ!Box 5690 Pro',
                'states.boxFirmware': '317.08.10',
                'states.wanAccessType': 'Fiber',
                'states.wanProvider': 'Deutsche Glasfaser',
                'states.externalIP': '185.199.108.153',
                'states.wanReceiveRate': 112_500_000, // 900 Mbit/s
                'states.wanSendRate': 31_250_000, // 250 Mbit/s
                'states.wanDownstreamMax': 1_000_000_000,
                'states.wanUpstreamMax': 500_000_000,
                'states.wlan60': true,
                'states.wlanGuest': true,
                'states.abNewMessages': 0,
                'calllists.missed.count': 1,
                'callmonitor.ringing': true,
            };
        case 'minimal':
            return {
                'info.connection': true,
                'states.boxModel': 'FRITZ!Box 6660 Cable',
                'states.boxFirmware': '276.07.57',
                'states.wanAccessType': 'Cable',
                'states.wanLinkStatus': 'Up',
                'states.wanReceiveRate': 106_000, // 848 kbit/s
                'states.wanSendRate': 12_500,
                'states.wlan24': true,
                'states.wlanGuest': false,
                'states.abNewMessages': 0,
            };
        case 'offline':
            return { ...full, 'info.connection': false, 'states.wanReceiveRate': 0, 'states.wanSendRate': 0 };
        default:
            return full;
    }
}

type Band = MeshLinkInfo['band'];

function mac(i: number): string {
    const hex = i.toString(16).padStart(4, '0').toUpperCase();
    return `3C:A6:2F:12:${hex.substring(0, 2)}:${hex.substring(2)}`;
}

/** WLAN signal of a mock link: from -45 dBm down to -85 dBm, a bit weaker at the access point */
function signal(i: number): { rcpiTo: number; rcpiFrom: number; rsniTo: number; rsniFrom: number } {
    const rcpi = -45 - ((i * 7) % 41);
    return { rcpiTo: rcpi, rcpiFrom: rcpi - 3, rsniTo: 60 + rcpi, rsniFrom: 57 + rcpi };
}

/** The box rates a weak signal as "too far away" */
function position(lan: boolean, i: number): MeshNodeInfo['position'] {
    return !lan && signal(i).rcpiTo < -78 ? 'too_far' : undefined;
}

/** A plausible device class for a mock name, so the simulation shows the symbols */
function deviceClassOf(name: string): string | undefined {
    const n = name.toLowerCase();
    const classes: [RegExp, string][] = [
        [/iphone|pixel|galaxy|handy|phone/, 'SMARTPHONE'],
        [/tablet|ipad/, 'TABLET'],
        [/macbook|laptop|notebook|pc|imac|desktop/, 'COMPUTER'],
        [/nas|synology|proxmox|server|dell/, 'STORAGE'],
        [/doorbell|klingel|doorbird/, 'DOOR_BELL'],
        [/raspberry|esp32|shelly|tasmota|iobroker|zigbee|ccu/, 'CIRCUIT_BOARD'],
        [/sonos|echo|speaker|lautsprecher/, 'SPEAKER'],
        [/cam|kamera|camera|reolink/, 'CAMERA'],
        [/tv|oled/, 'SET_TOP_BOX'],
        [/laserjet|print|drucker/, 'PRINTER'],
        [/mower|vacuum|robot|maeher/, 'ROBOT'],
        [/licht|light|lamp|beleuchtung/, 'LAMP'],
        [/thermostat|heiz/, 'THERMOSTAT'],
        [/weather|wetter|sensor/, 'SENSOR'],
        [/pump|irrigation|bewaesser|steckdose|socket/, 'SOCKET'],
        [/switch/, 'NETWORK_SWITCH'],
    ];
    return classes.find(([re]) => re.test(n))?.[1];
}

/** A master, a repeater by WLAN and one by LAN, and 26 clients */
export function meshMock(): MeshResponse {
    const nodes: MeshNodeInfo[] = [
        {
            uid: 'n-1',
            name: 'FRITZ!Box 7590 AX',
            model: 'FRITZ!Box 7590 AX',
            mac: mac(1),
            ip: '192.168.178.1',
            role: 'master',
        },
        {
            uid: 'n-2',
            name: 'Repeater Obergeschoss',
            model: 'FRITZ!Repeater 2400',
            mac: mac(2),
            ip: '192.168.178.2',
            role: 'slave',
        },
        {
            uid: 'n-3',
            name: 'Repeater Garage',
            model: 'FRITZ!Repeater 1200 AX',
            mac: mac(3),
            ip: '192.168.178.3',
            role: 'slave',
        },
    ];
    const links: MeshLinkInfo[] = [
        {
            from: 'n-1',
            to: 'n-2',
            type: 'WLAN',
            state: 'CONNECTED',
            interface: 'AP:5G:0',
            band: '5',
            curDown: 866_700,
            curUp: 780_000,
            maxDown: 1_733_000,
            maxUp: 1_733_000,
        },
        {
            from: 'n-1',
            to: 'n-3',
            type: 'LAN',
            state: 'CONNECTED',
            interface: 'LAN:2',
            curDown: 1_000_000,
            curUp: 1_000_000,
            maxDown: 1_000_000,
            maxUp: 1_000_000,
        },
    ];

    const clients: [string, string, Band | 'LAN', { configured?: string; disconnected?: boolean }?][] = [
        ['n-1', 'NAS', 'LAN', { configured: 'NAS' }],
        ['n-1', 'ioBroker', 'LAN', { configured: 'ioBroker Server' }],
        ['n-1', 'Desktop-PC', 'LAN'],
        ['n-1', 'iPhone-Anna', '5', { configured: 'Anna' }],
        ['n-1', 'Galaxy-S24', '5', { configured: 'Peter' }],
        ['n-1', 'MacBook-Air', '5'],
        ['n-1', 'Sonos-Kueche', '2.4'],
        ['n-1', 'Shelly-Plug-S', '2.4'],
        ['n-1', 'Fernseher', '5'],
        ['n-1', 'Drucker', '2.4', { disconnected: true }],
        ['n-2', 'iPad', '5'],
        ['n-2', 'Kindle', '2.4'],
        ['n-2', 'Laptop-Arbeit', '5'],
        ['n-2', 'Echo-Dot', '2.4'],
        ['n-2', 'Pixel-8', '5', { configured: 'Lena' }],
        ['n-2', 'Nintendo-Switch', '5'],
        ['n-2', 'Staubsauger', '2.4'],
        ['n-2', 'Tolino', '2.4', { disconnected: true }],
        ['n-3', 'Wallbox', 'LAN', { configured: 'Wallbox' }],
        ['n-3', 'Kamera-Einfahrt', '2.4'],
        ['n-3', 'Rasenmaeher', '2.4'],
        ['n-3', 'Garagentor', '2.4'],
        ['n-3', 'Wechselrichter', 'LAN'],
        ['n-3', 'Wetterstation', '2.4'],
        ['n-3', 'Tablet-Werkstatt', '5', { disconnected: true }],
        ['n-3', 'Bewaesserung', '2.4'],
    ];

    clients.forEach(([ap, name, band, options], index) => {
        const i = index + 10;
        const uid = `landevice${1000 + i}`;
        nodes.push({
            uid,
            name,
            mac: mac(i),
            ip: `192.168.178.${20 + index}`,
            role: 'client',
            configured: options?.configured,
            position: position(band === 'LAN', i),
            deviceClass: deviceClassOf(name),
        });
        const lan = band === 'LAN';
        const rate = lan ? 1_000_000 : band === '2.4' ? 144_400 : band === '5' ? 866_700 : 1_201_000;
        links.push({
            from: ap,
            to: uid,
            type: lan ? 'LAN' : 'WLAN',
            state: options?.disconnected ? 'DISCONNECTED' : 'CONNECTED',
            interface: lan ? `LAN:${(i % 4) + 1}` : `AP:${band === '2.4' ? '2G' : '5G'}:0`,
            band: lan ? undefined : band,
            curDown: options?.disconnected ? 0 : Math.round(rate * (0.3 + (i % 7) / 10)),
            curUp: options?.disconnected ? 0 : Math.round(rate * (0.2 + (i % 5) / 10)),
            maxDown: rate,
            maxUp: rate,
            ...(lan ? {} : signal(i)),
            lastConnected: options?.disconnected ? Date.now() - (i % 7) * 3_600_000 : undefined,
        });
    });

    return { ts: Date.now(), nodes, links };
}

/** A person of the presence detection (`tr-064.0.presence.persons.<id>`) */
export interface MockPerson {
    name: string;
    /** ID of the channel below `presence.persons` */
    id: string;
    group: string;
    present: boolean;
    /** newest first, `ts` in ms */
    history: { ts: number; present: boolean }[];
    devices: string;
    /** settings of the tile which show a feature: photo, icons, own texts */
    settings?: Record<string, unknown>;
}

const MINUTE = 60_000;

/** A round "photo": gradient with the initials, as a data URL */
function mockPhoto(initials: string, from: string, to: string): string {
    return `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="60" font-family="Arial" font-size="38" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`,
    )}`;
}

/** Three persons: present with initials, away with own icons and texts, present with a photo */
export function mockPersons(now = Date.now()): MockPerson[] {
    return [
        {
            name: 'Anna',
            id: 'Anna',
            group: 'Family',
            present: true,
            devices: 'iPhone-Anna',
            history: [
                { ts: now - 135 * MINUTE, present: true },
                { ts: now - 9 * 60 * MINUTE, present: false },
                { ts: now - 22 * 60 * MINUTE, present: true },
                { ts: now - 26 * 60 * MINUTE, present: false },
                { ts: now - 47 * 60 * MINUTE, present: true },
                { ts: now - 3 * 24 * 60 * MINUTE, present: false },
            ],
        },
        {
            name: 'Peter Müller',
            id: 'Peter_Mueller',
            group: 'Family',
            present: false,
            devices: '',
            history: [
                { ts: now - 47 * MINUTE, present: false },
                { ts: now - 5 * 60 * MINUTE, present: true },
                { ts: now - 25 * 60 * MINUTE, present: false },
            ],
            settings: { iconActive: '🏠', icon: '🚗', textActive: 'At home', text: 'On the road' },
        },
        {
            name: 'Lena',
            id: 'Lena',
            group: 'Guests',
            present: true,
            devices: 'Pixel-8, Galaxy-Tab',
            history: [{ ts: now - 4 * 24 * 60 * MINUTE, present: true }],
            settings: { photo: mockPhoto('L', '#ff8a65', '#ba68c8') },
        },
    ];
}

/** The states of the persons, relative to `tr-064.0.` */
export function mockPersonStates(now = Date.now()): Record<string, ioBroker.StateValue> {
    const result: Record<string, ioBroker.StateValue> = {};
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    for (const person of mockPersons(now)) {
        const prefix = `presence.persons.${person.id}`;
        const lastArrival = person.history.find(event => event.present)?.ts || 0;
        const lastDeparture = person.history.find(event => !event.present)?.ts || 0;
        const since = person.present ? lastArrival : lastDeparture;
        const today = Math.floor((now - midnight) / MINUTE);
        const presentToday = person.present
            ? Math.min(today, Math.floor((now - since) / MINUTE))
            : Math.floor(today / 3);
        result[`${prefix}.present`] = person.present;
        result[`${prefix}.lastArrival`] = lastArrival;
        result[`${prefix}.lastDeparture`] = lastDeparture;
        result[`${prefix}.presentSince`] = person.present ? Math.floor((now - since) / MINUTE) : 0;
        result[`${prefix}.absentSince`] = person.present ? 0 : Math.floor((now - since) / MINUTE);
        result[`${prefix}.presentToday`] = presentToday;
        result[`${prefix}.absentToday`] = Math.max(0, today - presentToday);
        result[`${prefix}.devices`] = person.devices;
        result[`${prefix}.history`] = JSON.stringify(person.history);
    }
    return result;
}

/** The channels of the persons, as `getObjectViewSystem('channel', ...)` delivers them */
export function mockPersonChannels(instance: string): Record<string, ioBroker.ChannelObject> {
    const result: Record<string, ioBroker.ChannelObject> = {};
    for (const person of mockPersons()) {
        const id = `${instance}.presence.persons.${person.id}`;
        result[id] = {
            _id: id,
            type: 'channel',
            common: { name: person.name },
            native: { person: person.name, group: person.group },
        };
    }
    return result;
}
