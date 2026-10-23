/**
 * Access data of a WLAN - the guest WLAN or one band of the own WLAN - and its QR code.
 *
 * - `fetchGuestWlan()` - one request `sendTo('<instance>', 'guestWlan', { wlan })`, never throws
 * - `GuestWlanLoader` - reads on `start()`/`refresh()` and periodically, for class components
 * - `useGuestWlanLoader()` - the same as React hook, e.g. for a dialog
 * - `wifiQrText()` - the `WIFI:` text which phone cameras understand
 * - `qrPath()` - the QR code of a text as SVG path
 *
 * The password is only held in memory while it is shown. It is not in a state of the adapter.
 */
import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';

import { MESH_ERROR_NOT_ALIVE, MESH_ERROR_TIMEOUT, type MeshSocket } from './meshApi';
import type { GuestWlanResponse, WlanQrKind } from './types';

/** Seconds between two refreshes of the QR code which is shown on a tile */
export const GUEST_WLAN_REFRESH_INTERVAL = 600;

/** The WLANs a QR code can be shown for, in the order of the selection */
export const WLAN_QR_KINDS: WlanQrKind[] = ['guest', 'wlan24', 'wlan50', 'wlan52', 'wlan60'];

/**
 * States of a WLAN below `tr-064.<n>`: `on` is the switch, `password` the state which sets a new
 * password - a change of one of them reads the code again
 */
export const WLAN_QR_STATES: Record<WlanQrKind, { on: string; password: string }> = {
    guest: { on: 'states.wlanGuest', password: 'states.wlanGuestPassword' },
    wlan24: { on: 'states.wlan24', password: 'states.wlan24Password' },
    wlan50: { on: 'states.wlan50', password: 'states.wlan50Password' },
    wlan52: { on: 'states.wlan52', password: 'states.wlan52Password' },
    wlan60: { on: 'states.wlan60', password: 'states.wlan60Password' },
};

/**
 * A valid `WlanQrKind`, the guest WLAN for anything else (widgets of 5.3.0 have no setting)
 *
 * @param value setting of the widget
 */
export function wlanQrKind(value: unknown): WlanQrKind {
    return WLAN_QR_KINDS.includes(value as WlanQrKind) ? (value as WlanQrKind) : 'guest';
}

/**
 * Key of the name of a WLAN in the `tr064_*` texts, e.g. `Guest Wi-Fi` or `Wi-Fi 5 GHz`
 *
 * @param wlan the WLAN
 */
export function wlanTitleKey(wlan: WlanQrKind): string {
    return wlan === 'guest' ? 'tr064_guestWlan' : `tr064_${wlan}`;
}

/**
 * Asks the instance for the access data of a WLAN.
 *
 * Resolves always, errors are in `error`: `not alive` if the instance does not run, `timeout` if
 * it did not answer within `timeoutMs`, `not connected`/`not supported` from the adapter, or the
 * text of an exception or of the box (e.g. the user has no right "FRITZ!Box settings").
 *
 * @param socket connection of the host (vis-2, devices)
 * @param instanceId e.g. `tr-064.0`
 * @param wlan the guest WLAN or one band of the own WLAN
 * @param timeoutMs time limit of the request
 */
export async function fetchGuestWlan(
    socket: MeshSocket,
    instanceId: string,
    wlan: WlanQrKind = 'guest',
    timeoutMs = 20_000,
): Promise<GuestWlanResponse> {
    try {
        const alive = await socket.getState(`system.adapter.${instanceId}.alive`);
        if (!alive?.val) {
            return { error: MESH_ERROR_NOT_ALIVE };
        }

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<typeof MESH_ERROR_TIMEOUT>(resolve => {
            timer = setTimeout(() => resolve(MESH_ERROR_TIMEOUT), timeoutMs);
        });
        const request = socket.sendTo(instanceId, 'guestWlan', { wlan }) as Promise<GuestWlanResponse | null>;
        const answer = await Promise.race([request, timeout]);
        clearTimeout(timer);

        if (answer === MESH_ERROR_TIMEOUT || !answer || typeof answer !== 'object') {
            return { error: MESH_ERROR_TIMEOUT };
        }
        if (answer.error) {
            return { error: answer.error };
        }
        return {
            enabled: !!answer.enabled,
            ssid: String(answer.ssid ?? ''),
            password: String(answer.password ?? ''),
            security: answer.security === 'WEP' || answer.security === 'nopass' ? answer.security : 'WPA',
            hidden: !!answer.hidden,
        };
    } catch (e) {
        return { error: (e as Error)?.message || String(e) };
    }
}

/** What `GuestWlanLoader` reports */
export interface GuestWlanState {
    /** Last successful answer, `null` while nothing was read or the instance is stopped */
    data: GuestWlanResponse | null;
    loading: boolean;
    /** Error code or text of the last request, `null` if it was successful */
    error: string | null;
}

export interface GuestWlanLoaderOptions {
    socket: MeshSocket;
    /** e.g. `tr-064.0` */
    instanceId: string;
    /** Default: the guest WLAN */
    wlan?: WlanQrKind;
    /** Seconds between two refreshes, 0 = only on `refresh()`. Default `GUEST_WLAN_REFRESH_INTERVAL` */
    interval?: number;
    /** Called on every change of the state */
    onChange: (state: GuestWlanState) => void;
}

