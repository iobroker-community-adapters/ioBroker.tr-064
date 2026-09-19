import React from 'react';

import { alpha, Box, type Theme } from '@mui/material';
import {
    ArrowDownward as IconDown,
    ArrowUpward as IconUp,
    PhoneInTalk as IconRinging,
    PhoneMissed as IconMissed,
    Public as IconInternet,
    Router as IconRouter,
    Voicemail as IconVoicemail,
    Wifi as IconWifi,
    WifiOff as IconWifiOff,
} from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic, { faint, muted, StateWatcher, type StateValues } from './Generic';
import MeshDialog from './MeshDialog';
import { type FormattedRate, formatBitRate, formatByteRate, formatNumber, toBool, toNumber, toText } from './format';

/** Colors of the two directions, the same in light and dark */
const COLOR_DOWN = '#0ea5e9';
const COLOR_UP = '#f59e0b';

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

/** WLAN bands in the order they are shown, with the state which switches them */
const BANDS: { state: StateName; label: string }[] = [
    { state: 'states.wlan24', label: '2.4' },
    { state: 'states.wlan50', label: '5' },
    { state: 'states.wlan52', label: '5 II' },
    { state: 'states.wlan60', label: '6' },
];

/**
 * Layout by the size of the widget:
 * - `row`: wide and flat - icon, name and status, rates side by side
 * - `small`: a small square - icon, name, online and the rate
 * - `medium`: in addition the connection, both rates and the chips
 * - `large`: everything - line capacity, external IP, WLAN bands, firmware
 */
type TileMode = 'row' | 'small' | 'medium' | 'large';

/** The mode and the optional parts which fit into the height of the widget */
interface TileLayout {
    mode: TileMode;
    /** small: the icon above the name */
    icon: boolean;
    /** small: the upload rate below the download rate */
    upLine: boolean;
    /** large: rows of the external IP addresses, 0 - 2 */
    infoRows: number;
    /** large: usage bars with the maximum of the line */
    bars: boolean;
    /** row: the message counters next to the rates */
    alerts: boolean;
    /** small: narrower than 140 px - both rates in Mbit/s and the unit once below them */
    tiny: boolean;
    /** medium, large: rows of chips; chips which do not fit are hidden, the alerts come first */
    chipRows: number;
    /** padding of the tile in px */
    pad: number;
}

interface Tr064FritzBoxRxData {
    instance: string;
    /** shown instead of the model; not `name`, that is the name of the widget in the vis-2 editor */
    boxName: string;
    noCard: boolean;
    hideDetails: boolean;
    showIp: boolean;
    showWlan: boolean;
    showMessages: boolean;
    switchWlan: boolean;
    noMesh: boolean;
}

interface Tr064FritzBoxState extends VisRxWidgetState {
    /** Values of the states, by full ID */
    fb: StateValues;
    /** Size of the widget, measured */
    size: { width: number; height: number };
    dialogOpen: boolean;
}

/** Everything the tile shows, read from the states */
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
    /** B/s */
    down: number | undefined;
    up: number | undefined;
    /** bit/s */
    downMax: number | undefined;
    upMax: number | undefined;
    wlan: boolean | undefined;
    bands: { label: string; on: boolean; id: string }[];
    guest: boolean | undefined;
    ab: number | undefined;
    missed: number | undefined;
    ringing: boolean | undefined;
    /** The box or the instance is offline: the rates are the last ones and not shown */
    stale: boolean;
}

/**
 * `154.08.00` -> `8.00`: the FRITZ!OS version is the part after the hardware number
 *
 * @param firmware `NewSoftwareVersion` of the box
 */
function fritzOsVersion(firmware: string): string {
    const match = firmware.match(/^\d+\.(\d+)\.(\d+)/);
    return match ? `${parseInt(match[1], 10)}.${match[2]}` : firmware;
}

function tileSx(
    theme: Theme,
    noCard: boolean,
    offline: boolean,
    clickable: boolean,
    pad: number,
): Record<string, unknown> {
    const base: Record<string, unknown> = {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        color: theme.palette.text.primary,
        fontFamily: theme.typography.fontFamily,
        cursor: clickable ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
        '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${theme.palette.primary.main}` },
    };
    if (noCard) {
        return { ...base, padding: `${pad}px` };
    }

    const isDark = theme.palette.mode === 'dark';
    const white = theme.palette.common.white;
    const black = theme.palette.common.black;
    const error = theme.palette.error.main;
    const layers = [
        // lit top-left corner falling off into the bottom right, like the tiles of ioBroker.devices
        `linear-gradient(to bottom right, ${alpha(white, isDark ? 0.07 : 0.55)}, transparent 55%)`,
        offline ? `linear-gradient(to bottom right, ${alpha(error, isDark ? 0.16 : 0.08)}, transparent 65%)` : '',
        `linear-gradient(to bottom right, transparent 45%, ${alpha(black, isDark ? 0.28 : 0.04)})`,
        theme.palette.background.paper,
    ].filter(Boolean);

    return {
        ...base,
        padding: `${pad}px`,
        borderRadius: '16px',
        background: layers.join(', '),
        border: `1px solid ${offline ? alpha(error, 0.4) : alpha(isDark ? white : black, isDark ? 0.09 : 0.09)}`,
        boxShadow: isDark
            ? `inset 0 1px 0 ${alpha(white, 0.06)}, inset 0 -20px 34px -26px ${alpha(black, 0.6)}`
            : `0 1px 3px ${alpha(black, 0.08)}`,
        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s',
        ...(clickable
            ? {
                  '&:active': { transform: 'scale(0.98)' },
                  '&:focus-visible': {
                      boxShadow: `inset 0 0 0 2px ${theme.palette.primary.main}`,
                  },
              }
            : {}),
    };
}

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/**
 * A rate for the tile: `–` while the box is offline (the states keep the last values)
 *
 * @param bytesPerSecond value of `wanReceiveRate`/`wanSendRate`
 * @param data the data of the tile
 * @param mbitOnly always in Mbit/s, for the tiny tile which shows the unit only once
 */
