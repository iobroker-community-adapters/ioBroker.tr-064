/**
 * Mesh topology of a FRITZ!Box: toolbar, SVG graph and table.
 *
 * Host independent - it does not fetch anything (see `meshApi.ts`) and gets its texts by `t`.
 * It fills the width of its container: the tree layout if it fits, otherwise a stack of indented
 * cards, so it works from a phone (~280 px) up to a desktop without horizontal scrolling.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
    Alert,
    alpha,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { createTheme, ThemeProvider, useTheme, type Theme } from '@mui/material';
import {
    AccountTree as IconGraph,
    Close as IconClose,
    Edit as IconEdit,
    Refresh as IconRefresh,
    TableRows as IconTable,
} from '@mui/icons-material';

import {
    buildTree,
    CHIP_H_VENDOR,
    ellipsis,
    fittingChars,
    GAP,
    HEADER_H,
    type InfraView,
    layoutMesh,
    type LinkKind,
    linkKind,
    mbit,
    type MeshLayout,
    type MeshTree,
    PAD,
    type PlacedCard,
    type PlacedEdge,
    signalLevel,
    signalOf,
    type TableRow as MeshTableRow,
} from './meshLayout';
import { deviceIcon, DeviceIcon } from './deviceIcons';
import {
    MESH_ERROR_NOT_ALIVE,
    MESH_ERROR_NOT_CONNECTED,
    MESH_ERROR_NOT_SUPPORTED,
    MESH_ERROR_TIMEOUT,
} from './meshApi';
import type { MeshNodeInfo, MeshResponse } from './types';

export const KIND_COLORS: Record<LinkKind, string> = {
    2.4: '#f59e0b',
    5: '#3b82f6',
    6: '#8b5cf6',
    LAN: '#10b981',
    other: '#9ca3af',
};

/** The symbol of a device in a client chip: left edge, size of its box and of the symbol itself */
const ICON_X = 13;
const ICON_BOX = 26;
const ICON_SIZE = 16;

/** The signal in a client chip: width of `-73 dBm`, of the four bars and of both together */
const SIGNAL_TEXT_W = 44;
const SIGNAL_BARS_W = 13;
const SIGNAL_W = SIGNAL_TEXT_W + 6 + SIGNAL_BARS_W;

/** Below this width the toolbar is compact */
const DENSE_WIDTH = 600;
/** Longest name which the box accepts, see `MAX_HOST_NAME` of `src/main.ts` */
const MAX_HOST_NAME = 63;
/** Table columns by the available width */
const TABLE_FULL_WIDTH = 760;
const TABLE_MEDIUM_WIDTH = 480;

export type MeshTranslate = (key: string, ...args: (string | number)[]) => string;

export interface MeshViewProps {
    /** Answer of the adapter, `null` while nothing was read yet */
    data: MeshResponse | null;
    /** A request is running */
    loading: boolean;
    /** Error code (`not alive`, `not connected`, `not supported`, `timeout`) or an error text */
    error: string | null;
    /** Called by the refresh button */
    onRefresh: () => void;
    /**
     * Renames a device in the box (`renameDevice()` of `meshApi.ts`). Without it - and without
     * `canRename` of the answer - the view shows no rename button. It resolves with the error
     * text, or with `undefined` if the device was renamed.
     */
    onRename?: (mac: string, name: string) => Promise<string | undefined>;
    /** Translation of the `tr064_*` keys, e.g. `I18n.t` - `%s` is replaced by the arguments */
    t: MeshTranslate;
    /** Forces light or dark colors, by default the mode of the MUI theme of the host */
    themeType?: 'light' | 'dark';
    /** Small toolbar for tiles, widgets and dialogs */
    compact?: boolean;
    /** Height of the whole view; the graph/table scrolls inside. Without it the graph is at most 75vh high */
    height?: number | string;
    /** Key in the `localStorage` for the view settings, default `tr064.meshTopology` */
    storageKey?: string;
}

type ViewMode = 'graph' | 'table';

interface ViewSettings {
    onlyConfigured: boolean;
    showDisconnected: boolean;
    /** The manufacturer of the MAC address below the name - the chips get a second line */
    showVendor: boolean;
    viewMode: ViewMode;
}

