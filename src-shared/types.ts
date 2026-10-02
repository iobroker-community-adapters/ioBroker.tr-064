/** Answer of the message `mesh` of the adapter (see `src/lib/types.ts` of the adapter) */
export interface MeshResponse {
    /** `not connected`, `not supported` or another error text */
    error?: string;
    ts?: number;
    nodes: MeshNodeInfo[];
    links: MeshLinkInfo[];
    /** The box offers `X_AVM-DE_SetHostNameByMACAddress`, i.e. a device can be renamed */
    canRename?: boolean;
}

/** Answer of the message `setHostName`: empty if the device was renamed */
export interface RenameResponse {
    /** `not connected`, `not supported` or the error text of the box */
    error?: string;
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
    /**
     * Manufacturer: `device_manufacturer` of the box, which knows it from LLDP or DHCP, otherwise
     * the owner of the first bytes of the MAC address (`src/lib/oui.ts` of the adapter)
     */
    vendor?: string;
    /** A randomized (locally administered) MAC address, which belongs to no manufacturer */
    randomMac?: boolean;
    /** WLAN: how the box rates the signal of the uplink of this device (`client_position`) */
    position?: 'too_close' | 'too_far' | 'ok';
    /** Kind of the device as the box knows it: `COMPUTER`, `SMARTPHONE`, `CAMERA`, `LAMP`, ... */
    deviceClass?: string;
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
    /** Data rates in kbit/s, seen from the device (`to`): `down` is `from` -> `to` */
    curDown?: number;
    curUp?: number;
    maxDown?: number;
    maxUp?: number;
    /** WLAN: signal strength in dBm, measured at the access point (`from`) and at the device (`to`) */
    rcpiFrom?: number;
    rcpiTo?: number;
    /** WLAN: signal to noise in dB, measured at the same two sides */
    rsniFrom?: number;
    rsniTo?: number;
    /** `last_connected` of the box as a UNIX time stamp in milliseconds */
    lastConnected?: number;
}
