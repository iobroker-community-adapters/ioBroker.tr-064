// this file is used only for the simulation (npm start) and not in the build of the component
import type { MeshLinkInfo, MeshNodeInfo, MeshResponse } from './shared/types';

type Band = MeshLinkInfo['band'];

/** Manufacturers of the simulation - the real ones come from `data/oui.txt` of the adapter */
const VENDORS = [
    'Apple, Inc.',
    'Espressif Inc.',
    'AVM GmbH',
    'Samsung Electronics Co.,Ltd',
    'Raspberry Pi Trading Ltd',
    'Sonos, Inc.',
    'Synology Incorporated',
    'LG Electronics (Mobile Communications)',
    'Hewlett Packard',
    'Shenzhen Reolink Technology Co.,Ltd',
];

function mac(i: number): string {
    const hex = i.toString(16).padStart(4, '0').toUpperCase();
    return `3C:A6:2F:00:${hex.substring(0, 2)}:${hex.substring(2)}`;
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

function client(
    nodes: MeshNodeInfo[],
    links: MeshLinkInfo[],
    ap: string,
    name: string,
    band: Band | 'LAN',
    options?: { configured?: string; disconnected?: boolean; noLink?: boolean },
): void {
    const i = nodes.length + 1;
    const uid = `landevice${1000 + i}`;
    // every fourth device hides behind a randomized MAC address, as a phone does
    const random = i % 4 === 0;
    nodes.push({
        uid,
        name,
        mac: mac(i),
        ip: `192.168.178.${20 + i}`,
        role: 'client',
        configured: options?.configured,
        position: position(band === 'LAN', i),
        deviceClass: deviceClassOf(name),
        vendor: random ? undefined : VENDORS[i % VENDORS.length],
        randomMac: random || undefined,
    });
    if (options?.noLink) {
        return;
    }
    const lan = band === 'LAN';
    const rate = lan ? 1_000_000 : band === '2.4' ? 144_400 : band === '5' ? 866_700 : 1_201_000;
    links.push({
        from: ap,
        to: uid,
        type: lan ? 'LAN' : 'WLAN',
        state: options?.disconnected ? 'DISCONNECTED' : 'CONNECTED',
        interface: lan ? `LAN:${(i % 4) + 1}` : `AP:${band === '2.4' ? '2G' : band === '5' ? '5G' : '6G'}:0`,
        band: lan ? undefined : band,
        curDown: options?.disconnected ? 0 : Math.round(rate * (0.3 + (i % 7) / 10)),
        curUp: options?.disconnected ? 0 : Math.round(rate * (0.2 + (i % 5) / 10)),
        maxDown: rate,
        maxUp: rate,
        ...(lan ? {} : signal(i)),
        lastConnected: options?.disconnected ? Date.now() - (i % 7) * 3_600_000 : undefined,
    });
}

/** A master with two repeaters (one by WLAN, one by LAN) and about 25 clients */
export function meshMock(): MeshResponse {
    const nodes: MeshNodeInfo[] = [
        {
            uid: 'n-1',
            name: 'FRITZ!Box 7590 AX',
            model: 'FRITZ!Box 7590 AX',
            mac: mac(0),
            ip: '192.168.178.1',
            role: 'master',
        },
        {
            uid: 'n-2',
            name: 'Repeater Garten',
            model: 'FRITZ!Repeater 2400',
            mac: mac(9001),
            ip: '192.168.178.2',
            role: 'slave',
        },
        {
            uid: 'n-3',
            name: 'Repeater Keller',
            model: 'FRITZ!Repeater 1200 AX',
            mac: mac(9002),
            ip: '192.168.178.3',
            role: 'slave',
        },
        {
            uid: 'n-4',
            name: 'Switch Technikraum',
            model: 'Netgear GS308',
            mac: mac(9003),
            role: 'switch',
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
            curDown: 520_000,
            curUp: 610_000,
            maxDown: 866_700,
            maxUp: 866_700,
        },
        {
            from: 'n-1',
            to: 'n-3',
            type: 'LAN',
            state: 'CONNECTED',
            interface: 'LAN:2',
            curDown: 940_000,
            curUp: 940_000,
            maxDown: 1_000_000,
            maxUp: 1_000_000,
        },
        {
            from: 'n-1',
            to: 'n-4',
            type: 'LAN',
            state: 'CONNECTED',
            interface: 'LAN:3',
            curDown: 1_000_000,
            curUp: 1_000_000,
            maxDown: 1_000_000,
            maxUp: 1_000_000,
        },
    ];

    client(nodes, links, 'n-1', 'iPhone-Anna', '5', { configured: 'Handy Anna' });
    client(nodes, links, 'n-1', 'MacBook-Pro', '6');
    client(nodes, links, 'n-1', 'Galaxy-S24', '6');
    client(nodes, links, 'n-1', 'NAS-Synology', 'LAN');
    client(nodes, links, 'n-1', 'raspberrypi-iobroker', 'LAN');
    client(nodes, links, 'n-1', 'Sonos-Wohnzimmer', '2.4');
    client(nodes, links, 'n-1', 'Shelly-Plus-1PM-Kueche', '2.4');
    client(nodes, links, 'n-1', 'Shelly-Plus-1PM-Flur', '2.4');
    client(nodes, links, 'n-1', 'LG-OLED-TV', '5');
    client(nodes, links, 'n-1', 'Echo-Dot-Kueche', '2.4');
    client(nodes, links, 'n-1', 'HP-LaserJet', '2.4');
    client(nodes, links, 'n-1', 'Old-Tablet', '2.4', { disconnected: true });

    client(nodes, links, 'n-2', 'Pixel-8-Max', '5', { configured: 'Handy Max', disconnected: true });
    client(nodes, links, 'n-2', 'Robotic-Mower-Worx', '2.4');
    client(nodes, links, 'n-2', 'Garden-Camera-Reolink', '2.4');
    client(nodes, links, 'n-2', 'Tasmota-Pool-Pump', '2.4');
    client(nodes, links, 'n-2', 'Weather-Station', '2.4');
    client(nodes, links, 'n-2', 'Garden-Speaker', '5');
    client(nodes, links, 'n-2', 'ESP32-Irrigation', '2.4');
    client(nodes, links, 'n-2', 'Solar-Inverter-Hoymiles', '2.4');

    client(nodes, links, 'n-3', 'Heat-Pump-Controller', 'LAN');
    client(nodes, links, 'n-3', 'Homematic-CCU3', 'LAN');
    client(nodes, links, 'n-3', 'Workshop-PC', '5');
    client(nodes, links, 'n-3', 'Freezer-Plug', '2.4');
    client(nodes, links, 'n-3', 'Laundry-Sensor', '2.4');

    // a card without any signal: the chips show the manufacturer and the IP address next to each other
    client(nodes, links, 'n-4', 'CAM-Einfahrt', 'LAN');
    client(nodes, links, 'n-4', 'CAM-Garten', 'LAN');
    client(nodes, links, 'n-4', 'Doorbird-Klingel', 'LAN');
    client(nodes, links, 'n-4', 'Server-Proxmox', 'LAN');
    client(nodes, links, 'n-4', 'Drucker-Buero', 'LAN');

    client(nodes, links, '', 'Unknown-Device', '2.4', { noLink: true });

    return { ts: Date.now(), nodes, links, canRename: true };
}

/**
 * One box with `count` clients
 *
 * @param count
 */
export function bigMeshMock(count: number): MeshResponse {
    const nodes: MeshNodeInfo[] = [
        {
            uid: 'n-1',
            name: 'FRITZ!Box 5690 Pro',
            model: 'FRITZ!Box 5690 Pro',
            mac: mac(0),
            ip: '192.168.178.1',
            role: 'master',
        },
    ];
    const links: MeshLinkInfo[] = [];
    const bands: (Band | 'LAN')[] = ['2.4', '5', '6', 'LAN'];
    for (let i = 0; i < count; i++) {
        client(nodes, links, 'n-1', `Device-${String(i + 1).padStart(3, '0')}`, bands[i % 4], {
            configured: i === 3 ? 'Handy Anna' : undefined,
        });
    }
    return { ts: Date.now(), nodes, links, canRename: true };
}
