/** Answer of the message `mesh` of the adapter (see `src/lib/types.ts` of the adapter) */
export interface MeshResponse {
    /** `not connected`, `not supported` or another error text */
    error?: string;
    ts?: number;
    nodes: MeshNodeInfo[];
    links: MeshLinkInfo[];
}

export type MeshRole = 'master' | 'slave' | 'switch' | 'client';

/** Node of the mesh topology */
export interface MeshNodeInfo {
    uid: string;
    name: string;
    mac: string;
    ip?: string;
    model?: string;
    role: MeshRole;
    /** Name in the tab "Devices", if this is a configured device */
    configured?: string;
}

/** Connection between two nodes of the mesh topology */
export interface MeshLinkInfo {
    /** The access point or upstream side */
    from: string;
    to: string;
    /** `WLAN`, `LAN`, ... */
    type: string;
    /** `CONNECTED` or `DISCONNECTED` */
    state: string;
    /** Name of the interface on the `from` side, e.g. `AP:5G:0`, `LAN:1` */
    interface: string;
    band?: '2.4' | '5' | '6';
    /** Data rates in kbit/s */
    curRx?: number;
    curTx?: number;
    maxRx?: number;
    maxTx?: number;
}