function loadSettings(key: string): ViewSettings {
    const settings: ViewSettings = {
        onlyConfigured: false,
        showDisconnected: false,
        showVendor: true,
        viewMode: 'graph',
    };
    try {
        const stored = JSON.parse(window.localStorage.getItem(key) || '{}') as Partial<ViewSettings>;
        settings.onlyConfigured = !!stored.onlyConfigured;
        settings.showDisconnected = !!stored.showDisconnected;
        settings.showVendor = stored.showVendor !== false;
        settings.viewMode = stored.viewMode === 'table' ? 'table' : 'graph';
    } catch {
        // no storage (private window, blocked site data) - the defaults are used
    }
    return settings;
}

function saveSettings(key: string, settings: ViewSettings): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(settings));
    } catch {
        // ignore
    }
}

/**
 * The manufacturer of a device below its name: the owner of the MAC prefix, or the note that the
 * device uses a randomized address, which belongs to nobody.
 *
 * @param info a node of the topology or a row of the table
 * @param t
 */
function vendorText(info: { vendor?: string; randomMac?: boolean }, t: MeshTranslate): string {
    return info.vendor || (info.randomMac ? t('tr064_randomMac') : '');
}

function kindLabel(kind: LinkKind | ''): string {
    switch (kind) {
        case '2.4':
        case '5':
        case '6':
            return `${kind} GHz`;
        case 'LAN':
            return 'LAN';
        default:
            return '';
    }
}

/**
 * Alert for an error code
 *
 * @param error
 * @param t
 */
function errorAlert(error: string, t: MeshTranslate): { severity: 'info' | 'warning'; text: string } {
    switch (error) {
        case MESH_ERROR_NOT_ALIVE:
            return { severity: 'info', text: t('tr064_startInstance') };
        case MESH_ERROR_NOT_CONNECTED:
            return { severity: 'warning', text: t('tr064_notConnected') };
        case MESH_ERROR_NOT_SUPPORTED:
            return { severity: 'warning', text: t('tr064_notSupported') };
        case MESH_ERROR_TIMEOUT:
            return { severity: 'warning', text: t('tr064_timeout') };
        default:
            return { severity: 'warning', text: t('tr064_error', error) };
    }
}

function rate(row: MeshTableRow): string {
    return row.connected && (row.curDown || row.curUp) ? `↓ ${mbit(row.curDown)} / ↑ ${mbit(row.curUp)}` : '';
}

/** A signal below -80 dBm, or one which the box itself calls too far away */
const WEAK_COLOR = '#ef4444';

/**
 * The bars carry the color of the band - the strength is the number of filled bars and the value
 * next to them. Only a signal which really is too weak turns red.
 *
 * @param kind band or LAN of the link
 * @param rcpi signal strength in dBm
 * @param position `client_position` of the device
 */
function signalColor(kind: LinkKind | '', rcpi: number, position?: MeshNodeInfo['position']): string {
    if (signalLevel(rcpi) === 1 || position === 'too_far') {
        return WEAK_COLOR;
    }
    return KIND_COLORS[kind || 'other'];
}

/**
 * Four bars like a WLAN symbol, the bars above the level only faintly filled.
 *
 * Drawn in SVG coordinates, 13 x 11 px with the baseline of the text as the lower edge.
 *
 * @param props `rcpi` in dBm, `x`/`y` of the lower left corner and the color of the bars
 */
function SignalBars(props: { rcpi: number; x: number; y: number; color: string }): React.JSX.Element {
    const level = signalLevel(props.rcpi);
    return (
        <g transform={`translate(${props.x}, ${props.y})`}>
            {[0, 1, 2, 3].map(i => {
                const height = 3 + i * 2.5;
                return (
                    <rect
                        key={i}
                        x={i * 3.3}
                        y={-height}
                        width={2.4}
                        height={height}
                        rx={0.8}
                        fill={props.color}
                        opacity={i < level ? 1 : 0.22}
                    />
                );
            })}
        </g>
    );
}

/** `-58 dBm`, empty if the box reports no signal for that link */
function signalText(rcpi?: number): string {
    return rcpi === undefined ? '' : `${rcpi} dBm`;
}

/** The time of the last connection of a device which is not connected any more */
function lastSeenText(lastConnected: number | undefined, t: MeshTranslate): string {
    if (!lastConnected) {
        return '';
    }
    return t('tr064_lastSeen', new Date(lastConnected).toLocaleString());
}

/**
 * The lines about the signal for a tooltip: the strength at both ends, the signal to noise and
 * the rating of the box ("too far away").
 *
 * @param link the link of the device
 * @param position `client_position` of the device
 * @param t
 */
