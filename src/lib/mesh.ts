/**
 * Mesh topology of the box (issue #383).
 *
 * `Hosts:1 X_AVM-DE_GetMeshListPath` returns the path of a JSON list: every device of the home
 * network is a node, its interfaces contain the links to other nodes. A link between a mesh node
 * (the box, a repeater) and a client is the access point of that client. The same link is listed
 * at both ends, therefore the links are collected by their UID.
 */
import { macsOverlap } from './utils';
import type { DeviceConfigEntry, MeshLinkInfo, MeshNodeInfo, MeshResponse } from './types';

interface MeshListLink {
    uid?: string;
    type?: string;
    state?: string;
    node_1_uid?: string;
    node_2_uid?: string;
    node_interface_1_uid?: string;
    node_interface_2_uid?: string;
    cur_data_rate_rx?: number;
    cur_data_rate_tx?: number;
    max_data_rate_rx?: number;
    max_data_rate_tx?: number;
}

interface MeshListInterface {
    uid?: string;
    name?: string;
    type?: string;
    node_links?: MeshListLink[];
}

interface MeshListNode {
    uid?: string;
    device_name?: string;
    device_mac_address?: string;
    device_model?: string;
    device_class?: string;
    is_meshed?: boolean;
    mesh_role?: string;
    ip_addresses?: { version?: string; value?: string }[];
    node_interfaces?: MeshListInterface[];
}

/** The JSON list of the box */
export interface MeshList {
    schema_version?: string;
    nodes?: MeshListNode[];
}

/** Where a configured device is connected */
export interface AccessPoint {
    /** Name of the box or repeater */
    name: string;
    /** `2.4 GHz`, `5 GHz`, `6 GHz`, `LAN` or the type of the link */
    connection: string;
}

/** Order of the roles from the upstream side: a link points from the lower to the higher rank */
const RANK: Record<MeshNodeInfo['role'], number> = { master: 0, switch: 1, slave: 2, client: 3 };

/** Band of a WLAN interface name like `AP:5G:0` or `UPLINK:2G:0` */
function bandOf(name: string): MeshLinkInfo['band'] {
    const m = /:(2|5|6)G\b/i.exec(name);
    if (!m) {
        return undefined;
    }
    return m[1] === '2' ? '2.4' : (m[1] as '5' | '6');
}

function roleOf(node: MeshListNode): MeshNodeInfo['role'] {
    if (node.is_meshed) {
        return node.mesh_role === 'master' ? 'master' : 'slave';
    }
    if (String(node.device_class || '').toUpperCase() === 'NETWORK_SWITCH') {
        return 'switch';
    }
    return 'client';
}

/**
 * Converts the JSON list of the box into nodes and links.
 *
 * @param list the JSON list of the box
 * @param configured the devices of the tab "Devices", they are marked with their name
 */
export function buildMeshTopology(list: MeshList, configured: DeviceConfigEntry[]): MeshResponse {
    const nodes: MeshNodeInfo[] = [];
    const byUid = new Map<string, MeshNodeInfo>();
    /** interface UID -> interface name */
    const interfaces = new Map<string, string>();

    for (const node of list.nodes || []) {
        if (!node.uid) {
            continue;
        }
        const mac = node.device_mac_address || '';
        const ip = node.ip_addresses?.find(a => a.version === 'V4' && a.value)?.value?.split('/')[0];
        const entry = mac ? configured.find(dev => macsOverlap(dev.mac || '', mac)) : undefined;
        const info: MeshNodeInfo = {
            uid: node.uid,
            name: node.device_name || mac || node.uid,
            mac,
            role: roleOf(node),
        };
        if (ip) {
            info.ip = ip;
        }
        if (node.device_model) {
            info.model = node.device_model;
        }
        if (entry) {
            info.configured = entry.name;
        }
        nodes.push(info);
        byUid.set(node.uid, info);

        for (const iface of node.node_interfaces || []) {
            if (iface.uid) {
                interfaces.set(iface.uid, iface.name || '');
            }
        }
    }

    const links = new Map<string, MeshLinkInfo>();
    for (const node of list.nodes || []) {
        for (const iface of node.node_interfaces || []) {
            for (const link of iface.node_links || []) {
                const n1 = byUid.get(link.node_1_uid || '');
                const n2 = byUid.get(link.node_2_uid || '');
                if (!n1 || !n2) {
                    continue;
                }
                const key = link.uid || `${n1.uid}|${n2.uid}|${iface.uid || iface.name}`;
                if (links.has(key)) {
                    continue;
                }

                const iface1 = interfaces.get(link.node_interface_1_uid || '') || '';
                const iface2 = interfaces.get(link.node_interface_2_uid || '') || '';
                // the upstream side is the lower rank; between two repeaters the one with the
                // UPLINK interface is the downstream one
                let forward = RANK[n1.role] < RANK[n2.role];
                if (RANK[n1.role] === RANK[n2.role]) {
                    forward = !/UPLINK/i.test(iface1);
                }
                const [from, to, fromIface, toIface] = forward ? [n1, n2, iface1, iface2] : [n2, n1, iface2, iface1];

                const info: MeshLinkInfo = {
                    from: from.uid,
                    to: to.uid,
                    type: link.type || iface.type || '',
                    state: link.state || '',
                    interface: fromIface,
                };
                const band = bandOf(fromIface) || bandOf(toIface);
                if (band && info.type !== 'LAN') {
                    info.band = band;
                }
                // the rates as the box reports them
                const rates = [
                    link.cur_data_rate_rx,
                    link.cur_data_rate_tx,
                    link.max_data_rate_rx,
                    link.max_data_rate_tx,
                ];
                if (typeof rates[0] === 'number') {
                    info.curRx = rates[0];
                }
                if (typeof rates[1] === 'number') {
                    info.curTx = rates[1];
                }
                if (typeof rates[2] === 'number') {
                    info.maxRx = rates[2];
                }
                if (typeof rates[3] === 'number') {
                    info.maxTx = rates[3];
                }
                links.set(key, info);
            }
        }
    }

    return { ts: Date.now(), nodes, links: [...links.values()] };
}

/**
 * Finds the access point of a configured device: the box, repeater or switch at the other end of
 * its link. A connected link wins over a disconnected one.
 *
 * @param topology result of `buildMeshTopology()`
 * @param entry the device of the configuration
 */
export function findAccessPoint(topology: MeshResponse, entry: DeviceConfigEntry): AccessPoint | undefined {
    const own = topology.nodes.filter(node => node.mac && macsOverlap(entry.mac || '', node.mac));
    if (!own.length) {
        return undefined;
    }
    const ownUids = new Set(own.map(node => node.uid));
    const byUid = new Map(topology.nodes.map(node => [node.uid, node]));

    const candidates = topology.links.filter(link => ownUids.has(link.to) && byUid.get(link.from)?.role !== 'client');
    const link = candidates.find(l => l.state === 'CONNECTED') || candidates[0];
    if (!link) {
        return undefined;
    }

    let connection = link.type;
    if (link.band) {
        connection = `${link.band} GHz`;
    } else if (link.type === 'LAN') {
        connection = 'LAN';
    }
    return { name: byUid.get(link.from)?.name || '', connection };
}
