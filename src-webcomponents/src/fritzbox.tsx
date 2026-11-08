/**
 * `<iob-tr064-fritzbox>`: a tile of the FRITZ!Box like the devices widget `FritzBoxComponent` and the vis-2 widget
 * `Tr064FritzBox` - model, online state, the current down- and upload, line capacity, external IP, WLAN, guest WLAN
 * and the messages. A click shows the mesh topology in a dialog.
 *
 * The tile is drawn in four layouts at once (`row`, `small`, `medium`, `large`) and container queries show the one
 * that fits, the optional parts of a layout likewise - nothing is measured.
 */
import { Fragment, type JSX, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import type { WebComponentSettings } from '@iobroker/web-components';
import { defineWebComponent } from '@iobroker/web-components/element';

import {
    formatBitRate,
    formatByteRate,
    formatNumber,
    toBool,
    toNumber,
    toText,
    type FormattedRate,
} from '../../src-widgets/src/format';
import { Tr064Element } from './base';
import { COMPONENTS, instanceIdOf } from './constants';
import { Icon, type IconName } from './icons';
import { MESH_CSS } from './mesh/meshCss';
import { MeshPanel } from './mesh/MeshPanel';
import { Hint, textSetting, valueOf } from './ui';
import { wordOr } from './words';

interface FritzBoxSettings extends WebComponentSettings {
    instance?: string;
    boxName?: string;
    hideDetails?: boolean;
    showIp?: boolean;
    showWlan?: boolean;
    switchWlan?: boolean;
    showMessages?: boolean;
    noMesh?: boolean;
}

/** Relative IDs below `tr-064.<n>` which the tile reads */
const STATE_NAMES = [
    'info.connection',
    'states.boxModel',
    'states.boxFirmware',
    'states.wanAccessType',
    'states.wanLinkStatus',
    'states.wanProvider',
    'states.externalIP',
    'states.externalIPv6',
    'states.wanReceiveRate',
    'states.wanSendRate',
    'states.wanDownstreamMax',
    'states.wanUpstreamMax',
    'states.wlan',
    'states.wlan24',
    'states.wlan50',
    'states.wlan52',
    'states.wlan60',
    'states.wlanGuest',
    'states.abNewMessages',
    'calllists.missed.count',
    'callmonitor.ringing',
] as const;

type StateName = (typeof STATE_NAMES)[number];

/** WLAN bands in the order they are shown */
const BANDS: { state: StateName; label: string }[] = [
    { state: 'states.wlan24', label: '2.4' },
    { state: 'states.wlan50', label: '5' },
    { state: 'states.wlan52', label: '5 II' },
    { state: 'states.wlan60', label: '6' },
];

type Status = 'online' | 'offline' | 'stopped' | 'unknown';

interface BoxData {
    alive: boolean | undefined;
    online: boolean | undefined;
    model: string;
    firmware: string;
    accessType: string;
    linkStatus: string;
    provider: string;
    ip: string;
    ipv6: string;
    /** bytes per second */
    down: number | undefined;
    up: number | undefined;
    /** bits per second */
    downMax: number | undefined;
    upMax: number | undefined;
    wlan: boolean | undefined;
    bands: { label: string; on: boolean }[];
    guest: boolean | undefined;
    ab: number | undefined;
    missed: number | undefined;
    ringing: boolean | undefined;
    /** the box or the instance is gone: the rates are old */
    stale: boolean;
}

const CSS = `
${MESH_CSS}
.fb {
    position: relative;
    height: 100%;
    padding: clamp(6px, 3cqi, 14px);
    border-radius: calc(2 * var(--iob-border-radius, 4px));
    outline: none;
    line-height: 1.3;
}
.fb:focus-visible { box-shadow: inset 0 0 0 2px var(--iob-primary); }
.v { display: none; height: 100%; min-height: 0; min-width: 0; flex-direction: column; }
.v-small { display: flex; }
@container (min-width: 220px) and (min-height: 165px) {
    .fb.details .v-small { display: none; }
    .fb.details .v-medium { display: flex; }
}
@container (min-width: 320px) and (min-height: 195px) {
    .fb.details .v-medium { display: none; }
    .fb.details .v-large { display: flex; }
}
@container (min-width: 250px) and (max-height: 129.98px) {
    .fb .v-small { display: none; }
    .fb .v-row { display: flex; flex-direction: row; align-items: center; gap: 12px; }
}
.grow { flex: 1 1 auto; min-height: 0; min-width: 0; }
.title { font-weight: 600; }

.box-icon {
    position: relative;
    flex: 0 0 auto;
    aspect-ratio: 1;
    border-radius: 28%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--iob-primary) 12%, transparent);
    color: var(--iob-primary);
}
.dark .box-icon {
    background: color-mix(in srgb, var(--iob-primary) 22%, transparent);
    color: color-mix(in srgb, var(--iob-primary) 70%, white);
}
.box-icon > .icon { width: 62%; height: 62%; }
.box-icon .badge {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 30%;
    height: 30%;
    min-width: 10px;
    min-height: 10px;
    max-width: 14px;
    max-height: 14px;
    border-radius: 50%;
    border: 2px solid var(--iob-paper);
    background: var(--status);
}
.dot {
    display: inline-block;
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--status);
}
.dot.online { box-shadow: 0 0 0 3px color-mix(in srgb, var(--iob-success) 18%, transparent); }
.status { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; line-height: 1.35; }

.rate { display: flex; align-items: baseline; gap: 3px; min-width: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rate .icon { align-self: center; width: 1.15em; height: 1.15em; font-size: var(--unit); }
.rate .icon.down, .rate-label .icon.down, .bar.down { color: #0ea5e9; }
.rate .icon.up, .rate-label .icon.up, .bar.up { color: #f59e0b; }
.rate .value { font-size: var(--value); font-weight: 650; line-height: 1.1; }
.rate.secondary { color: color-mix(in srgb, currentColor 64%, transparent); }
.rate.secondary .value { font-weight: 500; }
.rate .unit { font-size: var(--unit); color: color-mix(in srgb, currentColor 64%, transparent); }

.block { min-width: 0; }
.rate-label { display: flex; align-items: center; gap: 4px; font-size: 12px; margin-bottom: 2px; }
.rate-label .icon { font-size: 15px; }
.big { display: flex; align-items: baseline; gap: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.big .value { font-weight: 650; line-height: 1.1; letter-spacing: -0.01em; font-size: clamp(20px, 9cqi, 28px); }
.v-large .big .value { font-size: clamp(22px, 7.5cqi, 34px); }
.big .unit { font-size: 12px; }
.bar { margin-top: 6px; height: 4px; border-radius: 2px; overflow: hidden; background: color-mix(in srgb, currentColor 18%, transparent); }
.bar > div { height: 100%; border-radius: 2px; background: currentColor; transition: width 0.6s ease; }
.of-max { margin-top: 3px; font-size: 11px; }
.rates { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.v-large .rates { gap: 16px; }

.chips {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    max-height: 24px;
    overflow: hidden;
}
.fb-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    color: color-mix(in srgb, currentColor 64%, transparent);
    background: color-mix(in srgb, currentColor 6%, transparent);
}
.fb-chip .icon { font-size: 15px; }
.fb-chip.on { color: var(--iob-primary); background: color-mix(in srgb, var(--iob-primary) 12%, transparent); }
.dark .fb-chip.on { color: color-mix(in srgb, var(--iob-primary) 70%, white); background: color-mix(in srgb, var(--iob-primary) 22%, transparent); }
.fb-chip.alert { color: var(--iob-error); background: color-mix(in srgb, var(--iob-error) 12%, transparent); }
.dark .fb-chip.alert { color: color-mix(in srgb, var(--iob-error) 70%, white); background: color-mix(in srgb, var(--iob-error) 22%, transparent); }
.fb-chip.off { color: color-mix(in srgb, currentColor 38%, transparent); }
.fb-chip.clickable:hover { filter: brightness(1.1); }
.fb-chip .bands { display: inline-flex; gap: 4px; margin-left: 2px; font-weight: 500; }
.fb-chip .bands .off { opacity: 0.4; text-decoration: line-through; }
.fb-chip.ring .icon { animation: tr064-ring 1.2s ease-in-out infinite; }
@keyframes tr064-ring {
    0%, 50%, 100% { transform: rotate(0deg); }
    10%, 30% { transform: rotate(-14deg); }
    20%, 40% { transform: rotate(14deg); }
}
.alerts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; min-width: 0; max-height: 52px; overflow: hidden; }
.band-list, .ring-label { display: none; }

/* small: the icon above the name only if there is room, the upload below the download likewise */
.s-head { display: none; align-items: flex-start; justify-content: space-between; gap: 8px; }
.s-head .box-icon { width: clamp(34px, 24cqi, 52px); }
.s-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.s-name .title { font-size: clamp(13px, 8.5cqi, 17px); }
.s-up, .s-mbit { display: none; }
.s-rates .rate.down { --value: clamp(17px, 12cqi, 26px); --unit: clamp(11px, 7cqi, 13px); }
.s-rates .rate.up { --value: clamp(12px, 8cqi, 15px); --unit: clamp(11px, 7cqi, 13px); }
.s-tiny { display: none; }
.s-tiny .rate.down { --value: 15px; --unit: 11px; }
.s-tiny .rate.up { --value: 12px; --unit: 11px; }
.s-tiny .unit-line { font-size: 10px; line-height: 1.3; }
@container (min-height: 104px) {
    .s-head { display: flex; }
    .s-name .dot { display: none; }
}
@container (min-height: 124px) {
    .s-up { display: flex; }
}
@container (max-height: 103.98px) and (min-height: 77px) {
    .s-up { display: flex; }
}
@container (max-width: 139.98px) {
    .s-rates { display: none; }
    .s-tiny { display: block; }
    .s-head .box-icon { width: 34px; }
    .s-head .alerts { display: none; }
    .s-name .title { font-size: 13px; }
}

/* row */
.v-row .box-icon { width: clamp(36px, 11cqi, 48px); }
.v-row .title { font-size: 15px; }
.v-row .r-rates { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; }
.v-row .rate.down { --value: 18px; --unit: 11px; }
.v-row .rate.up { --value: 13px; --unit: 11px; }
.v-row .alerts { display: none; }
@container (min-width: 420px) {
    .v-row .alerts { display: flex; }
}

/* medium and large */
.head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.v-medium { gap: 10px; }
.v-medium .box-icon { width: 40px; }
.v-medium .title { font-size: 15px; }
.v-large { gap: 10px; }
.v-large .head { gap: 12px; }
.v-large .box-icon { width: 46px; }
.v-large .title { font-size: 17px; }
.v-large .sub { font-size: 12px; line-height: 1.35; }
.v-large .band-list { display: inline-flex; }
.connection { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
.connection .icon { font-size: 16px; }
.info {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 2px;
    align-items: baseline;
    font-size: 12px;
    line-height: 1.4;
}
.info .value { text-align: right; font-variant-numeric: tabular-nums; }
.info .ip1, .info .ip2, .v-large .bars { display: none; }
@container (min-height: 223px) {
    .info .ip1 { display: block; }
}
@container (min-height: 241px) {
    .info .ip2 { display: block; }
}
@container (min-height: 267px) {
    .v-large .bars { display: block; }
}
@container (min-height: 297px) {
    .v-large .chips { max-height: 54px; }
    .v-large .ring-label { display: inline; }
}
`;

function fritzOsVersion(firmware: string): string {
    const match = firmware.match(/^\d+\.(\d+)\.(\d+)/);
    return match ? `${parseInt(match[1], 10)}.${match[2]}` : firmware;
}

function statusOf(data: BoxData): Status {
    if (data.alive === false) {
        return 'stopped';
    }
    if (data.online === true) {
        return 'online';
    }
    return data.online === false ? 'offline' : 'unknown';
}

const STATUS_COLORS: Record<Status, string> = {
    online: 'var(--iob-success)',
    offline: 'var(--iob-error)',
    stopped: 'var(--iob-warning)',
    unknown: 'color-mix(in srgb, currentColor 38%, transparent)',
};

const STATUS_WORDS: Record<Exclude<Status, 'unknown'>, string> = {
    online: 'vis_online',
    offline: 'vis_offline',
    stopped: 'vis_stopped',
};

/** The mesh dialog starts with the defaults of the mesh widget */
const MESH_DEFAULTS = { view: 'graph', onlyConfigured: false, showDisconnected: false, showVendor: true } as const;

/** The colors of the status as the variable `--status` */
function statusStyle(status: Status): Record<string, string> {
    return { '--status': STATUS_COLORS[status] };
}

/** A chip of the tile: symbol, label and the tone of what it says, `ring` for an incoming call */
function chip(options: {
    key: string;
    icon: IconName;
    label?: string;
    tone: 'on' | 'off' | 'alert' | 'neutral';
    title: string;
    onClick?: (e: MouseEvent) => void;
    extra?: ReactNode;
    ring?: boolean;
}): JSX.Element {
    const classes = ['fb-chip', options.tone];
    if (options.onClick) {
        classes.push('clickable');
    }
    if (options.ring) {
        classes.push('ring');
    }
    return (
        <span
            key={options.key}
            className={classes.join(' ')}
            title={options.title}
            onClick={options.onClick}
        >
            <Icon name={options.icon} />
            {options.label ? <span>{options.label}</span> : null}
            {options.extra}
        </span>
    );
}

class Tr064FritzBox extends Tr064Element<FritzBoxSettings> {
    constructor() {
        super(CSS);
    }

    protected override getStateIds(settings: FritzBoxSettings): string[] {
        const instanceId = instanceIdOf(settings.instance);
        return instanceId
            ? [`system.adapter.${instanceId}.alive`, ...STATE_NAMES.map(name => `${instanceId}.${name}`)]
            : [];
    }

    get #instanceId(): string | null {
        return instanceIdOf(this.settings.instance);
    }

    #val(name: StateName): ioBroker.StateValue | undefined {
        return valueOf(this.states, `${this.#instanceId}.${name}`);
    }

    #readData(): BoxData {
        const alive = toBool(valueOf(this.states, `system.adapter.${this.#instanceId}.alive`));
        const online = toBool(this.#val('info.connection'));
        const bands: BoxData['bands'] = [];
        for (const band of BANDS) {
            const on = toBool(this.#val(band.state));
            if (on !== undefined) {
                bands.push({ label: band.label, on });
            }
        }
        return {
            alive,
            online,
            model: toText(this.#val('states.boxModel')),
            firmware: toText(this.#val('states.boxFirmware')),
            accessType: toText(this.#val('states.wanAccessType')),
            linkStatus: toText(this.#val('states.wanLinkStatus')),
            provider: toText(this.#val('states.wanProvider')),
            ip: toText(this.#val('states.externalIP')),
            ipv6: toText(this.#val('states.externalIPv6')),
            down: toNumber(this.#val('states.wanReceiveRate')),
            up: toNumber(this.#val('states.wanSendRate')),
            downMax: toNumber(this.#val('states.wanDownstreamMax')),
            upMax: toNumber(this.#val('states.wanUpstreamMax')),
            wlan: toBool(this.#val('states.wlan')),
            bands,
            guest: toBool(this.#val('states.wlanGuest')),
            ab: toNumber(this.#val('states.abNewMessages')),
            missed: toNumber(this.#val('calllists.missed.count')),
            ringing: toBool(this.#val('callmonitor.ringing')),
            stale: online === false || alive === false,
        };
    }

    #title(data: BoxData): string {
        return textSetting(this.settings.boxName) || data.model || 'FRITZ!Box';
    }

    /** `DSL · Up · Telekom` - the parts which exist, translated where there is a word */
    #connectionText(data: BoxData, withProvider: boolean): string {
        const lang = this.systemLang;
        const parts: string[] = [];
        if (data.accessType) {
            parts.push(wordOr(lang, `vis_access_${data.accessType}`, data.accessType));
        }
        if (data.linkStatus) {
            parts.push(wordOr(lang, `vis_link_${data.linkStatus}`, data.linkStatus));
        }
        if (withProvider && data.provider) {
            parts.push(data.provider);
        }
        return parts.join(' · ');
    }

    #rate(bytesPerSecond: number, data: BoxData, mbitOnly = false): FormattedRate {
        if (data.stale) {
            return { value: '–', unit: mbitOnly ? '' : 'Mbit/s' };
        }
        const lang = this.systemLang;
        if (!mbitOnly) {
            return formatByteRate(bytesPerSecond, lang);
        }
        const mbit = Math.max(0, bytesPerSecond * 8) / 1e6;
        const digits = mbit >= 100 ? 0 : mbit >= 1 || mbit === 0 ? 1 : 2;
        return { value: formatNumber(mbit, digits, lang), unit: '' };
    }

    // ---- actions ------------------------------------------------------------

    get #clickable(): boolean {
        return !this.editMode && !this.settings.noMesh && !!this.#instanceId;
    }

    readonly #openMesh = (): void => {
        const instanceId = this.#instanceId;
        if (!this.#clickable || !instanceId) {
            return;
        }
        void this.showElementDialog(this.t('fritzdm_meshTitle'), 1000, {
            css: MESH_CSS,
            draw: () => (
                <MeshPanel
                    socket={this.socket}
                    instanceId={instanceId}
                    interval={30}
                    t={this.t}
                    disabled={false}
                    initial={MESH_DEFAULTS}
                    inDialog
                />
            ),
        });
    };

    readonly #onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.#openMesh();
        }
    };

    /** A WLAN chip switches the WLAN, if the settings allow it */
    #toggle(name: StateName, value: boolean | undefined, e: MouseEvent): void {
        e.stopPropagation();
        if (!this.editMode && this.settings.switchWlan && value !== undefined) {
            void this.setState(`${this.#instanceId}.${name}`, !value);
        }
    }

    /**
     * The chip of the missed calls asks whether the counter is reset. It is the own counter of the adapter, not a
     * value of the box
     */
    readonly #askReset = async (e: MouseEvent, missed: number): Promise<void> => {
        e.stopPropagation();
        if (this.editMode) {
            return;
        }
        const t = this.t;
        const result = await this.openDialog({
            title: t('vis_reset_missed_title'),
            width: 420,
            form: {
                type: 'panel',
                items: { text: { type: 'staticText', text: t('vis_reset_missed_text', missed) } },
            },
            ok: t('vis_reset'),
            cancel: t('vis_cancel'),
        });
        if (result) {
            await this.setState(`${this.#instanceId}.calllists.missed.count`, 0);
        }
    };

    // ---- parts --------------------------------------------------------------

    static #boxIcon(status: Status, withBadge: boolean): JSX.Element {
        return (
            <span
                className="box-icon"
                style={statusStyle(status)}
            >
                <Icon name="Router" />
                {withBadge ? <span className="badge" /> : null}
            </span>
        );
    }

    static #dot(status: Status): JSX.Element {
        return (
            <span
                className={`dot ${status}`}
                style={statusStyle(status)}
            />
        );
    }

    #statusText(status: Status, extra: string): JSX.Element {
        const label = status === 'unknown' ? '…' : this.t(STATUS_WORDS[status]);
        return (
            <div className="status muted">
                {Tr064FritzBox.#dot(status)}
                <span className="ellipsis">{extra ? `${label} · ${extra}` : label}</span>
            </div>
        );
    }

    static #rateInline(direction: 'down' | 'up', rate: FormattedRate, secondary = false): JSX.Element {
        return (
            <div className={`rate ${direction}${secondary ? ' secondary' : ''}`}>
                <Icon
                    name={direction === 'down' ? 'ArrowDownward' : 'ArrowUpward'}
                    className={direction}
                />
                <span className="value">{rate.value}</span>
                {rate.unit ? <span className="unit">{rate.unit}</span> : null}
            </div>
        );
    }

    /** One direction with label, big value and - if the maximum is known - a thin usage bar */
    #rateBlock(direction: 'down' | 'up', data: BoxData): JSX.Element | null {
        const value = direction === 'down' ? data.down : data.up;
        const max = direction === 'down' ? data.downMax : data.upMax;
        if (value === undefined) {
            return null;
        }
        const rate = this.#rate(value, data);
        const usage = max && !data.stale ? Math.min(1, Math.max(0, (value * 8) / max)) : undefined;
        const maxRate = max ? formatBitRate(max, this.systemLang) : null;
        return (
            <div className="block">
                <div className="rate-label muted">
                    <Icon
                        name={direction === 'down' ? 'ArrowDownward' : 'ArrowUpward'}
                        className={direction}
                    />
                    <span className="ellipsis">{this.t(direction === 'down' ? 'vis_download' : 'vis_upload')}</span>
                </div>
                <div className="big">
                    <span className="value">{rate.value}</span>
                    <span className="unit muted">{rate.unit}</span>
                </div>
                {usage !== undefined && maxRate ? (
                    <div className="bars">
                        <div className={`bar ${direction}`}>
                            <div style={{ width: `${Math.max(usage * 100, usage > 0 ? 2 : 0)}%` }} />
                        </div>
                        <div className="of-max muted ellipsis">
                            {this.t('vis_of_max', `${maxRate.value} ${maxRate.unit}`)}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    /** The message chips: an incoming call, new messages, missed calls (only those which are not 0 if `onlyAlerts`) */
    #messageChips(data: BoxData, onlyAlerts: boolean): [number, JSX.Element][] {
        const t = this.t;
        const list: [number, JSX.Element][] = [];
        if (this.settings.showMessages === false) {
            return list;
        }
        if (data.ringing) {
            list.push([
                0,
                chip({
                    key: 'ringing',
                    icon: 'PhoneInTalk',
                    tone: 'alert',
                    ring: true,
                    title: t('vis_ringing'),
                    extra: onlyAlerts ? undefined : <span className="ring-label">{t('vis_ringing')}</span>,
                }),
            ]);
        }
        if (data.ab !== undefined && (data.ab > 0 || !onlyAlerts)) {
            list.push([
                data.ab > 0 ? 1 : 5,
                chip({
                    key: 'ab',
                    icon: 'Voicemail',
                    label: String(data.ab),
                    tone: data.ab > 0 ? 'alert' : 'neutral',
                    title: `${t('vis_ab_messages')}: ${data.ab}`,
                }),
            ]);
        }
        const missed = data.missed;
        if (missed !== undefined && (missed > 0 || !onlyAlerts)) {
            const canReset = missed > 0 && !this.editMode;
            list.push([
                missed > 0 ? 2 : 6,
                chip({
                    key: 'missed',
                    icon: 'PhoneMissed',
                    label: String(missed),
                    tone: missed > 0 ? 'alert' : 'neutral',
                    title: missed
                        ? `${t('vis_missed_calls')}: ${missed}\n${t('vis_reset_hint')}`
                        : `${t('vis_missed_calls')}: ${missed}`,
                    onClick: canReset ? e => void this.#askReset(e, missed) : undefined,
                }),
            ]);
        }
        return list;
    }

    /** WLAN, guest WLAN and the messages; the chips which do not fit wrap into a hidden row, the alerts first */
    #chips(data: BoxData): JSX.Element | null {
        const t = this.t;
        const list = this.#messageChips(data, false);
        const switchable = !!this.settings.switchWlan && !this.editMode;
        if (this.settings.showWlan !== false) {
            // the WLAN button of the box, or at least one band switched on
            const wlan = data.wlan ?? (data.bands.length ? data.bands.some(band => band.on) : undefined);
            if (wlan !== undefined) {
                list.push([
                    3,
                    chip({
                        key: 'wlan',
                        icon: wlan ? 'Wifi' : 'WifiOff',
                        label: t('vis_wlan'),
                        tone: wlan ? 'on' : 'off',
                        title: `${t('vis_wlan')}: ${t(wlan ? 'vis_on' : 'vis_off')}`,
                        onClick:
                            switchable && data.wlan !== undefined
                                ? e => this.#toggle('states.wlan', data.wlan, e)
                                : undefined,
                        extra:
                            data.bands.length > 1 ? (
                                <span className="bands band-list">
                                    {data.bands.map(band => (
                                        <span
                                            key={band.label}
                                            className={band.on && wlan ? undefined : 'off'}
                                            title={`${band.label} GHz: ${t(band.on ? 'vis_on' : 'vis_off')}`}
                                        >
                                            {band.label}
                                        </span>
                                    ))}
                                </span>
                            ) : undefined,
                    }),
                ]);
            }
            if (data.guest !== undefined) {
                list.push([
                    4,
                    chip({
                        key: 'guest',
                        icon: data.guest ? 'Wifi' : 'WifiOff',
                        label: t('vis_guest'),
                        tone: data.guest ? 'on' : 'off',
                        title: `${t('vis_guest_wlan')}: ${t(data.guest ? 'vis_on' : 'vis_off')}`,
                        onClick: switchable ? e => this.#toggle('states.wlanGuest', data.guest, e) : undefined,
                    }),
                ]);
            }
        }
        if (!list.length) {
            return null;
        }
        list.sort((a, b) => a[0] - b[0]);
        return <div className="chips">{list.map(item => item[1])}</div>;
    }

    #alerts(data: BoxData): JSX.Element | null {
        if (this.settings.hideDetails) {
            return null;
        }
        const list = this.#messageChips(data, true);
        return list.length ? <div className="alerts">{list.map(item => item[1])}</div> : null;
    }

    #small(data: BoxData, status: Status): JSX.Element {
        let rates: JSX.Element;
        if (data.down === undefined) {
            rates = this.#statusText(status, this.#connectionText(data, false));
        } else {
            const up = data.up;
            rates = (
                <>
                    <div className="s-rates">
                        {Tr064FritzBox.#rateInline('down', this.#rate(data.down, data))}
                        {up !== undefined ? (
                            <div className="s-up">{Tr064FritzBox.#rateInline('up', this.#rate(up, data), true)}</div>
                        ) : null}
                    </div>
                    {/* narrower than 140 px: both in Mbit/s, the unit once below them */}
                    <div className="s-tiny">
                        {Tr064FritzBox.#rateInline('down', this.#rate(data.down, data, true))}
                        {up !== undefined ? (
                            <div className="s-up">
                                {Tr064FritzBox.#rateInline('up', this.#rate(up, data, true), true)}
                            </div>
                        ) : null}
                        {data.stale ? null : <div className="unit-line muted">Mbit/s</div>}
                    </div>
                </>
            );
        }
        return (
            <div className="v v-small">
                <div className="s-head">
                    {Tr064FritzBox.#boxIcon(status, true)}
                    {this.#alerts(data)}
                </div>
                <div className="grow" />
                <div className="s-name">
                    {Tr064FritzBox.#dot(status)}
                    <div className="title ellipsis">{this.#title(data)}</div>
                </div>
                {rates}
            </div>
        );
    }

    #row(data: BoxData, status: Status): JSX.Element {
        return (
            <div className="v v-row">
                {Tr064FritzBox.#boxIcon(status, false)}
                <div className="grow">
                    <div className="title ellipsis">{this.#title(data)}</div>
                    {this.#statusText(status, this.#connectionText(data, false))}
                </div>
                {data.down !== undefined ? (
                    <div className="r-rates">
                        {Tr064FritzBox.#rateInline('down', this.#rate(data.down, data))}
                        {data.up !== undefined
                            ? Tr064FritzBox.#rateInline('up', this.#rate(data.up, data), true)
                            : null}
                    </div>
                ) : null}
                {this.#alerts(data)}
            </div>
        );
    }

    #medium(data: BoxData, status: Status): JSX.Element {
        return (
            <div className="v v-medium">
                <div className="head">
                    {Tr064FritzBox.#boxIcon(status, false)}
                    <div className="grow">
                        <div className="title ellipsis">{this.#title(data)}</div>
                        {this.#statusText(status, this.#connectionText(data, false))}
                    </div>
                </div>
                <div className="grow" />
                {data.down !== undefined || data.up !== undefined ? (
                    <div className="rates">
                        {this.#rateBlock('down', data)}
                        {this.#rateBlock('up', data)}
                    </div>
                ) : null}
                {this.#chips(data)}
            </div>
        );
    }

    #info(data: BoxData): JSX.Element | null {
        if (this.settings.showIp === false || (!data.ip && !data.ipv6)) {
            return null;
        }
        const rows: { label: string; value: string }[] = [];
        if (data.ip) {
            rows.push({ label: this.t('vis_external_ip'), value: data.ip });
        }
        if (data.ipv6) {
            rows.push({ label: 'IPv6', value: data.ipv6 });
        }
        // the first row needs 28 px, the second 18 px more: container queries show them, see `CSS`
        return (
            <div className="info">
                {rows.map((row, i) => (
                    <Fragment key={row.label}>
                        <span className={`ip${i + 1} muted`}>{row.label}</span>
                        <span
                            className={`ip${i + 1} value ellipsis`}
                            title={row.value}
                        >
                            {row.value}
                        </span>
                    </Fragment>
                ))}
            </div>
        );
    }

    #large(data: BoxData, status: Status): JSX.Element {
        const title = this.#title(data);
        const subtitle = [
            title !== data.model ? data.model : '',
            data.firmware ? `FRITZ!OS ${fritzOsVersion(data.firmware)}` : '',
        ]
            .filter(Boolean)
            .join(' · ');
        const connection = this.#connectionText(data, true);
        return (
            <div className="v v-large">
                <div className="head">
                    {Tr064FritzBox.#boxIcon(status, false)}
                    <div className="grow">
                        <div className="title ellipsis">{title}</div>
                        {subtitle ? <div className="sub muted ellipsis">{subtitle}</div> : null}
                    </div>
                    {this.#statusText(status, '')}
                </div>
                {connection ? (
                    <div className="connection muted">
                        <Icon name="Public" />
                        <span className="ellipsis">{connection}</span>
                    </div>
                ) : null}
                {data.down !== undefined || data.up !== undefined ? (
                    <div className="rates">
                        {this.#rateBlock('down', data)}
                        {this.#rateBlock('up', data)}
                    </div>
                ) : null}
                {this.#info(data)}
                <div className="grow" />
                {this.#chips(data)}
            </div>
        );
    }

    protected draw(): ReactNode {
        if (!this.#instanceId) {
            return (
                <Hint
                    icon="Router"
                    text={this.t('wc_chooseInstance')}
                />
            );
        }
        const data = this.#readData();
        const status = statusOf(data);
        const details = !this.settings.hideDetails;
        const clickable = this.#clickable;
        return (
            <div
                className={`fb${details ? ' details' : ''}${clickable ? ' clickable' : ''}`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `${this.#title(data)} – Mesh` : undefined}
                onClick={clickable ? this.#openMesh : undefined}
                onKeyDown={clickable ? this.#onKeyDown : undefined}
            >
                {this.#row(data, status)}
                {this.#small(data, status)}
                {details ? this.#medium(data, status) : null}
                {details ? this.#large(data, status) : null}
            </div>
        );
    }
}

defineWebComponent(COMPONENTS.fritzbox.tag, Tr064FritzBox);
