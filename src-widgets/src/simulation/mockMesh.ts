// Only for the simulation (npm start) - never part of the widget build. Same data as src-admin/src/mockData.ts
import type { MeshLinkInfo, MeshNodeInfo, MeshResponse } from '../shared/types';

type Band = MeshLinkInfo['band'];

function mac(i: number): string {
    const hex = i.toString(16).padStart(4, '0').toUpperCase();
    return `3C:A6:2F:00:${hex.substring(0, 2)}:${hex.substring(2)}`;
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
    nodes.push({
        uid,
        name,
        mac: mac(i),
        ip: `192.168.178.${20 + i}`,
        role: 'client',
        configured: options?.configured,
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
        curRx: options?.disconnected ? 0 : Math.round(rate * (0.3 + (i % 7) / 10)),
        curTx: options?.disconnected ? 0 : Math.round(rate * (0.2 + (i % 5) / 10)),
        maxRx: rate,
        maxTx: rate,
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
    ];
    const links: MeshLinkInfo[] = [
        {
            from: 'n-1',
            to: 'n-2',
            type: 'WLAN',
            state: 'CONNECTED',
            interface: 'AP:5G:0',
            band: '5',
            curRx: 520_000,
            curTx: 610_000,
            maxRx: 866_700,
            maxTx: 866_700,
        },
        {
            from: 'n-1',
            to: 'n-3',
            type: 'LAN',
            state: 'CONNECTED',
            interface: 'LAN:2',
            curRx: 940_000,
            curTx: 940_000,
            maxRx: 1_000_000,
            maxTx: 1_000_000,
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

    client(nodes, links, '', 'Unknown-Device', '2.4', { noLink: true });

    return { ts: Date.now(), nodes, links };
}

/**
 * One box with `count` clients
 *
 * @param count number of clients
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
    return { ts: Date.now(), nodes, links };
}