function rateOf(bytesPerSecond: number, data: BoxData, mbitOnly?: boolean): FormattedRate {
    const lang = Generic.getLanguage();
    if (data.stale) {
        return { value: '–', unit: mbitOnly ? '' : 'Mbit/s' };
    }
    if (!mbitOnly) {
        return formatByteRate(bytesPerSecond, lang);
    }
    const mbit = Math.max(0, bytesPerSecond * 8) / 1e6;
    const digits = mbit >= 100 ? 0 : mbit >= 1 || mbit === 0 ? 1 : 2;
    return { value: formatNumber(mbit, digits, lang), unit: 'Mbit/s' };
}

export default class Tr064FritzBox extends Generic<Tr064FritzBoxRxData, Tr064FritzBoxState> {
    private watcher: StateWatcher | null = null;

    private observer: ResizeObserver | null = null;

    private rootElement: HTMLDivElement | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            fb: {},
            size: { width: 0, height: 0 },
            dialogOpen: false,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplTr064FritzBox',
            visSet: 'tr-064',
            visSetLabel: 'set_label',
            visSetColor: '#e2001a',
            visName: 'FRITZ!Box',
            visWidgetLabel: 'fritzbox',
            visHelp: 'fritzbox_help',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'instance',
                            type: 'instance',
                            adapter: 'tr-064',
                            default: 'tr-064.0',
                            label: 'instance',
                        },
                        { name: 'boxName', type: 'text', label: 'name', tooltip: 'name_tooltip' },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                    ],
                },
                {
                    name: 'parts',
                    label: 'parts',
                    fields: [
                        {
                            name: 'hideDetails',
                            type: 'checkbox',
                            default: false,
                            label: 'hide_details',
                            tooltip: 'hide_details_tooltip',
                        },
                        {
                            name: 'showIp',
                            type: 'checkbox',
                            default: true,
                            label: 'show_ip',
                            hidden: '!!data.hideDetails',
                        },
                        {
                            name: 'showWlan',
                            type: 'checkbox',
                            default: true,
                            label: 'show_wlan',
                            hidden: '!!data.hideDetails',
                        },
                        {
                            name: 'switchWlan',
                            type: 'checkbox',
                            default: false,
                            label: 'switch_wlan',
                            tooltip: 'switch_wlan_tooltip',
                            hidden: '!!data.hideDetails || data.showWlan === false',
                        },
                        {
                            name: 'showMessages',
                            type: 'checkbox',
                            default: true,
                            label: 'show_messages',
                            tooltip: 'show_messages_tooltip',
                            hidden: '!!data.hideDetails',
                        },
                        {
                            name: 'noMesh',
                            type: 'checkbox',
                            default: false,
                            label: 'no_mesh',
                            tooltip: 'no_mesh_tooltip',
                        },
                    ],
                },
            ],
            visDefaultStyle: { width: 360, height: 280, position: 'relative' },
            visPrev: 'widgets/tr-064/img/prev_tr064_fritzbox.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return Tr064FritzBox.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.watcher = new StateWatcher(this.getWatchSocket(), fb => this.setState({ fb }));
        this.watcher.watch(this.getStateIds());
    }

    componentWillUnmount(): void {
        this.watcher?.stop();
        this.watcher = null;
        this.observer?.disconnect();
        this.observer = null;
        super.componentWillUnmount();
    }

    onRxDataChanged(prevRxData: Tr064FritzBoxRxData): void {
        if (prevRxData.instance !== this.state.rxData.instance) {
            this.watcher?.watch(this.getStateIds());
            this.setState({ dialogOpen: false });
        }
    }

    private getStateIds(): string[] {
        const instanceId = this.getInstanceId();
        return [`system.adapter.${instanceId}.alive`, ...STATE_NAMES.map(name => `${instanceId}.${name}`)];
    }

    /** Callback ref of the root element: measures the widget, also when the element is replaced */
    private setRoot = (element: HTMLDivElement | null): void => {
        if (element === this.rootElement) {
            return;
        }
        this.observer?.disconnect();
        this.observer = null;
        this.rootElement = element;
        if (!element) {
            return;
        }
        const measure = (width: number, height: number): void => {
            const size = { width: Math.round(width), height: Math.round(height) };
            if (size.width !== this.state.size.width || size.height !== this.state.size.height) {
                this.setState({ size });
            }
        };
        const rect = element.getBoundingClientRect();
        measure(rect.width, rect.height);
        if (typeof ResizeObserver !== 'undefined') {
            this.observer = new ResizeObserver(entries => {
                const box = entries[0]?.borderBoxSize?.[0];
                if (box) {
                    measure(box.inlineSize, box.blockSize);
                } else if (entries[0]) {
                    measure(entries[0].contentRect.width, entries[0].contentRect.height);
                }
            });
            this.observer.observe(element);
        }
    };

    /** A height in the style of the widget: otherwise the widget grows with its content and only the width counts */
    private hasFixedHeight(): boolean {
        const height = this.state.rxStyle?.height;
        return height !== undefined && height !== null && height !== '' && height !== 'auto';
    }

    /**
     * The layout by the measured size. With a fixed height the optional parts are dropped by
     * priority until the rest fits (external IP before the usage bars); a widget without height
     * grows with its content, then only the width counts.
     */
    private getLayout(noCard: boolean): TileLayout {
        let { width, height } = this.state.size;
        if (!width) {
            // not measured yet: the size of the style, if it is given in pixels
            width = parseInt(String(this.state.rxStyle?.width ?? ''), 10) || 300;
            height = parseInt(String(this.state.rxStyle?.height ?? ''), 10) || 220;
        }
        const fixedHeight = this.hasFixedHeight();
        const tiny = width < 140;
        // the padding grows with the width, a tiny tile needs every pixel
        const pad = Math.round(noCard ? Math.max(6, 0.03 * width) : tiny ? 8 : Math.max(12, 0.05 * width));
        // padding of the root (4 px), of the tile and its border, top and bottom
        const frame = noCard ? 2 * pad : 10 + 2 * pad;
        const content = fixedHeight ? height - frame : Infinity;
        const layout: TileLayout = {
            mode: 'large',
            icon: true,
            upLine: true,
            infoRows: 2,
            bars: true,
            alerts: true,
            tiny,
            pad,
            chipRows: 2,
        };

        if (fixedHeight && height < 130 && width >= 250) {
            layout.mode = 'row';
            layout.alerts = width >= 420;
        } else if (this.state.rxData.hideDetails || width < 220 || content < 150) {
            layout.mode = 'small';
            if (tiny) {
                // name 17, download 19, upload 16, unit 13, icon 40 px
                layout.icon = content >= 90;
                layout.upLine = content >= (layout.icon ? 105 : 65);
            } else {
                layout.icon = content >= 92;
                layout.upLine = content >= 112;
            }
        } else {
            // header, connection, gaps and chips need 130 px, the rates 19 px + their value (font
            // size `clamp(22px, 7.5cqi, 34px)`), one row of the IP 28, two rows 46, the bars 26
            const rates = 19 + 1.1 * Math.min(34, Math.max(22, 0.075 * (width - 8)));
            const base = 130 + rates;
            if (width < 320 || content < base) {
                layout.mode = 'medium';
                layout.chipRows = 1;
            } else {
                layout.infoRows = content >= base + 46 ? 2 : content >= base + 28 ? 1 : 0;
                const withInfo = base + [0, 28, 46][layout.infoRows];
                layout.bars = content >= withInfo + 26;
                // without a height the chips wrap as they need
                layout.chipRows = !fixedHeight ? Infinity : content >= withInfo + (layout.bars ? 26 : 0) + 30 ? 2 : 1;
            }
        }
        return layout;
    }

    private readData(): BoxData {
        const instanceId = this.getInstanceId();
        const fb = this.state.fb;
        const val = (name: StateName): ioBroker.StateValue | undefined => fb[`${instanceId}.${name}`];

        const bands: BoxData['bands'] = [];
        for (const band of BANDS) {
            const on = toBool(val(band.state));
            if (on !== undefined) {
                bands.push({ label: band.label, on, id: `${instanceId}.${band.state}` });
            }
        }

        return {
            alive: toBool(fb[`system.adapter.${instanceId}.alive`]),
            online: toBool(val('info.connection')),
            model: toText(val('states.boxModel')),
            firmware: toText(val('states.boxFirmware')),
            accessType: toText(val('states.wanAccessType')),
            linkStatus: toText(val('states.wanLinkStatus')),
            provider: toText(val('states.wanProvider')),
            ip: toText(val('states.externalIP')),
            ipv6: toText(val('states.externalIPv6')),
            down: toNumber(val('states.wanReceiveRate')),
            up: toNumber(val('states.wanSendRate')),
            downMax: toNumber(val('states.wanDownstreamMax')),
            upMax: toNumber(val('states.wanUpstreamMax')),
            wlan: toBool(val('states.wlan')),
            bands,
            guest: toBool(val('states.wlanGuest')),
            ab: toNumber(val('states.abNewMessages')),
            missed: toNumber(val('calllists.missed.count')),
            ringing: toBool(val('callmonitor.ringing')),
            stale:
                toBool(val('info.connection')) === false || toBool(fb[`system.adapter.${instanceId}.alive`]) === false,
        };
    }

    // ---- texts --------------------------------------------------------------

    private getTitle(data: BoxData): string {
        return String(this.state.rxData.boxName || '').trim() || data.model || 'FRITZ!Box';
    }

    /** `online`, `offline`, `stopped` or `unknown` */
    private static getStatus(data: BoxData): 'online' | 'offline' | 'stopped' | 'unknown' {
        if (data.alive === false) {
            return 'stopped';
        }
        if (data.online === true) {
            return 'online';
        }
        if (data.online === false) {
            return 'offline';
        }
        return 'unknown';
    }

    private static getStatusColor(theme: Theme, status: ReturnType<typeof Tr064FritzBox.getStatus>): string {
        switch (status) {
            case 'online':
                return theme.palette.success.main;
            case 'offline':
                return theme.palette.error.main;
            case 'stopped':
                return theme.palette.warning.main;
            default:
                return faint(theme);
        }
    }

    private static translateOr(key: string, fallback: string): string {
        const text = Generic.t(key);
        return text && text !== `${Generic.getI18nPrefix()}${key}` && text !== key ? text : fallback;
    }

    /** `DSL · connected · Telekom` - the parts which exist */
    private static getConnectionText(data: BoxData, withProvider: boolean): string {
        const parts: string[] = [];
        if (data.accessType) {
            parts.push(Tr064FritzBox.translateOr(`access_${data.accessType}`, data.accessType));
        }
        if (data.linkStatus) {
            parts.push(Tr064FritzBox.translateOr(`link_${data.linkStatus}`, data.linkStatus));
        }
        if (withProvider && data.provider) {
            parts.push(data.provider);
        }
        return parts.join(' · ');
    }

    // ---- actions ------------------------------------------------------------

    private isClickable(): boolean {
        return !this.state.editMode && !this.state.rxData.noMesh;
    }

    private openDialog = (): void => {
        if (this.isClickable()) {
            this.setState({ dialogOpen: true });
        }
    };

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.openDialog();
        }
    };

    /** A WLAN chip switches the WLAN, if that is enabled */
    private canSwitchWlan(): boolean {
        return !this.state.editMode && !!this.state.rxData.switchWlan;
    }

    private toggle(id: string, value: boolean | undefined, e: React.MouseEvent): void {
        if (!this.canSwitchWlan() || value === undefined) {
            return;
        }
        e.stopPropagation();
        this.props.context.setValue(id, !value);
    }

    // ---- render parts -------------------------------------------------------

    private static renderIcon(
        size: string,
        status: ReturnType<typeof Tr064FritzBox.getStatus>,
        withDot: boolean,
    ): React.JSX.Element {
        return (
            <Box
                sx={theme => ({
                    position: 'relative',
                    flex: '0 0 auto',
                    width: size,
                    height: size,
                    borderRadius: '28%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.12),
                    color: theme.palette.mode === 'dark' ? theme.palette.primary.light : theme.palette.primary.main,
                    '& .MuiSvgIcon-root': { width: '62%', height: '62%' },
                })}
            >
                <IconRouter />
                {withDot ? (
                    <Box
                        sx={theme => ({
                            position: 'absolute',
                            right: -3,
                            bottom: -3,
                            width: '30%',
                            height: '30%',
                            minWidth: 10,
                            minHeight: 10,
                            maxWidth: 14,
                            maxHeight: 14,
                            borderRadius: '50%',
                            backgroundColor: Tr064FritzBox.getStatusColor(theme, status),
                            border: `2px solid ${theme.palette.background.paper}`,
                            boxSizing: 'border-box',
                        })}
                    />
                ) : null}
            </Box>
        );
    }

    private static renderDot(status: ReturnType<typeof Tr064FritzBox.getStatus>): React.JSX.Element {
        return (
            <Box
                component="span"
                sx={theme => ({
                    flex: '0 0 auto',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: Tr064FritzBox.getStatusColor(theme, status),
                    boxShadow: status === 'online' ? `0 0 0 3px ${alpha(theme.palette.success.main, 0.18)}` : undefined,
                })}
            />
        );
    }

    private static renderStatusText(
        status: ReturnType<typeof Tr064FritzBox.getStatus>,
        extra: string,
        fontSize: string | number,
    ): React.JSX.Element {
        const label = status === 'unknown' ? '…' : Generic.t(status);
        return (
            <Box
                sx={theme => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minWidth: 0,
                    fontSize,
                    lineHeight: 1.35,
                    color: muted(theme),
                })}
            >
                {Tr064FritzBox.renderDot(status)}
                <span style={ellipsis}>{extra ? `${label} · ${extra}` : label}</span>
            </Box>
        );
    }

    private static renderRateInline(
        direction: 'down' | 'up',
        rate: FormattedRate,
        valueSize: string | number,
        unitSize: string | number,
        secondary?: boolean,
    ): React.JSX.Element {
        const Icon = direction === 'down' ? IconDown : IconUp;
        return (
            <Box
                sx={theme => ({
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '3px',
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    color: secondary ? muted(theme) : theme.palette.text.primary,
                    fontVariantNumeric: 'tabular-nums',
                })}
            >
                <Icon
                    sx={{
                        alignSelf: 'center',
                        fontSize: unitSize,
                        width: '1.15em',
                        height: '1.15em',
                        color: direction === 'down' ? COLOR_DOWN : COLOR_UP,
                    }}
                />
                <span style={{ fontSize: valueSize, fontWeight: secondary ? 500 : 650, lineHeight: 1.1 }}>
                    {rate.value}
                </span>
                <Box
                    component="span"
                    sx={theme => ({ fontSize: unitSize, color: muted(theme) })}
                >
                    {rate.unit}
                </Box>
            </Box>
        );
    }

    /** One direction with label, big value and - if the maximum is known - a thin usage bar */
    private static renderRateBlock(
        direction: 'down' | 'up',
        data: BoxData,
        large: boolean,
        bars: boolean,
    ): React.JSX.Element | null {
        const lang = Generic.getLanguage();
        const value = direction === 'down' ? data.down : data.up;
        const max = direction === 'down' ? data.downMax : data.upMax;
        if (value === undefined) {
            return null;
        }
        const rate = rateOf(value, data);
        const color = direction === 'down' ? COLOR_DOWN : COLOR_UP;
        const Icon = direction === 'down' ? IconDown : IconUp;
        const usage = max && !data.stale ? Math.min(1, Math.max(0, (value * 8) / max)) : undefined;

        return (
            <Box sx={{ minWidth: 0 }}>
                <Box
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: 12,
                        color: muted(theme),
                        mb: '2px',
                    })}
                >
                    <Icon sx={{ fontSize: 15, color }} />
                    <span style={ellipsis}>{Generic.t(direction === 'down' ? 'download' : 'upload')}</span>
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '4px',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    <span
                        style={{
                            fontSize: large ? 'clamp(22px, 7.5cqi, 34px)' : 'clamp(20px, 9cqi, 28px)',
                            fontWeight: 650,
                            lineHeight: 1.1,
                            letterSpacing: '-0.01em',
                        }}
                    >
                        {rate.value}
                    </span>
                    <Box
                        component="span"
                        sx={theme => ({ fontSize: 12, color: muted(theme) })}
                    >
                        {rate.unit}
                    </Box>
                </Box>
                {bars && usage !== undefined && max ? (
                    <>
                        <Box
                            sx={{
                                mt: '6px',
                                height: 4,
                                borderRadius: 2,
                                overflow: 'hidden',
                                backgroundColor: alpha(color, 0.18),
                            }}
                        >
                            <Box
                                sx={{
                                    width: `${Math.max(usage * 100, usage > 0 ? 2 : 0)}%`,
                                    height: '100%',
                                    borderRadius: 2,
                                    backgroundColor: color,
                                    transition: 'width 0.6s ease',
                                }}
                            />
                        </Box>
                        <Box
                            sx={theme => ({
                                mt: '3px',
                                fontSize: 11,
                                color: muted(theme),
                                ...ellipsis,
                            })}
                        >
                            {Generic.t('of_max', `${formatBitRate(max, lang).value} ${formatBitRate(max, lang).unit}`)}
                        </Box>
                    </>
                ) : null}
            </Box>
        );
    }

    private static renderChip(options: {
        key: string;
        icon: React.JSX.Element;
        label?: string;
        tone: 'on' | 'off' | 'alert' | 'neutral';
        title: string;
        onClick?: (e: React.MouseEvent) => void;
        extra?: React.ReactNode;
        /** the icon rings (incoming call) */
        ring?: boolean;
    }): React.JSX.Element {
        const { tone } = options;
        return (
            <Box
                key={options.key}
                component="span"
                title={options.title}
                onClick={options.onClick}
                sx={theme => {
                    const isDark = theme.palette.mode === 'dark';
                    let color: string = muted(theme);
                    let background: string = alpha(theme.palette.text.primary, isDark ? 0.08 : 0.06);
                    if (tone === 'on') {
                        color = isDark ? theme.palette.primary.light : theme.palette.primary.main;
                        background = alpha(theme.palette.primary.main, isDark ? 0.22 : 0.12);
                    } else if (tone === 'alert') {
                        color = isDark ? theme.palette.error.light : theme.palette.error.main;
                        background = alpha(theme.palette.error.main, isDark ? 0.22 : 0.12);
                    } else if (tone === 'off') {
                        color = faint(theme);
                    }
                    return {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        height: 24,
                        px: '8px',
                        borderRadius: '12px',
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        color,
                        backgroundColor: background,
                        cursor: options.onClick ? 'pointer' : 'inherit',
                        userSelect: 'none',
                        '& .MuiSvgIcon-root': { fontSize: 15 },
                        ...(options.onClick ? { '&:hover': { filter: 'brightness(1.1)' } } : {}),
                        ...(options.ring
                            ? {
                                  '@keyframes tr064Ring': {
                                      '0%, 50%, 100%': { transform: 'rotate(0deg)' },
                                      '10%, 30%': { transform: 'rotate(-14deg)' },
                                      '20%, 40%': { transform: 'rotate(14deg)' },
                                  },
                                  '& .MuiSvgIcon-root': {
                                      fontSize: 15,
                                      animation: 'tr064Ring 1.2s ease-in-out infinite',
                                  },
                              }
                            : {}),
                    };
                }}
            >
                {options.icon}
                {options.label ? <span>{options.label}</span> : null}
                {options.extra}
            </Box>
        );
    }

    /**
     * WLAN, guest WLAN and the messages as chips. In `rows` rows at most: a chip which does not fit
     * wraps into the hidden next row, so it disappears as a whole - the alerts come first for that.
     */
    private renderChips(data: BoxData, mode: TileMode, rows: number): React.JSX.Element | null {
        const rxData = this.state.rxData;
        const instanceId = this.getInstanceId();
        /** chip and its priority, the lowest first */
        const list: [number, React.JSX.Element][] = [];
        const add = (priority: number, chip: React.JSX.Element): void => {
            list.push([priority, chip]);
        };
        const switchable = this.canSwitchWlan();

        if (rxData.showWlan !== false) {
            // the WLAN button of the box, or at least one band switched on
            const wlan = data.wlan ?? (data.bands.length ? data.bands.some(band => band.on) : undefined);
            if (wlan !== undefined) {
                add(
                    3,
                    Tr064FritzBox.renderChip({
                        key: 'wlan',
                        icon: wlan ? <IconWifi /> : <IconWifiOff />,
                        label: Generic.t('wlan'),
                        tone: wlan ? 'on' : 'off',
                        title: `${Generic.t('wlan')}: ${Generic.t(wlan ? 'on' : 'off')}`,
                        onClick:
                            switchable && data.wlan !== undefined
                                ? e => this.toggle(`${instanceId}.states.wlan`, data.wlan, e)
                                : undefined,
                        extra:
                            mode === 'large' && data.bands.length > 1 ? (
                                <span style={{ display: 'inline-flex', gap: 4, marginLeft: 2, fontWeight: 500 }}>
                                    {data.bands.map(band => (
                                        <span
                                            key={band.label}
                                            title={`${band.label} GHz: ${Generic.t(band.on ? 'on' : 'off')}`}
                                            style={{
                                                opacity: band.on && wlan ? 1 : 0.4,
                                                textDecoration: band.on ? 'none' : 'line-through',
                                            }}
                                        >
                                            {band.label}
                                        </span>
                                    ))}
                                </span>
                            ) : undefined,
                    }),
                );
            }
            if (data.guest !== undefined) {
                add(
                    4,
                    Tr064FritzBox.renderChip({
                        key: 'guest',
                        icon: data.guest ? <IconWifi /> : <IconWifiOff />,
                        label: Generic.t('guest'),
                        tone: data.guest ? 'on' : 'off',
                        title: `${Generic.t('guest_wlan')}: ${Generic.t(data.guest ? 'on' : 'off')}`,
                        onClick: switchable
                            ? e => this.toggle(`${instanceId}.states.wlanGuest`, data.guest, e)
                            : undefined,
                    }),
                );
            }
        }

        if (rxData.showMessages !== false) {
            if (data.ringing) {
                add(
                    0,
                    Tr064FritzBox.renderChip({
                        key: 'ringing',
                        icon: <IconRinging />,
                        tone: 'alert',
                        ring: true,
                        title: Generic.t('ringing'),
                        label: mode === 'large' && rows > 1 ? Generic.t('ringing') : undefined,
                    }),
                );
            }
            if (data.ab !== undefined) {
                add(
                    data.ab > 0 ? 1 : 5,
                    Tr064FritzBox.renderChip({
                        key: 'ab',
                        icon: <IconVoicemail />,
                        label: String(data.ab),
                        tone: data.ab > 0 ? 'alert' : 'neutral',
                        title: `${Generic.t('ab_messages')}: ${data.ab}`,
                    }),
                );
            }
            if (data.missed !== undefined) {
                add(
                    data.missed > 0 ? 2 : 6,
                    Tr064FritzBox.renderChip({
                        key: 'missed',
                        icon: <IconMissed />,
                        label: String(data.missed),
                        tone: data.missed > 0 ? 'alert' : 'neutral',
                        title: `${Generic.t('missed_calls')}: ${data.missed}`,
                    }),
                );
            }
        }

        if (!list.length) {
            return null;
        }
        list.sort((a, b) => a[0] - b[0]);
        return (
            <Box
                sx={{
                    flex: '0 0 auto',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    minWidth: 0,
                    // chips which do not fit wrap into a hidden row instead of pushing the rest out
                    ...(Number.isFinite(rows) ? { maxHeight: rows * 24 + (rows - 1) * 6, overflow: 'hidden' } : {}),
                }}
            >
                {list.map(item => item[1])}
            </Box>
        );
    }

    /** Only the counters which are not 0, for the small tiles */
    private renderAlerts(data: BoxData): React.JSX.Element | null {
        if (this.state.rxData.showMessages === false || this.state.rxData.hideDetails) {
            return null;
        }
        const alerts: React.JSX.Element[] = [];
        if (data.ringing) {
            alerts.push(
                Tr064FritzBox.renderChip({
                    key: 'ringing',
                    icon: <IconRinging />,
                    tone: 'alert',
                    ring: true,
                    title: Generic.t('ringing'),
                }),
            );
        }
        if (data.ab) {
            alerts.push(
                Tr064FritzBox.renderChip({
                    key: 'ab',
                    icon: <IconVoicemail />,
                    label: String(data.ab),
                    tone: 'alert',
                    title: `${Generic.t('ab_messages')}: ${data.ab}`,
                }),
            );
        }
        if (data.missed) {
            alerts.push(
                Tr064FritzBox.renderChip({
                    key: 'missed',
                    icon: <IconMissed />,
                    label: String(data.missed),
                    tone: 'alert',
                    title: `${Generic.t('missed_calls')}: ${data.missed}`,
                }),
            );
        }
        if (!alerts.length) {
            return null;
        }
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    minWidth: 0,
                    maxHeight: 52,
                    overflow: 'hidden',
                }}
            >
                {alerts}
            </Box>
        );
    }

    private renderSmall(data: BoxData, layout: TileLayout): React.JSX.Element {
        const status = Tr064FritzBox.getStatus(data);
        const tiny = layout.tiny;
        let rates: React.JSX.Element | null = null;
        if (data.down === undefined) {
            rates = Tr064FritzBox.renderStatusText(status, Tr064FritzBox.getConnectionText(data, false), 12);
        } else if (tiny) {
            // both in Mbit/s, the unit once below them - `87.3 Mbit/s` does not fit into 100 px
            const down = rateOf(data.down, data, true);
            const up = data.up !== undefined && layout.upLine ? rateOf(data.up, data, true) : null;
            rates = (
                <>
                    {Tr064FritzBox.renderRateInline('down', { value: down.value, unit: '' }, 15, 11)}
                    {up ? Tr064FritzBox.renderRateInline('up', { value: up.value, unit: '' }, 12, 11, true) : null}
                    {data.stale ? null : (
                        <Box sx={theme => ({ fontSize: 10, lineHeight: 1.3, color: muted(theme) })}>Mbit/s</Box>
                    )}
                </>
            );
        } else {
            rates = (
                <>
                    {Tr064FritzBox.renderRateInline(
                        'down',
                        rateOf(data.down, data),
                        'clamp(17px, 12cqi, 26px)',
                        'clamp(11px, 7cqi, 13px)',
                    )}
                    {data.up !== undefined && layout.upLine
                        ? Tr064FritzBox.renderRateInline(
                              'up',
                              rateOf(data.up, data),
                              'clamp(12px, 8cqi, 15px)',
                              'clamp(11px, 7cqi, 13px)',
                              true,
                          )
                        : null}
                </>
            );
        }
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {layout.icon ? (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                        {Tr064FritzBox.renderIcon(tiny ? '34px' : 'clamp(34px, 24cqi, 52px)', status, true)}
                        {tiny ? null : this.renderAlerts(data)}
                    </Box>
                ) : null}
                <Box sx={{ flex: '1 1 auto', minHeight: layout.icon ? 6 : 0 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    {/* without the icon the online dot is in front of the name */}
                    {layout.icon ? null : Tr064FritzBox.renderDot(status)}
                    <div
                        style={{
                            ...ellipsis,
                            fontWeight: 600,
                            fontSize: tiny ? 13 : 'clamp(13px, 8.5cqi, 17px)',
                            lineHeight: 1.3,
                        }}
                    >
                        {this.getTitle(data)}
                    </div>
                </Box>
                {rates}
            </Box>
        );
    }

    private renderRow(data: BoxData, layout: TileLayout): React.JSX.Element {
        const status = Tr064FritzBox.getStatus(data);
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', height: '100%', minWidth: 0 }}>
                {Tr064FritzBox.renderIcon('clamp(36px, 11cqi, 48px)', status, false)}
                <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ ...ellipsis, fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>
                        {this.getTitle(data)}
                    </div>
                    {Tr064FritzBox.renderStatusText(status, Tr064FritzBox.getConnectionText(data, false), 12)}
                </Box>
                {data.down !== undefined ? (
                    <Box
                        sx={{
                            flex: '0 0 auto',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                        }}
                    >
                        {Tr064FritzBox.renderRateInline('down', rateOf(data.down, data), 18, 11)}
                        {data.up !== undefined
                            ? Tr064FritzBox.renderRateInline('up', rateOf(data.up, data), 13, 11, true)
                            : null}
                    </Box>
                ) : null}
                {layout.alerts ? this.renderAlerts(data) : null}
            </Box>
        );
    }

    private renderMedium(data: BoxData): React.JSX.Element {
        const status = Tr064FritzBox.getStatus(data);
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', minHeight: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {Tr064FritzBox.renderIcon('40px', status, false)}
                    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div style={{ ...ellipsis, fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>
                            {this.getTitle(data)}
                        </div>
                        {Tr064FritzBox.renderStatusText(status, Tr064FritzBox.getConnectionText(data, false), 12)}
                    </Box>
                </Box>
                <Box sx={{ flex: '1 1 auto', minHeight: 0 }} />
                {data.down !== undefined || data.up !== undefined ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {Tr064FritzBox.renderRateBlock('down', data, false, false)}
                        {Tr064FritzBox.renderRateBlock('up', data, false, false)}
                    </Box>
                ) : null}
                {this.renderChips(data, 'medium', 1)}
            </Box>
        );
    }

    private renderInfoRows(data: BoxData, maxRows: number): React.JSX.Element | null {
        if (this.state.rxData.showIp === false || (!data.ip && !data.ipv6) || maxRows < 1) {
            return null;
        }
        const rows: { label: string; value: string }[] = [];
        if (data.ip) {
            rows.push({ label: Generic.t('external_ip'), value: data.ip });
        }
        if (data.ipv6) {
            rows.push({ label: 'IPv6', value: data.ipv6 });
        }
        rows.splice(maxRows);
        return (
            <Box
                sx={theme => ({
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(0, 1fr)',
                    columnGap: '10px',
                    rowGap: '2px',
                    alignItems: 'baseline',
                    fontSize: 12,
                    lineHeight: 1.4,
                    '& .label': { color: muted(theme), whiteSpace: 'nowrap' },
                    '& .value': { ...ellipsis, fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
                })}
            >
                {rows.map(row => (
                    <React.Fragment key={row.label}>
                        <span className="label">{row.label}</span>
                        <span
                            className="value"
                            title={row.value}
                        >
                            {row.value}
                        </span>
                    </React.Fragment>
                ))}
            </Box>
        );
    }

    private renderLarge(data: BoxData, layout: TileLayout): React.JSX.Element {
        const status = Tr064FritzBox.getStatus(data);
        const title = this.getTitle(data);
        const subtitle = [
            title !== data.model ? data.model : '',
            data.firmware ? `FRITZ!OS ${fritzOsVersion(data.firmware)}` : '',
        ]
            .filter(Boolean)
            .join(' · ');
        const connection = Tr064FritzBox.getConnectionText(data, true);

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', minHeight: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    {Tr064FritzBox.renderIcon('46px', status, false)}
                    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div style={{ ...ellipsis, fontWeight: 600, fontSize: 17, lineHeight: 1.3 }}>{title}</div>
                        {subtitle ? (
                            <Box
                                sx={theme => ({
                                    ...ellipsis,
                                    fontSize: 12,
                                    lineHeight: 1.35,
                                    color: muted(theme),
                                })}
                            >
                                {subtitle}
                            </Box>
                        ) : null}
                    </Box>
                    <Box sx={{ flex: '0 0 auto' }}>{Tr064FritzBox.renderStatusText(status, '', 12)}</Box>
                </Box>
                {connection ? (
                    <Box
                        sx={theme => ({
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            minWidth: 0,
                            fontSize: 13,
                            color: muted(theme),
                        })}
                    >
                        <IconInternet sx={{ fontSize: 16 }} />
                        <span style={ellipsis}>{connection}</span>
                    </Box>
                ) : null}
                {data.down !== undefined || data.up !== undefined ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {Tr064FritzBox.renderRateBlock('down', data, true, layout.bars)}
                        {Tr064FritzBox.renderRateBlock('up', data, true, layout.bars)}
                    </Box>
                ) : null}
                {this.renderInfoRows(data, layout.infoRows)}
                <Box sx={{ flex: '1 1 auto', minHeight: 0 }} />
                {this.renderChips(data, 'large', layout.chipRows)}
            </Box>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const data = this.readData();
        const noCard = !!this.state.rxData.noCard || !!props.widget?.usedInWidget;
        const layout = this.getLayout(noCard);
        const clickable = this.isClickable();
        const offline = data.online === false || data.alive === false;

        let content: React.JSX.Element;
        switch (layout.mode) {
            case 'row':
                content = this.renderRow(data, layout);
                break;
            case 'small':
                content = this.renderSmall(data, layout);
                break;
            case 'medium':
                content = this.renderMedium(data);
                break;
            default:
                content = this.renderLarge(data, layout);
                break;
        }

        return (
            <div
                ref={this.setRoot}
                className="tr064-fritzbox"
                style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    padding: noCard ? 0 : 4,
                    containerType: 'inline-size',
                }}
            >
                <Box
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable ? `${this.getTitle(data)} – Mesh` : undefined}
                    onClick={clickable ? this.openDialog : undefined}
                    onKeyDown={clickable ? this.onKeyDown : undefined}
                    sx={theme => tileSx(theme, noCard, offline, clickable, layout.pad)}
                >
                    {content}
                </Box>
                {this.state.dialogOpen && !this.state.editMode ? (
                    <MeshDialog
                        socket={this.getMeshSocket()}
                        instanceId={this.getInstanceId()}
                        title="FRITZ!Box – Mesh"
                        closeText={Generic.t('close')}
                        t={Generic.meshT()}
                        themeType={this.getThemeType()}
                        storageKey={this.getStorageKey('meshDialog')}
                        onClose={() => this.setState({ dialogOpen: false })}
                    />
                ) : null}
            </div>
        );
    }
}