function signalDetails(
    link: { rcpiFrom?: number; rcpiTo?: number; rsniFrom?: number; rsniTo?: number } | undefined,
    position: MeshNodeInfo['position'],
    t: MeshTranslate,
): string[] {
    const lines: string[] = [];
    if (link?.rcpiTo !== undefined || link?.rcpiFrom !== undefined) {
        lines.push(
            t(
                'tr064_signalTooltip',
                link.rcpiTo === undefined ? '–' : String(link.rcpiTo),
                link.rcpiFrom === undefined ? '–' : String(link.rcpiFrom),
            ),
        );
    }
    if (link?.rsniTo !== undefined || link?.rsniFrom !== undefined) {
        lines.push(
            t(
                'tr064_noiseTooltip',
                link.rsniTo === undefined ? '–' : String(link.rsniTo),
                link.rsniFrom === undefined ? '–' : String(link.rsniFrom),
            ),
        );
    }
    if (position === 'too_far' || position === 'too_close') {
        lines.push(t(`tr064_position_${position}`));
    }
    return lines;
}

function KindMark(props: { kind: LinkKind }): React.JSX.Element {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-block',
                flexShrink: 0,
                width: 10,
                height: 10,
                borderRadius: '2px',
                backgroundColor: KIND_COLORS[props.kind],
            }}
        />
    );
}

function Legend(): React.JSX.Element {
    return (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['2.4', '5', '6', 'LAN'] as LinkKind[]).map(kind => (
                <Box
                    key={kind}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                    <KindMark kind={kind} />
                    <Typography variant="caption">{kindLabel(kind)}</Typography>
                </Box>
            ))}
        </Box>
    );
}

function renderEdge(edge: PlacedEdge, index: number, theme: Theme, t: MeshTranslate): React.JSX.Element {
    const kind = linkKind(edge.link);
    const connected = edge.link.state?.toUpperCase() === 'CONNECTED';
    const label = [
        kindLabel(kind) || edge.link.type,
        connected && edge.link.curDown ? `${mbit(edge.link.curDown)} Mbit/s` : '',
    ]
        .filter(Boolean)
        .join(' · ');
    const details = [
        `${edge.link.interface || edge.link.type} - ${connected ? t('tr064_connected') : t('tr064_disconnected')}`,
        edge.link.curDown || edge.link.curUp
            ? t('tr064_rateTooltip', mbit(edge.link.curDown), mbit(edge.link.curUp))
            : '',
        ...signalDetails(edge.link, undefined, t),
        connected ? '' : lastSeenText(edge.link.lastConnected, t),
    ].filter(Boolean);

    return (
        <g key={`edge-${index}`}>
            <title>{details.join('\n')}</title>
            <path
                d={edge.d}
                fill="none"
                stroke={KIND_COLORS[kind]}
                strokeWidth={2.5}
                strokeDasharray={connected ? undefined : '6 4'}
            />
            <text
                x={edge.labelX}
                y={edge.labelY}
                fontSize={11}
                fill={theme.palette.text.secondary}
            >
                {label}
            </text>
        </g>
    );
}

/** What the cards need besides the topology itself */
interface CardContext {
    /** The manufacturer below the name */
    showVendor: boolean;
    /** Opens the rename dialog, missing if the box or the host cannot rename a device */
    onRename?: (uid: string) => void;
}