/** Reads the guest WLAN now and then every `interval` seconds, like `MeshLoader` */
export class GuestWlanLoader {
    private readonly options: GuestWlanLoaderOptions;

    private timer: ReturnType<typeof setInterval> | null = null;

    private running = false;

    /** `refresh()` was called while a request was running: read once more afterwards */
    private again = false;

    private stopped = true;

    private current: GuestWlanState = { data: null, loading: false, error: null };

    constructor(options: GuestWlanLoaderOptions) {
        this.options = options;
    }

    /** Reads now and then every `interval` seconds */
    start(): void {
        this.stop();
        this.stopped = false;
        void this.refresh();
        const interval = this.options.interval ?? GUEST_WLAN_REFRESH_INTERVAL;
        if (interval > 0) {
            this.timer = setInterval(() => void this.refresh(), interval * 1000);
        }
    }

    /** Stops the refresh and forgets the password, `onChange` is not called any more */
    stop(): void {
        this.stopped = true;
        this.again = false;
        this.current = { data: null, loading: false, error: null };
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Reads now. A call while a request is running reads once more after it - the data may have changed */
    async refresh(): Promise<void> {
        if (this.stopped) {
            return;
        }
        if (this.running) {
            this.again = true;
            return;
        }
        this.running = true;
        this.update({ loading: true });

        const response = await fetchGuestWlan(this.options.socket, this.options.instanceId, this.options.wlan);
        this.running = false;
        if (this.stopped) {
            return;
        }
        if (!response.error) {
            this.update({ data: response, loading: false, error: null });
        } else if (response.error === MESH_ERROR_NOT_ALIVE) {
            this.update({ data: null, loading: false, error: response.error });
        } else {
            // keep the last data on a temporary error
            this.update({ loading: false, error: response.error });
        }
        if (this.again) {
            this.again = false;
            void this.refresh();
        }
    }

    private update(changed: Partial<GuestWlanState>): void {
        this.current = { ...this.current, ...changed };
        if (!this.stopped) {
            this.options.onChange(this.current);
        }
    }
}

/**
 * The same as `GuestWlanLoader` for function components: reads when the component is mounted
 *
 * @param socket connection of the host, `null` until it is available
 * @param instanceId e.g. `tr-064.0`
 * @param wlan the guest WLAN or one band of the own WLAN
 * @param interval seconds between two refreshes, 0 = only on `refresh()`
 */
export function useGuestWlanLoader(
    socket: MeshSocket | null | undefined,
    instanceId: string,
    wlan: WlanQrKind = 'guest',
    interval = 0,
): GuestWlanState & { refresh: () => void } {
    const [state, setState] = useState<GuestWlanState>({ data: null, loading: true, error: null });
    const loader = useRef<GuestWlanLoader | null>(null);

    useEffect(() => {
        if (!socket || !instanceId) {
            return undefined;
        }
        const guestLoader = new GuestWlanLoader({ socket, instanceId, wlan, interval, onChange: setState });
        loader.current = guestLoader;
        guestLoader.start();
        return () => {
            guestLoader.stop();
            loader.current = null;
        };
    }, [socket, instanceId, wlan, interval]);

    return { ...state, refresh: () => void loader.current?.refresh() };
}

/**
 * `\`, `;`, `,`, `:` and `"` are escaped with a backslash in the fields of a `WIFI:` code
 *
 * @param text SSID or password
 */
function escapeWifi(text: string): string {
    return text.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * The text of the QR code with which a phone joins the WLAN (the format of the ZXing project, which
 * the cameras of Android and iOS understand): `WIFI:T:WPA;S:<ssid>;P:<password>;H:true;;`
 *
 * @param data access data of the guest WLAN
 */
export function wifiQrText(data: GuestWlanResponse): string {
    const security = data.security || 'WPA';
    const parts = [`T:${security}`, `S:${escapeWifi(data.ssid || '')}`];
    if (security !== 'nopass') {
        parts.push(`P:${escapeWifi(data.password || '')}`);
    }
    if (data.hidden) {
        parts.push('H:true');
    }
    return `WIFI:${parts.join(';')};;`;
}

/** A QR code as SVG path: modules of 1 x 1 in a square of `size` x `size` without quiet zone */
export interface QrPath {
    size: number;
    /** `d` of the path of the dark modules */
    d: string;
}

/**
 * The QR code of a text, error correction M, the smallest version which fits.
 *
 * `qrcode-generator` takes the low byte of every UTF-16 code unit; an SSID with umlauts or emojis
 * must be UTF-8, so the text is handed over byte by byte.
 *
 * @param text e.g. `wifiQrText()`
 */
export function qrPath(text: string): QrPath {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    const qr = qrcode(0, 'M');
    qr.addData(binary, 'Byte');
    qr.make();

    const size = qr.getModuleCount();
    const d: string[] = [];
    for (let row = 0; row < size; row++) {
        // one rectangle per run of dark modules in a row
        let col = 0;
        while (col < size) {
            if (!qr.isDark(row, col)) {
                col++;
                continue;
            }
            const start = col;
            while (col < size && qr.isDark(row, col)) {
                col++;
            }
            d.push(`M${start} ${row}h${col - start}v1h-${col - start}z`);
        }
    }
    return { size, d: d.join('') };
}
