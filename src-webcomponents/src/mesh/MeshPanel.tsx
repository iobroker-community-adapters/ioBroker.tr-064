/**
 * The mesh topology without MUI: the same data (`useMeshLoader()`) and tree (`buildTree()`, `layoutTree()`) as
 * `src-shared/MeshView.tsx`, drawn with HTML and CSS.
 *
 * It measures nothing: the stack of cards fills any width, and the tree of `layoutTree()` - which has a fixed size -
 * replaces it by a container query wherever it fits. The table drops columns by container queries as well.
 */
import { useMemo, useState, type CSSProperties, type JSX } from 'react';

import { useMeshLoader, MESH_ERROR_NOT_ALIVE, type MeshSocket } from '../../../src-shared/meshApi';
import {
    buildTree,
    chipHeight,
    CHIP_H_VENDOR,
    layoutTree,
    linkKind,
    mbit,
    signalLevel,
    signalOf,
    STACK_INDENT,
    type ClientView,
    type InfraView,
    type LinkKind,
    type TableRow,
} from '../../../src-shared/meshLayout';
import type { MeshLinkInfo, MeshNodeInfo } from '../../../src-shared/types';
import { deviceIconName, Icon } from '../icons';
import { Loading, meshErrorText } from '../ui';
import type { Translate } from '../words';

/** Colors of the bands, the same as in `MeshView` - in light and dark */
const KIND_COLORS: Record<LinkKind, string> = {
    2.4: '#f59e0b',
    5: '#3b82f6',
    6: '#8b5cf6',
    LAN: '#10b981',
    other: '#9ca3af',
};

/** A signal below -80 dBm, or one which the box itself calls too far away */
const WEAK_COLOR = '#ef4444';

export type MeshViewMode = 'graph' | 'table';

/** What the toolbar switches; the settings of the component give the values to start with */
export interface MeshViewOptions {
    view: MeshViewMode;
    onlyConfigured: boolean;
    showDisconnected: boolean;
    showVendor: boolean;
}

export interface MeshPanelProps {
    /** `null` pauses the refresh */
    socket: MeshSocket | null;
    /** e.g. `tr-064.0` */
    instanceId: string;
    /** Seconds between two refreshes, 0 = once */
    interval: number;
    t: Translate;
    /** The editor of the host: nothing reacts to clicks */
    disabled: boolean;
    initial: MeshViewOptions;
    /** Above the toolbar */
    title?: string;
    /** In a dialog of the host: the content decides the height */
    inDialog?: boolean;
    /**
     * Asks for the new name of a device and renames it with `rename` (`renameDevice()`). Without it, or if the box
     * cannot rename (`canRename`), nothing offers to rename
     */
    onRename?: (node: MeshNodeInfo, rename: (mac: string, name: string) => Promise<string | undefined>) => void;
}