function renderCard(card: PlacedCard, theme: Theme, t: MeshTranslate, ctx: CardContext): React.JSX.Element {
    const palette = theme.palette;
    const node = card.view.node;
    const title = node ? node.name || node.mac : t('tr064_notAssigned');
    const role = node ? t(`tr064_role_${node.role}`) : '';
    const model = node?.model && node.model !== node.name ? node.model : '';
    const vendor = node && ctx.showVendor ? vendorText(node, t) : '';
    // the manufacturer only stands in for the model, which says more about a box or a repeater
    const subtitle = [model || vendor, node?.ip || '', role].filter(Boolean).join(' · ');
    // the box itself is not renamed with the name of a device of the home network
    const renameUid = node && node.role !== 'master' && node.mac && ctx.onRename ? node.uid : '';
    const count = card.view.clients.length;
    const countText = count === 1 ? t('tr064_oneDevice') : count ? t('tr064_devices', count) : '';
    const titleChars = fittingChars(card.w - 2 * PAD - (countText ? countText.length * 6.2 + 8 : 0), 14, true);
    const subtitleChars = fittingChars(card.w - 2 * PAD, 11);

    return (
        <g
            key={`card-${node?.uid || 'unassigned'}`}
            transform={`translate(${card.x}, ${card.y})`}
        >
            <title>
                {[
                    title,
                    node?.model,
                    node ? vendorText(node, t) : '',
                    node?.mac,
                    node?.ip,
                    renameUid ? t('tr064_clickToRename') : '',
                ]
                    .filter(Boolean)
                    .join('\n')}
            </title>
            <rect
                width={card.w}
                height={card.h}
                rx={8}
                fill={palette.background.paper}
                stroke={node?.role === 'master' ? palette.primary.main : palette.divider}
                strokeWidth={node?.role === 'master' ? 2 : 1}
                strokeDasharray={node ? undefined : '5 4'}
            />
            <text
                x={PAD}
                y={24}
                fontSize={14}
                fontWeight={600}
                fill={palette.text.primary}
                style={renameUid ? { cursor: 'pointer' } : undefined}
                onClick={renameUid ? () => ctx.onRename!(renameUid) : undefined}
            >
                {ellipsis(title, titleChars)}
            </text>
            <text
                x={PAD}
                y={42}
                fontSize={11}
                fill={palette.text.secondary}
            >
                {ellipsis(subtitle, subtitleChars)}
            </text>
            <text
                x={card.w - PAD}
                y={24}
                fontSize={11}
                textAnchor="end"
                fill={palette.text.secondary}
            >
                {countText}
            </text>
            {card.view.clients.map((client, i) => {
                const column = i % card.columns;
                const row = Math.floor(i / card.columns);
                const x = PAD + column * (card.chipW + GAP);
                const y = HEADER_H + row * (card.chipH + GAP);
                const kind = linkKind(client.link);
                const configured = !!client.node.configured;
                const name = client.node.configured || client.node.name || client.node.mac;
                const manufacturer = ctx.showVendor ? vendorText(client.node, t) : '';
                // three lines (name, manufacturer, IP address) or two, with both below the name
                const threeLines = card.chipH >= CHIP_H_VENDOR && !!manufacturer;
                const signal = client.connected ? signalOf(client.link) : undefined;
                // the band stands above the signal on the right side, the texts get the rest
                const rightW = Math.max(kindLabel(kind) ? 34 : 0, signal === undefined ? 0 : SIGNAL_W);
                const textX = ICON_X + ICON_BOX + 8;
                // the name shares its line with the band, the lines below it with the signal -
                // without a signal they reach to the right edge of the chip
                const textW = card.chipW - textX - rightW - 6;
                const lineW = signal === undefined ? card.chipW - textX - 8 : textW;
                const ip = client.node.ip ? `IP: ${client.node.ip}` : '';
                // the second line of a two line chip: the IP address at its right end, the
                // manufacturer gets what is left of it
                const ipW = !threeLines && ip && manufacturer ? ip.length * 5.7 + 10 : 0;
                const signalFill = signal === undefined ? '' : signalColor(kind, signal, client.node.position);
                const details = [
                    configured ? t('tr064_configuredAs', client.node.configured!) : '',
                    client.node.name,
                    vendorText(client.node, t),
                    client.node.mac,
                    client.node.ip,
                    client.link ? client.link.interface || client.link.type : '',
                    client.connected ? t('tr064_connected') : t('tr064_disconnected'),
                    client.link && (client.link.curDown || client.link.curUp)
                        ? t('tr064_rateTooltip', mbit(client.link.curDown), mbit(client.link.curUp))
                        : '',
                    ...(client.connected ? signalDetails(client.link, client.node.position, t) : []),
                    client.connected ? '' : lastSeenText(client.link?.lastConnected, t),
                    ctx.onRename ? t('tr064_clickToRename') : '',
                ].filter(Boolean);

                return (
                    <g
                        key={client.node.uid}
                        transform={`translate(${x}, ${y})`}
                        // a configured device stays readable in the dark theme, the dashed frame marks it
                        opacity={client.connected ? 1 : configured ? 0.85 : 0.6}
                        style={ctx.onRename ? { cursor: 'pointer' } : undefined}
                        onClick={ctx.onRename ? () => ctx.onRename!(client.node.uid) : undefined}
                    >
                        <title>{details.join('\n')}</title>
                        <rect
                            width={card.chipW}
                            height={card.chipH}
                            rx={7}
                            fill={palette.action.hover}
                            stroke={configured ? palette.primary.main : palette.divider}
                            strokeWidth={configured ? 2 : 1}
                            strokeDasharray={client.connected ? undefined : '4 3'}
                        />
                        {/* the band as a stripe at the left edge, rounded like the chip */}
                        <path
                            d={`M 7 0.5 H 7 A 6.5 6.5 0 0 0 0.5 7 V ${card.chipH - 7} A 6.5 6.5 0 0 0 7 ${card.chipH - 0.5} V 0.5 Z`}
                            fill={KIND_COLORS[kind]}
                        />
                        <rect
                            x={ICON_X}
                            y={(card.chipH - ICON_BOX) / 2}
                            width={ICON_BOX}
                            height={ICON_BOX}
                            rx={6}
                            fill={alpha(KIND_COLORS[kind], 0.14)}
                        />
                        <DeviceIcon
                            deviceClass={client.node.deviceClass}
                            x={ICON_X + (ICON_BOX - ICON_SIZE) / 2}
                            y={(card.chipH - ICON_SIZE) / 2}
                            size={ICON_SIZE}
                            color={KIND_COLORS[kind]}
                        />
                        <text
                            x={textX}
                            y={threeLines ? 19 : 17}
                            fontSize={12.5}
                            fontWeight={configured ? 700 : 600}
                            fill={configured ? palette.primary.main : palette.text.primary}
                        >
                            {ellipsis(name, fittingChars(textW, 12.5, true))}
                        </text>
                        {manufacturer ? (
                            <text
                                x={textX}
                                y={threeLines ? 34 : 31}
                                fontSize={10}
                                fontStyle="italic"
                                opacity={0.75}
                                fill={palette.text.secondary}
                            >
                                {ellipsis(manufacturer, fittingChars(lineW - ipW, 10))}
                            </text>
                        ) : null}
                        {ip ? (
                            <text
                                x={ipW ? textX + lineW : textX}
                                y={threeLines ? 48 : 31}
                                fontSize={10}
                                textAnchor={ipW ? 'end' : 'start'}
                                fill={palette.text.secondary}
                            >
                                {ellipsis(ip, fittingChars(lineW, 10))}
                            </text>
                        ) : null}
                        <text
                            x={card.chipW - 8}
                            y={threeLines ? 19 : 16}
                            fontSize={10}
                            textAnchor="end"
                            fill={palette.text.secondary}
                        >
                            {kindLabel(kind)}
                        </text>
                        {signal === undefined ? null : (
                            <>
                                <SignalBars
                                    rcpi={signal}
                                    x={card.chipW - 8 - SIGNAL_W}
                                    y={threeLines ? 41 : 34}
                                    color={signalFill}
                                />
                                <text
                                    x={card.chipW - 8}
                                    y={threeLines ? 41 : 34}
                                    fontSize={10.5}
                                    textAnchor="end"
                                    fill={signalFill}
                                >
                                    {signalText(signal)}
                                </text>
                            </>
                        )}
                    </g>
                );
            })}
        </g>
    );
}

