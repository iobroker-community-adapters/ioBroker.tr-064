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
            curRx: 866_700,
            curTx: 780_000,
            maxRx: 1_733_000,
            maxTx: 1_733_000,
        },
        {
            from: 'n-1',
            to: 'n-3',
            type: 'LAN',
            state: 'CONNECTED',
            interface: 'LAN:2',
            curRx: 1_000_000,
            curTx: 1_000_000,
            maxRx: 1_000_000,
            maxTx: 1_000_000,
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
            curRx: options?.disconnected ? 0 : Math.round(rate * (0.3 + (i % 7) / 10)),
            curTx: options?.disconnected ? 0 : Math.round(rate * (0.2 + (i % 5) / 10)),
            maxRx: rate,
            maxTx: rate,
        });
    });

    return { ts: Date.now(), nodes, links };
}