/** CSS variables of an element, typed for `style` */
function vars(values: Record<string, string | number>): CSSProperties {
    return values;
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

function vendorText(info: { vendor?: string; randomMac?: boolean }, t: Translate): string {
    return info.vendor || (info.randomMac ? t('tr064_randomMac') : '');
}

function signalColor(kind: LinkKind | '', rcpi: number, position?: MeshNodeInfo['position']): string {
    return signalLevel(rcpi) === 1 || position === 'too_far' ? WEAK_COLOR : KIND_COLORS[kind || 'other'];
}

function lastSeenText(lastConnected: number | undefined, t: Translate): string {
    return lastConnected ? t('tr064_lastSeen', new Date(lastConnected).toLocaleString()) : '';
}

function signalDetails(
    link: Pick<MeshLinkInfo, 'rcpiFrom' | 'rcpiTo' | 'rsniFrom' | 'rsniTo'> | undefined,
    position: MeshNodeInfo['position'],
    t: Translate,
): string[] {
    const lines: string[] = [];
    const dash = (value?: number): string => (value === undefined ? '–' : String(value));
    if (link?.rcpiTo !== undefined || link?.rcpiFrom !== undefined) {
        lines.push(t('tr064_signalTooltip', dash(link.rcpiTo), dash(link.rcpiFrom)));
    }
    if (link?.rsniTo !== undefined || link?.rsniFrom !== undefined) {
        lines.push(t('tr064_noiseTooltip', dash(link.rsniTo), dash(link.rsniFrom)));
    }
    if (position === 'too_far' || position === 'too_close') {
        lines.push(t(`tr064_position_${position}`));
    }
    return lines;
}

/** Four bars like a WLAN symbol, the bars above the level faint */
function SignalBars(props: { rcpi: number }): JSX.Element {
    const level = signalLevel(props.rcpi);
    return (
        <svg
            viewBox="0 0 13 11"
            aria-hidden="true"
        >
            {[0, 1, 2, 3].map(i => {
                const height = 3 + i * 2.5;
                return (
                    <rect
                        key={i}
                        x={i * 3.3}
                        y={11 - height}
                        width={2.4}
                        height={height}
                        rx={0.8}
                        opacity={i < level ? 1 : 0.22}
                    />
                );
            })}
        </svg>
    );
}

function Signal(props: { rcpi: number; kind: LinkKind | ''; position?: MeshNodeInfo['position'] }): JSX.Element {
    return (
        <span
            className="signal"
            style={vars({ '--signal': signalColor(props.kind, props.rcpi, props.position) })}
        >
            <SignalBars rcpi={props.rcpi} />
            {`${props.rcpi} dBm`}
        </span>
    );
}

/** What the cards need besides the topology */
interface CardContext {
    t: Translate;
    showVendor: boolean;
    /** Opens the rename dialog; missing if renaming is not possible */
    rename?: (node: MeshNodeInfo) => void;
}

function linkText(link: MeshLinkInfo, t: Translate): { label: string; details: string } {
    const kind = linkKind(link);
    const connected = link.state?.toUpperCase() === 'CONNECTED';
    const label = [kindLabel(kind) || link.type, connected && link.curDown ? `${mbit(link.curDown)} Mbit/s` : '']
        .filter(Boolean)
        .join(' · ');
    const details = [
        `${link.interface || link.type} - ${connected ? t('tr064_connected') : t('tr064_disconnected')}`,
        link.curDown || link.curUp ? t('tr064_rateTooltip', mbit(link.curDown), mbit(link.curUp)) : '',
        ...signalDetails(link, undefined, t),
        connected ? '' : lastSeenText(link.lastConnected, t),
    ].filter(Boolean);
    return { label, details: details.join('\n') };
}

function Chip(props: { client: ClientView; ctx: CardContext }): JSX.Element {
    const { client, ctx } = props;
    const { t } = ctx;
    const node = client.node;
    const kind = linkKind(client.link);
    const configured = !!node.configured;
    const name = node.configured || node.name || node.mac;
    const manufacturer = ctx.showVendor ? vendorText(node, t) : '';
    const signal = client.connected ? signalOf(client.link) : undefined;
    const rename = ctx.rename;
    const details = [
        configured ? t('tr064_configuredAs', node.configured!) : '',
        node.name,
        vendorText(node, t),
        node.mac,
        node.ip,
        client.link ? client.link.interface || client.link.type : '',
        client.connected ? t('tr064_connected') : t('tr064_disconnected'),
        client.link && (client.link.curDown || client.link.curUp)
            ? t('tr064_rateTooltip', mbit(client.link.curDown), mbit(client.link.curUp))
            : '',
        ...(client.connected ? signalDetails(client.link, node.position, t) : []),
        client.connected ? '' : lastSeenText(client.link?.lastConnected, t),
        rename ? t('tr064_clickToRename') : '',
    ].filter(Boolean);
    return (
        <div
            className={`chip${configured ? ' configured' : ''}${client.connected ? '' : ' off'}${rename ? ' clickable' : ''}`}
            style={vars({ '--kind': KIND_COLORS[kind] })}
            title={details.join('\n')}
            onClick={rename ? () => rename(node) : undefined}
        >
            <span className="chip-icon">
                <Icon name={deviceIconName(node.deviceClass)} />
            </span>
            <div className="chip-text">
                <div className="chip-name ellipsis">{name}</div>
                {manufacturer || node.ip ? (
                    <div className="chip-line muted">
                        {manufacturer ? <span className="vendor ellipsis">{manufacturer}</span> : null}
                        {node.ip ? <span className="ip ellipsis">{`IP: ${node.ip}`}</span> : null}
                    </div>
                ) : null}
            </div>
            <div className="chip-side">
                <span className="muted">{kindLabel(kind)}</span>
                {signal === undefined ? null : (
                    <Signal
                        rcpi={signal}
                        kind={kind}
                        position={node.position}
                    />
                )}
            </div>
        </div>
    );
}

function Card(props: {
    view: InfraView;
    ctx: CardContext;
    /** The tree: position and columns of `layoutTree()` */
    place?: { x: number; y: number; w: number; h: number; columns: number };
}): JSX.Element {
    const { view, ctx, place } = props;
    const { t } = ctx;
    const node = view.node;
    const title = node ? node.name || node.mac : t('tr064_notAssigned');
    const role = node ? t(`tr064_role_${node.role}`) : '';
    const model = node?.model && node.model !== node.name ? node.model : '';
    const vendor = node && ctx.showVendor ? vendorText(node, t) : '';
    const subtitle = [model || vendor, node?.ip || '', role].filter(Boolean).join(' · ');
    // the box itself is not renamed with the name of a device of the home network
    const rename = node && node.role !== 'master' && node.mac ? ctx.rename : undefined;
    const count = view.clients.length;
    const countText = count === 1 ? t('tr064_oneDevice') : count ? t('tr064_devices', count) : '';
    const chipH = chipHeight(view, ctx.showVendor);
    const kind = view.uplink ? linkKind(view.uplink) : 'other';
    const off = !!view.uplink && view.uplink.state?.toUpperCase() !== 'CONNECTED';
    const classes = ['card'];
    if (node?.role === 'master') {
        classes.push('master');
    }
    if (!node) {
        classes.push('unassigned');
    }
    if (view.uplink) {
        classes.push('linked');
    }
    if (off) {
        classes.push('off');
    }
    const style: Record<string, string | number> = { '--kind': KIND_COLORS[kind] };
    if (place) {
        Object.assign(style, { left: place.x, top: place.y, width: place.w, height: place.h, '--cols': place.columns });
    }
    return (
        <div
            className={classes.join(' ')}
            style={vars(style)}
        >
            <div
                className="card-header"
                title={[title, node?.model, node ? vendorText(node, t) : '', node?.mac, node?.ip]
                    .filter(Boolean)
                    .join('\n')}
            >
                <div className="card-head">
                    <span
                        className={`card-title ellipsis${rename ? ' clickable' : ''}`}
                        title={rename ? t('tr064_clickToRename') : undefined}
                        onClick={rename && node ? () => rename(node) : undefined}
                    >
                        {title}
                    </span>
                    <span className="card-count muted">{countText}</span>
                </div>
                <div className="card-sub muted ellipsis">{subtitle}</div>
            </div>
            {count ? (
                <div
                    className={`chips${chipH >= CHIP_H_VENDOR ? ' three' : ''}`}
                    style={vars({ '--chip-h': `${chipH}px` })}
                >
                    {view.clients.map(client => (
                        <Chip
                            key={client.node.uid}
                            client={client}
                            ctx={ctx}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** Every card below the previous one, indented by its depth, the uplink above it */
function Stack(props: { roots: InfraView[]; ctx: CardContext }): JSX.Element {
    const items: JSX.Element[] = [];
    const add = (view: InfraView, depth: number): void => {
        const uplink = view.uplink ? linkText(view.uplink, props.ctx.t) : null;
        items.push(
            <div
                key={view.node?.uid || 'unassigned'}
                className="stack-item"
                style={{ marginLeft: `min(${depth * STACK_INDENT}px, ${depth * 6}cqi)` }}
            >
                {uplink && view.uplink ? (
                    <div
                        className="uplink muted"
                        title={uplink.details}
                    >
                        <span
                            className="mark"
                            style={vars({ '--kind': KIND_COLORS[linkKind(view.uplink)] })}
                        />
                        {uplink.label}
                    </div>
                ) : null}
                <Card
                    view={view}
                    ctx={props.ctx}
                />
            </div>,
        );
        view.children.forEach(child => add(child, depth + 1));
    };
    props.roots.forEach(root => add(root, 0));
    return <div className="graph-stack">{items}</div>;
}

/** The cards where `layoutTree()` puts them, the links as SVG behind them */
function Tree(props: { roots: InfraView[]; ctx: CardContext }): JSX.Element {
    const layout = layoutTree(props.roots, props.ctx.showVendor);
    return (
        <div
            className="graph-tree"
            style={{ width: layout.width, height: layout.height }}
        >
            <svg
                width={layout.width}
                height={layout.height}
                aria-hidden="true"
            >
                {layout.edges.map((edge, i) => {
                    const kind = linkKind(edge.link);
                    const connected = edge.link.state?.toUpperCase() === 'CONNECTED';
                    const text = linkText(edge.link, props.ctx.t);
                    return (
                        <g key={i}>
                            <title>{text.details}</title>
                            <path
                                d={edge.d}
                                fill="none"
                                stroke={KIND_COLORS[kind]}
                                strokeWidth={2.5}
                                strokeDasharray={connected ? undefined : '6 4'}
                            />
                            <text
                                className="edge-label"
                                x={edge.labelX}
                                y={edge.labelY}
                            >
                                {text.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {layout.cards.map(card => (
                <Card
                    key={card.view.node?.uid || 'unassigned'}
                    view={card.view}
                    ctx={props.ctx}
                    place={card}
                />
            ))}
        </div>
    );
}

function Graph(props: { roots: InfraView[]; ctx: CardContext }): JSX.Element {
    // the width of the tree decides where it replaces the stack; +2 for the border of the scroll area
    const width = layoutTree(props.roots, props.ctx.showVendor).width;
    return (
        <>
            <style>{`@container mesh (min-width: ${Math.ceil(width) + 2}px) { .graph-stack { display: none; } .graph-tree { display: block; } }`}</style>
            <Stack {...props} />
            <Tree {...props} />
        </>
    );
}

function MeshTable(props: { rows: TableRow[]; ctx: CardContext; nodes: MeshNodeInfo[] }): JSX.Element {
    const { rows, ctx } = props;
    const { t } = ctx;
    const rename = ctx.rename;
    return (
        <table className="mesh-table">
            <thead>
                <tr>
                    <th>{t('tr064_device')}</th>
                    <th className="medium">{t('tr064_accessPoint')}</th>
                    <th>{t('tr064_connection')}</th>
                    <th className="medium">{t('tr064_state')}</th>
                    <th className="medium">{t('tr064_signal')}</th>
                    <th className="medium">{t('tr064_rate')}</th>
                    <th className="full">{t('tr064_mac')}</th>
                    <th className="full">{t('tr064_ip')}</th>
                    {rename ? <th /> : null}
                </tr>
            </thead>
            <tbody>
                {rows.map(row => {
                    const node = props.nodes.find(item => item.uid === row.uid);
                    const vendor = ctx.showVendor ? vendorText(row, t) : '';
                    const rate =
                        row.connected && (row.curDown || row.curUp)
                            ? `↓ ${mbit(row.curDown)} / ↑ ${mbit(row.curUp)}`
                            : '';
                    return (
                        <tr
                            key={row.uid}
                            className={`${row.connected ? '' : 'off'}${row.configured ? ' configured' : ''}`}
                        >
                            <td
                                className="device"
                                title={row.configured && row.hostName !== row.name ? row.hostName : undefined}
                            >
                                <div
                                    className="device-name"
                                    style={vars({ '--kind': row.kind ? KIND_COLORS[row.kind] : 'currentColor' })}
                                >
                                    <Icon name={deviceIconName(row.deviceClass)} />
                                    <span>{row.name}</span>
                                </div>
                                {vendor ? <div className="sub muted vendor">{vendor}</div> : null}
                                <div className="sub muted narrow-only">
                                    {[
                                        row.accessPoint || t('tr064_notAssigned'),
                                        row.connected ? '' : t('tr064_disconnected'),
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </div>
                            </td>
                            <td className="medium">{row.accessPoint || t('tr064_notAssigned')}</td>
                            <td className="nowrap">
                                {row.kind ? (
                                    <span className="kind">
                                        <span
                                            className="mark"
                                            style={vars({ '--kind': KIND_COLORS[row.kind] })}
                                        />
                                        {kindLabel(row.kind) || row.type}
                                    </span>
                                ) : null}
                            </td>
                            <td className="medium">
                                {row.connected ? t('tr064_connected') : t('tr064_disconnected')}
                                {!row.connected && row.lastConnected ? (
                                    <div className="sub muted">{lastSeenText(row.lastConnected, t)}</div>
                                ) : null}
                            </td>
                            <td className="medium nowrap">
                                {row.connected && row.rcpi !== undefined ? (
                                    <Signal
                                        rcpi={row.rcpi}
                                        kind={row.kind}
                                        position={row.position}
                                    />
                                ) : null}
                                {row.connected && (row.position === 'too_far' || row.position === 'too_close') ? (
                                    <div className={`sub ${row.position === 'too_far' ? 'warn' : 'muted'}`}>
                                        {t(`tr064_position_${row.position}`)}
                                    </div>
                                ) : null}
                            </td>
                            <td className="medium nowrap">{rate}</td>
                            <td className="full mac">{row.mac}</td>
                            <td className="full">{row.ip || ''}</td>
                            {rename ? (
                                <td>
                                    {node ? (
                                        <button
                                            type="button"
                                            className="icon-button"
                                            title={t('tr064_rename')}
                                            aria-label={t('tr064_rename')}
                                            onClick={() => rename(node)}
                                        >
                                            <Icon name="Edit" />
                                        </button>
                                    ) : null}
                                </td>
                            ) : null}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function Legend(): JSX.Element {
    return (
        <span className="mesh-legend muted">
            {(['2.4', '5', '6', 'LAN'] as LinkKind[]).map(kind => (
                <span key={kind}>
                    <span
                        className="mark"
                        style={vars({ '--kind': KIND_COLORS[kind] })}
                    />
                    {kindLabel(kind)}
                </span>
            ))}
        </span>
    );
}

/**
 * Toolbar, graph or table of the mesh topology of one instance, refreshed every `interval` seconds
 *
 * @param props properties
 */
export function MeshPanel(props: MeshPanelProps): JSX.Element {
    const { t, disabled, initial } = props;
    const loader = useMeshLoader(props.socket, props.instanceId, props.interval);
    const [options, setOptions] = useState<MeshViewOptions>(initial);
    // new settings of the host (a new `initial`) replace what the toolbar switched
    const [lastInitial, setLastInitial] = useState(initial);
    if (lastInitial !== initial) {
        setLastInitial(initial);
        setOptions(initial);
    }
    const { data, loading, error } = loader;
    const tree = useMemo(
        () =>
            data
                ? buildTree(data, {
                      onlyConfigured: options.onlyConfigured,
                      showDisconnected: options.showDisconnected,
                  })
                : null,
        [data, options.onlyConfigured, options.showDisconnected],
    );
    const onRename = props.onRename;
    const ctx: CardContext = {
        t,
        showVendor: options.showVendor,
        rename:
            onRename && data?.canRename && !disabled
                ? (node: MeshNodeInfo) => onRename(node, loader.rename)
                : undefined,
    };

    const checkbox = (key: 'onlyConfigured' | 'showDisconnected' | 'showVendor', label: string): JSX.Element => (
        <label className={disabled ? 'disabled' : undefined}>
            <input
                type="checkbox"
                checked={options[key]}
                disabled={disabled}
                onChange={e => setOptions({ ...options, [key]: e.target.checked })}
            />
            <span>{label}</span>
        </label>
    );
    const viewButton = (view: MeshViewMode, label: string, icon: 'AccountTree' | 'TableRows'): JSX.Element => (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={options.view === view}
            disabled={disabled}
            onClick={() => setOptions({ ...options, view })}
        >
            <Icon name={icon} />
        </button>
    );

    let content: JSX.Element;
    if (error && (error === MESH_ERROR_NOT_ALIVE || !data)) {
        const alert = meshErrorText(error, t);
        content = <div className={`alert ${alert.severity}`}>{alert.text}</div>;
    } else if (!data || !tree) {
        content = (
            <div className="mesh-state">
                <Loading />
            </div>
        );
    } else {
        const warning = error ? meshErrorText(error, t) : null;
        const roots: InfraView[] = [...tree.roots];
        if (tree.unassigned.length) {
            roots.push({ clients: tree.unassigned, children: [] });
        }
        content = (
            <>
                {warning ? <div className={`alert ${warning.severity}`}>{warning.text}</div> : null}
                {!roots.length ? (
                    <div className="alert info">{t('tr064_noData')}</div>
                ) : (
                    <div className="mesh-scroll">
                        {options.view === 'table' ? (
                            <MeshTable
                                rows={tree.rows}
                                ctx={ctx}
                                nodes={data.nodes}
                            />
                        ) : (
                            <Graph
                                roots={roots}
                                ctx={ctx}
                            />
                        )}
                    </div>
                )}
            </>
        );
    }

    return (
        <div className={`mesh${props.inDialog ? ' in-dialog' : ''}`}>
            {props.title ? <div className="mesh-title ellipsis">{props.title}</div> : null}
            <div className="mesh-toolbar">
                <button
                    type="button"
                    className="icon-button"
                    title={t('tr064_refresh')}
                    aria-label={t('tr064_refresh')}
                    disabled={disabled || loading}
                    onClick={loader.refresh}
                >
                    <Icon name="Refresh" />
                </button>
                {checkbox('onlyConfigured', t('tr064_onlyConfigured'))}
                {checkbox('showDisconnected', t('tr064_showDisconnected'))}
                {checkbox('showVendor', t('tr064_showVendor'))}
                <span className="mesh-switch">
                    {viewButton('graph', t('tr064_graph'), 'AccountTree')}
                    {viewButton('table', t('tr064_table'), 'TableRows')}
                </span>
                <span className="grow" />
                <Legend />
                {data?.ts ? (
                    <span className="mesh-updated muted">
                        {t('tr064_updated', new Date(data.ts).toLocaleTimeString())}
                    </span>
                ) : null}
            </div>
            {content}
        </div>
    );
}