function MeshTable(props: {
    tree: MeshTree;
    width: number;
    t: MeshTranslate;
    theme: Theme;
    showVendor: boolean;
    onRename?: (uid: string) => void;
}): React.JSX.Element {
    const { tree, width, t, theme, showVendor, onRename } = props;
    const full = width >= TABLE_FULL_WIDTH;
    const medium = width >= TABLE_MEDIUM_WIDTH;
    // a phone: device (with access point and state below the name) and connection only
    const cell = medium ? undefined : { px: 1 };

    return (
        <Table
            size="small"
            stickyHeader
        >
            <TableHead>
                <TableRow>
                    <TableCell sx={cell}>{t('tr064_device')}</TableCell>
                    {medium ? <TableCell>{t('tr064_accessPoint')}</TableCell> : null}
                    <TableCell sx={cell}>{t('tr064_connection')}</TableCell>
                    {medium ? <TableCell>{t('tr064_state')}</TableCell> : null}
                    {medium ? <TableCell>{t('tr064_signal')}</TableCell> : null}
                    {medium ? <TableCell>{t('tr064_rate')}</TableCell> : null}
                    {full ? <TableCell>{t('tr064_mac')}</TableCell> : null}
                    {full ? <TableCell>{t('tr064_ip')}</TableCell> : null}
                    {onRename ? <TableCell sx={{ width: 40 }} /> : null}
                </TableRow>
            </TableHead>
            <TableBody>
                {tree.rows.map(row => (
                    <TableRow
                        key={row.uid}
                        sx={{ opacity: row.connected ? 1 : 0.6 }}
                    >
                        <TableCell
                            sx={{
                                ...cell,
                                fontWeight: row.configured ? 700 : 400,
                                color: row.configured ? theme.palette.primary.main : undefined,
                                overflowWrap: 'anywhere',
                            }}
                            title={row.configured && row.hostName !== row.name ? row.hostName : undefined}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Box
                                    component={deviceIcon(row.deviceClass)}
                                    sx={{
                                        fontSize: 17,
                                        flex: '0 0 auto',
                                        color: row.kind ? KIND_COLORS[row.kind] : 'text.secondary',
                                    }}
                                />
                                <span>{row.name}</span>
                            </Box>
                            {showVendor && vendorText(row, t) ? (
                                <Typography
                                    variant="caption"
                                    component="div"
                                    color="text.secondary"
                                    sx={{ fontStyle: 'italic', opacity: 0.7, fontWeight: 400 }}
                                >
                                    {vendorText(row, t)}
                                </Typography>
                            ) : null}
                            {medium ? null : (
                                <Typography
                                    variant="caption"
                                    component="div"
                                    color="text.secondary"
                                    sx={{ fontWeight: 400 }}
                                >
                                    {[
                                        row.accessPoint || t('tr064_notAssigned'),
                                        row.connected ? '' : t('tr064_disconnected'),
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </Typography>
                            )}
                        </TableCell>
                        {medium ? <TableCell>{row.accessPoint || t('tr064_notAssigned')}</TableCell> : null}
                        <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>
                            {row.kind ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <KindMark kind={row.kind} />
                                    {kindLabel(row.kind) || row.type}
                                </Box>
                            ) : null}
                        </TableCell>
                        {medium ? (
                            <TableCell>
                                {row.connected ? t('tr064_connected') : t('tr064_disconnected')}
                                {!row.connected && row.lastConnected ? (
                                    <Typography
                                        variant="caption"
                                        component="div"
                                        color="text.secondary"
                                    >
                                        {lastSeenText(row.lastConnected, t)}
                                    </Typography>
                                ) : null}
                            </TableCell>
                        ) : null}
                        {medium ? (
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                {row.connected && row.rcpi !== undefined ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <Box
                                            component="svg"
                                            viewBox="0 0 13 11"
                                            sx={{ width: 13, height: 11, flex: '0 0 auto' }}
                                        >
                                            <SignalBars
                                                rcpi={row.rcpi}
                                                x={0}
                                                y={11}
                                                color={signalColor(row.kind, row.rcpi, row.position)}
                                            />
                                        </Box>
                                        {signalText(row.rcpi)}
                                    </Box>
                                ) : null}
                                {row.connected && (row.position === 'too_far' || row.position === 'too_close') ? (
                                    <Typography
                                        variant="caption"
                                        component="div"
                                        color={row.position === 'too_far' ? 'warning.main' : 'text.secondary'}
                                    >
                                        {t(`tr064_position_${row.position}`)}
                                    </Typography>
                                ) : null}
                            </TableCell>
                        ) : null}
                        {medium ? <TableCell sx={{ whiteSpace: 'nowrap' }}>{rate(row)}</TableCell> : null}
                        {full ? <TableCell sx={{ fontFamily: 'monospace' }}>{row.mac}</TableCell> : null}
                        {full ? <TableCell>{row.ip || ''}</TableCell> : null}
                        {onRename ? (
                            <TableCell sx={{ ...cell, width: 40 }}>
                                <IconButton
                                    size="small"
                                    title={t('tr064_rename')}
                                    onClick={() => onRename(row.uid)}
                                >
                                    <IconEdit fontSize="small" />
                                </IconButton>
                            </TableCell>
                        ) : null}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

/**
 * Asks for the new name of a device and renames it in the box.
 *
 * The box uses that name everywhere, so it also decides how the objects below `devices` are
 * called - `tr064_renameHint` says so.
 *
 * @param props
 */
function RenameDialog(props: {
    node: MeshNodeInfo;
    t: MeshTranslate;
    onClose: () => void;
    onRename: (mac: string, name: string) => Promise<string | undefined>;
}): React.JSX.Element {
    const { node, t, onClose, onRename } = props;
    const [name, setName] = useState(node.name || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const changed = name.trim() && name.trim() !== node.name;

    const save = (): void => {
        if (!changed || busy) {
            return;
        }
        setBusy(true);
        setError(null);
        void onRename(node.mac, name.trim()).then(failed => {
            setBusy(false);
            if (failed) {
                setError(failed);
            } else {
                onClose();
            }
        });
    };

    return (
        <Dialog
            open
            fullWidth
            maxWidth="sm"
            onClose={busy ? undefined : onClose}
        >
            <DialogTitle>{t('tr064_renameTitle')}</DialogTitle>
            <DialogContent>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                >
                    {[node.mac, vendorText(node, t), node.ip].filter(Boolean).join(' · ')}
                </Typography>
                <TextField
                    fullWidth
                    autoFocus
                    variant="standard"
                    label={t('tr064_newName')}
                    value={name}
                    disabled={busy}
                    error={!!error}
                    slotProps={{ htmlInput: { maxLength: MAX_HOST_NAME } }}
                    onChange={e => setName(e.target.value)}
                    onKeyUp={e => {
                        if (e.key === 'Enter') {
                            save();
                        }
                    }}
                />
                <Alert
                    severity="info"
                    sx={{ mt: 2 }}
                >
                    {t('tr064_renameHint')}
                </Alert>
                {error ? (
                    <Alert
                        severity="error"
                        sx={{ mt: 1 }}
                    >
                        {t('tr064_renameFailed', error)}
                    </Alert>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    disabled={busy || !changed}
                    startIcon={busy ? <CircularProgress size={16} /> : <IconEdit />}
                    onClick={save}
                >
                    {t('tr064_rename')}
                </Button>
                <Button
                    variant="contained"
                    color="inherit"
                    disabled={busy}
                    startIcon={<IconClose />}
                    onClick={onClose}
                >
                    {t('tr064_cancel')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/**
 * Mesh topology with toolbar, graph and table - see the README of `src-shared`
 *
 * @param props
 */
export default function MeshView(props: MeshViewProps): React.JSX.Element {
    const { data, loading, error, onRefresh, onRename, t, compact, height } = props;
    const storageKey = props.storageKey || 'tr064.meshTopology';

    const outerTheme = useTheme();
    const theme = useMemo(
        () =>
            props.themeType && props.themeType !== outerTheme.palette.mode
                ? createTheme({ palette: { mode: props.themeType } })
                : outerTheme,
        [outerTheme, props.themeType],
    );

    const [settings, setSettings] = useState<ViewSettings>(() => loadSettings(storageKey));
    const changeSettings = (changed: Partial<ViewSettings>): void => {
        const next = { ...settings, ...changed };
        setSettings(next);
        saveSettings(storageKey, next);
    };

    // the device of the open rename dialog, by its UID: the node itself is taken from the last
    // answer, so the dialog closes by itself if the device disappears
    const [renameUid, setRenameUid] = useState<string | null>(null);
    const renameNode = renameUid ? (data?.nodes || []).find(node => node.uid === renameUid) : undefined;
    const openRename = onRename && data?.canRename ? (uid: string) => setRenameUid(uid) : undefined;

    // the width of the container decides about the layout
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = rootRef.current;
        if (!element) {
            return undefined;
        }
        setWidth(Math.floor(element.getBoundingClientRect().width));
        if (typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const observer = new ResizeObserver(entries => {
            const newWidth = Math.floor(entries[0]?.contentRect.width || 0);
            setWidth(old => (old === newWidth ? old : newWidth));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const tree = useMemo(
        () =>
            data
                ? buildTree(data, {
                      onlyConfigured: settings.onlyConfigured,
                      showDisconnected: settings.showDisconnected,
                  })
                : null,
        [data, settings.onlyConfigured, settings.showDisconnected],
    );
    // 2 px for the border of the graph area
    const graphWidth = Math.max(0, width - 2);
    const layout: MeshLayout | null = useMemo(() => {
        if (!tree || !graphWidth) {
            return null;
        }
        const roots: InfraView[] = [...tree.roots];
        if (tree.unassigned.length) {
            roots.push({ clients: tree.unassigned, children: [] });
        }
        return layoutMesh(roots, graphWidth, settings.showVendor);
    }, [tree, graphWidth, settings.showVendor]);

    const dense = !!compact || (width > 0 && width < DENSE_WIDTH);
    const fixedHeight = height !== undefined && height !== null && height !== '';
    const scrollArea = {
        overflow: 'auto',
        minHeight: 0,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        ...(fixedHeight ? { flex: '1 1 auto' } : { maxHeight: '75vh' }),
    };

    const toolbar = (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: dense ? 0.5 : 1,
                rowGap: 0.5,
                mb: 1,
                flex: '0 0 auto',
            }}
        >
            {dense ? (
                <IconButton
                    size="small"
                    title={t('tr064_refresh')}
                    disabled={loading}
                    onClick={() => onRefresh()}
                >
                    {loading ? <CircularProgress size={18} /> : <IconRefresh fontSize="small" />}
                </IconButton>
            ) : (
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={loading ? <CircularProgress size={16} /> : <IconRefresh />}
                    disabled={loading}
                    onClick={() => onRefresh()}
                >
                    {t('tr064_refresh')}
                </Button>
            )}
            {[
                { key: 'onlyConfigured' as const, label: t('tr064_onlyConfigured') },
                { key: 'showDisconnected' as const, label: t('tr064_showDisconnected') },
                { key: 'showVendor' as const, label: t('tr064_showVendor') },
            ].map(item => (
                <FormControlLabel
                    key={item.key}
                    sx={dense ? { mr: 0.5, ml: 0 } : undefined}
                    control={
                        <Checkbox
                            size="small"
                            sx={dense ? { p: 0.5 } : undefined}
                            checked={settings[item.key]}
                            onChange={e => changeSettings({ [item.key]: e.target.checked })}
                        />
                    }
                    label={<Typography variant={dense ? 'body2' : 'body1'}>{item.label}</Typography>}
                />
            ))}
            <ToggleButtonGroup
                size="small"
                exclusive
                value={settings.viewMode}
                onChange={(_e, value: ViewMode | null) => value && changeSettings({ viewMode: value })}
            >
                <ToggleButton
                    value="graph"
                    title={t('tr064_graph')}
                    sx={dense ? { p: 0.5 } : undefined}
                >
                    <IconGraph fontSize="small" />
                </ToggleButton>
                <ToggleButton
                    value="table"
                    title={t('tr064_table')}
                    sx={dense ? { p: 0.5 } : undefined}
                >
                    <IconTable fontSize="small" />
                </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flexGrow: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
                <Legend />
                {data?.ts ? (
                    <Typography
                        variant="caption"
                        color="text.secondary"
                    >
                        {t('tr064_updated', new Date(data.ts).toLocaleTimeString())}
                    </Typography>
                ) : null}
            </Box>
        </Box>
    );

    let content: React.JSX.Element;
    if (error && (error === MESH_ERROR_NOT_ALIVE || !data)) {
        const alert = errorAlert(error, t);
        content = <Alert severity={alert.severity}>{alert.text}</Alert>;
    } else if (!data || !tree) {
        content = (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
                <CircularProgress size={20} />
                <Typography>{t('tr064_loading')}</Typography>
            </Box>
        );
    } else {
        const warning = error ? errorAlert(error, t) : null;
        content = (
            <>
                {warning ? (
                    <Alert
                        severity={warning.severity}
                        sx={{ mb: 1, flex: '0 0 auto' }}
                    >
                        {warning.text}
                    </Alert>
                ) : null}
                {!tree.roots.length && !tree.unassigned.length ? (
                    <Alert severity="info">{t('tr064_noData')}</Alert>
                ) : settings.viewMode === 'table' ? (
                    <TableContainer sx={scrollArea}>
                        <MeshTable
                            tree={tree}
                            width={graphWidth}
                            t={t}
                            theme={theme}
                            showVendor={settings.showVendor}
                            onRename={openRename}
                        />
                    </TableContainer>
                ) : (
                    <Box sx={{ ...scrollArea, backgroundColor: theme.palette.background.default }}>
                        {layout ? (
                            <svg
                                width={layout.width}
                                height={layout.height}
                                style={{ display: 'block', fontFamily: theme.typography.fontFamily }}
                            >
                                {layout.edges.map((edge, i) => renderEdge(edge, i, theme, t))}
                                {layout.cards.map(card =>
                                    renderCard(card, theme, t, {
                                        showVendor: settings.showVendor,
                                        onRename: openRename,
                                    }),
                                )}
                            </svg>
                        ) : null}
                    </Box>
                )}
            </>
        );
    }

    const view = (
        <Box
            ref={rootRef}
            sx={{
                width: '100%',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                ...(fixedHeight ? { height } : {}),
            }}
        >
            {toolbar}
            {content}
            {renameNode && onRename ? (
                <RenameDialog
                    node={renameNode}
                    t={t}
                    onClose={() => setRenameUid(null)}
                    onRename={onRename}
                />
            ) : null}
        </Box>
    );

    return theme === outerTheme ? view : <ThemeProvider theme={theme}>{view}</ThemeProvider>;
}
