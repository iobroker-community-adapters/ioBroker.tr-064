// Helpers of the FRITZ!Box tile: which states it reads and how the values are shown.

/** States of a tr-064 instance the tile reads, relative to `tr-064.<n>`. Each one may be missing. */
export const STATE_IDS = {
    /** the box answers (written by the adapter, `false` while it does not) */
    connection: 'info.connection',
    model: 'states.boxModel',
    firmware: 'states.boxFirmware',
    /** DSL, Ethernet, Fiber, Cable, LTE, UMTS */
    accessType: 'states.wanAccessType',
    /** Up, Down, Initializing, Unavailable */
    linkStatus: 'states.wanLinkStatus',
    provider: 'states.wanProvider',
    externalIP: 'states.externalIP',
    /** bytes/s */
    receiveRate: 'states.wanReceiveRate',
    sendRate: 'states.wanSendRate',
    /** bit/s */
    downstreamMax: 'states.wanDownstreamMax',
    upstreamMax: 'states.wanUpstreamMax',
    /** the WLAN button of the box, older firmware does not report it */
    wlan: 'states.wlan',
    wlan24: 'states.wlan24',
    wlan50: 'states.wlan50',
    /** second 5 GHz access point (FRITZ!Box 4060) */
    wlan52: 'states.wlan52',
    wlan60: 'states.wlan60',
    wlanGuest: 'states.wlanGuest',
    abNewMessages: 'states.abNewMessages',
    /** only if the call lists are enabled */
    missedCalls: 'calllists.missed.count',
    /** only if the call monitor is enabled */
    ringing: 'callmonitor.ringing',
} as const;

export type StateKey = keyof typeof STATE_IDS;

export const STATE_KEYS = Object.keys(STATE_IDS) as StateKey[];

export type StateValues = Partial<Record<StateKey, ioBroker.StateValue>>;

/** The WLAN bands in the order they are shown, with their label (GHz, `.` is localized) */
export const WLAN_BANDS: { key: StateKey; label: string; guest?: boolean }[] = [
    { key: 'wlan24', label: '2.4' },
    { key: 'wlan50', label: '5' },
    { key: 'wlan52', label: '5 (2)' },
    { key: 'wlan60', label: '6' },
    { key: 'wlanGuest', label: '', guest: true },
];

export const DEFAULT_INSTANCE = 'tr-064.0';

/** `tr-064.0` - also accepts `system.adapter.tr-064.0` and the bare instance number */
export function normalizeInstance(instance: string | undefined | null): string {
    const text = String(instance ?? '')
        .trim()
        .replace(/^system\.adapter\./, '');
    if (/^\d+$/.test(text)) {
        return `tr-064.${text}`;
    }
    return /^[-\w]+\.\d+$/.test(text) ? text : DEFAULT_INSTANCE;
}

/** A state without value (`null`, or never delivered) counts as missing */
export function has(values: StateValues, key: StateKey): boolean {
    const value = values[key];
    return value !== null && value !== undefined && value !== '';
}

export function num(values: StateValues, key: StateKey): number {
    const value = Number(values[key]);
    return Number.isFinite(value) ? value : 0;
}

export function str(values: StateValues, key: StateKey): string {
    return has(values, key) ? String(values[key]) : '';
}

export function bool(values: StateValues, key: StateKey): boolean {
    const value = values[key];
    return value === true || value === 'true' || value === 1 || value === '1';
}

/** A number with the decimal separator of the system */
export function formatNumber(value: number, decimals: number, floatComma: boolean): string {
    const text = value.toFixed(decimals);
    return floatComma ? text.replace('.', ',') : text;
}

export interface Rate {
    value: string;
    unit: string;
}

/**
 * A data rate in bit/s, readable: `850 kbit/s`, `48,2 Mbit/s`, `250 Mbit/s`, `1,2 Gbit/s`
 *
 * @param bits bit/s
 * @param floatComma `,` as decimal separator
 * @param exact without the decimals of a round value (maximum rates: `250 Mbit/s`, `1 Gbit/s`)
 */
export function formatRate(bits: number, floatComma: boolean, exact?: boolean): Rate {
    if (!Number.isFinite(bits) || bits <= 0) {
        return { value: '0', unit: 'Mbit/s' };
    }
    let value: number;
    let unit: string;
    if (bits < 1_000_000) {
        value = bits / 1000;
        unit = 'kbit/s';
    } else if (bits < 1_000_000_000) {
        value = bits / 1_000_000;
        unit = 'Mbit/s';
    } else {
        value = bits / 1_000_000_000;
        unit = 'Gbit/s';
    }
    let decimals = value < 10 ? 1 : value < 100 && unit !== 'kbit/s' ? 1 : 0;
    if (unit === 'Gbit/s') {
        decimals = value < 10 ? 2 : 1;
    }
    if (exact && Math.abs(value - Math.round(value)) < 0.05) {
        decimals = 0;
    }
    let text = formatNumber(value, decimals, floatComma);
    if (exact && decimals) {
        // 1,20 Gbit/s -> 1,2 Gbit/s
        text = text.replace(/([.,]\d*?)0+$/, '$1').replace(/[.,]$/, '');
    }
    return { value: text, unit };
}

/** `154.08.03` (NewSoftwareVersion: model, major, minor) -> `FRITZ!OS 8.03` */
export function firmwareLabel(firmware: string): string {
    const match = firmware.match(/^\d+\.(\d+)\.(\d+)/);
    if (match) {
        return `FRITZ!OS ${Number(match[1])}.${match[2]}`;
    }
    return firmware;
}

/** Share of `value` in `max` in percent, 0 - 100 */
export function percent(value: number, max: number): number {
    if (!max || max <= 0 || !value || value <= 0) {
        return 0;
    }
    return Math.min(100, Math.max(0, (value / max) * 100));
}
