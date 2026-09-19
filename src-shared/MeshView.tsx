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
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControlLabel,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { createTheme, ThemeProvider, useTheme, type Theme } from '@mui/material';
import { AccountTree as IconGraph, Refresh as IconRefresh, TableRows as IconTable } from '@mui/icons-material';

import {
    buildTree,
    CHIP_H,
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
    type TableRow as MeshTableRow,
} from './meshLayout';
import {
    MESH_ERROR_NOT_ALIVE,
    MESH_ERROR_NOT_CONNECTED,
    MESH_ERROR_NOT_SUPPORTED,
    MESH_ERROR_TIMEOUT,
} from './meshApi';
import type { MeshResponse } from './types';

export const KIND_COLORS: Record<LinkKind, string> = {
    2.4: '#f59e0b',
    5: '#3b82f6',
    6: '#8b5cf6',
    LAN: '#10b981',
    other: '#9ca3af',
};

/** Below this width the toolbar is compact */
const DENSE_WIDTH = 600;
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
    viewMode: ViewMode;
}

function loadSettings(key: string): ViewSettings {
    const settings: ViewSettings = { onlyConfigured: false, showDisconnected: false, viewMode: 'graph' };
    try {
        const stored = JSON.parse(window.localStorage.getItem(key) || '{}') as Partial<ViewSettings>;
        settings.onlyConfigured = !!stored.onlyConfigured;
        settings.showDisconnected = !!stored.showDisconnected;
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
    return row.connected && (row.curRx || row.curTx) ? `↓ ${mbit(row.curRx)} / ↑ ${mbit(row.curTx)}` : '';
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
        connected && edge.link.curRx ? `${mbit(edge.link.curRx)} Mbit/s` : '',
    ]
        .filter(Boolean)
        .join(' · ');
    const rates =
        edge.link.curRx || edge.link.curTx
            ? `\n${t('tr064_rateTooltip', mbit(edge.link.curRx), mbit(edge.link.curTx))}`
            : '';

    return (
        <g key={`edge-${index}`}>
            <title>
                {`${edge.link.interface || edge.link.type} - ${connected ? t('tr064_connected') : t('tr064_disconnected')}${rates}`}
            </title>
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

function renderCard(card: PlacedCard, theme: Theme, t: MeshTranslate): React.JSX.Element {
    const palette = theme.palette;
    const node = card.view.node;
    const title = node ? node.name || node.mac : t('tr064_notAssigned');
    const role = node ? t(`tr064_role_${node.role}`) : '';
    const subtitle = [node?.model && node.model !== node.name ? node.model : '', node?.ip || '', role]
        .filter(Boolean)
        .join(' · ');
    const count = card.view.clients.length;
    const countText = count === 1 ? t('tr064_oneDevice') : count ? t('tr064_devices', count) : '';
    const titleChars = fittingChars(card.w - 2 * PAD - (countText ? countText.length * 6.2 + 8 : 0), 14, true);
    const subtitleChars = fittingChars(card.w - 2 * PAD, 11);
    // the band is right aligned in the chip, the name gets the rest
    const nameWidth = card.chipW - 12 - 44;

    return (
        <g
            key={`card-${node?.uid || 'unassigned'}`}
            transform={`translate(${card.x}, ${card.y})`}
        >
            <title>{[title, node?.model, node?.mac, node?.ip].filter(Boolean).join('\n')}</title>
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
                const y = HEADER_H + row * (CHIP_H + GAP);
                const kind = linkKind(client.link);
                const configured = !!client.node.configured;
                const name = client.node.configured || client.node.name || client.node.mac;
                const details = [
                    configured ? t('tr064_configuredAs', client.node.configured!) : '',
                    client.node.name,
                    client.node.mac,
                    client.node.ip,
                    client.link ? client.link.interface || client.link.type : '',
                    client.connected ? t('tr064_connected') : t('tr064_disconnected'),
                    client.link && (client.link.curRx || client.link.curTx)
                        ? t('tr064_rateTooltip', mbit(client.link.curRx), mbit(client.link.curTx))
                        : '',
                ].filter(Boolean);

                return (
                    <g
                        key={client.node.uid}
                        transform={`translate(${x}, ${y})`}
                        // a configured device stays readable in the dark theme, the dashed frame marks it
                        opacity={client.connected ? 1 : configured ? 0.85 : 0.65}
                    >
                        <title>{details.join('\n')}</title>
                        <rect
                            width={card.chipW}
                            height={CHIP_H}
                            rx={5}
                            fill={palette.action.hover}
                            stroke={configured ? palette.primary.main : palette.divider}
                            strokeWidth={configured ? 2 : 1}
                            strokeDasharray={client.connected ? undefined : '4 3'}
                        />
                        <rect
                            width={5}
                            height={CHIP_H}
                            rx={2}
                            fill={KIND_COLORS[kind]}
                        />
                        <text
                            x={12}
                            y={17}
                            fontSize={12}
                            fontWeight={configured ? 700 : 400}
                            fill={configured ? palette.primary.main : palette.text.primary}
                        >
                            {ellipsis(name, fittingChars(nameWidth, 12, configured))}
                        </text>
                        <text
                            x={card.chipW - 6}
                            y={17}
                            fontSize={10}
                            textAnchor="end"
                            fill={palette.text.secondary}
                        >
                            {kindLabel(kind)}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}

function MeshTable(props: { tree: MeshTree; width: number; t: MeshTranslate; theme: Theme }): React.JSX.Element {
    const { tree, width, t, theme } = props;
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
                    {medium ? <TableCell>{t('tr064_rate')}</TableCell> : null}
                    {full ? <TableCell>{t('tr064_mac')}</TableCell> : null}
                    {full ? <TableCell>{t('tr064_ip')}</TableCell> : null}
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
                            {row.name}
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
                            <TableCell>{row.connected ? t('tr064_connected') : t('tr064_disconnected')}</TableCell>
                        ) : null}
                        {medium ? <TableCell sx={{ whiteSpace: 'nowrap' }}>{rate(row)}</TableCell> : null}
                        {full ? <TableCell sx={{ fontFamily: 'monospace' }}>{row.mac}</TableCell> : null}
                        {full ? <TableCell>{row.ip || ''}</TableCell> : null}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

/**
 * Mesh topology with toolbar, graph and table - see the README of `src-shared`
 *
 * @param props
 */
export default function MeshView(props: MeshViewProps): React.JSX.Element {
    const { data, loading, error, onRefresh, t, compact, height } = props;
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
        return layoutMesh(roots, graphWidth);
    }, [tree, graphWidth]);

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
                                {layout.cards.map(card => renderCard(card, theme, t))}
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
        </Box>
    );

    return theme === outerTheme ? view : <ThemeProvider theme={theme}>{view}</ThemeProvider>;
}
