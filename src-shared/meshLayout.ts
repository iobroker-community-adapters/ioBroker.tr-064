/**
 * Converts the mesh topology of the adapter into a tree and computes the positions of the SVG.
 *
 * The infrastructure (the master box, repeaters and switches) forms a tree by its links, every
 * client is shown as a chip inside the card of the node it is connected to.
 */
import type { MeshLinkInfo, MeshNodeInfo, MeshResponse } from './types';

/** Connection kind of a link, used for colors and labels */
export type LinkKind = '2.4' | '5' | '6' | 'LAN' | 'other';

export interface ClientView {
    node: MeshNodeInfo;
    link?: MeshLinkInfo;
    connected: boolean;
}

export interface InfraView {
    /** Undefined for the pseudo card of the clients without access point */
    node?: MeshNodeInfo;
    /** Link to the parent node */
    uplink?: MeshLinkInfo;
    clients: ClientView[];
    children: InfraView[];
}

export interface TableRow {
    uid: string;
    name: string;
    hostName: string;
    configured: boolean;
    accessPoint: string;
    kind: LinkKind | '';
    type: string;
    connected: boolean;
    curRx?: number;
    curTx?: number;
    mac: string;
    ip?: string;
}

export interface MeshTree {
    roots: InfraView[];
    unassigned: ClientView[];
    rows: TableRow[];
    /** Number of clients before filtering */
    total: number;
}

export interface TreeOptions {
    onlyConfigured: boolean;
    showDisconnected: boolean;
}

/**
 * Band or LAN of a link, from `band` or the name of the interface (`AP:2G:0`, `AP:5G:1`, `LAN:1`)
 *
 * @param link
 */
export function linkKind(link?: MeshLinkInfo): LinkKind {
    if (!link) {
        return 'other';
    }
    if (link.band) {
        return link.band;
    }
    const name = (link.interface || '').toUpperCase();
    if (/(^|:)2(G|,4|\.4)/.test(name)) {
        return '2.4';
    }
    if (/(^|:)5G/.test(name)) {
        return '5';
    }
    if (/(^|:)6G/.test(name)) {
        return '6';
    }
    if ((link.type || '').toUpperCase() === 'LAN' || name.startsWith('LAN') || name.startsWith('ETH')) {
        return 'LAN';
    }
    return 'other';
}

function isConnected(link?: MeshLinkInfo): boolean {
    return !!link && (link.state || '').toUpperCase() === 'CONNECTED';
}

/**
 * A connected link wins over a disconnected one, otherwise the first one stays
 *
 * @param current
 * @param candidate
 */
function better(current: MeshLinkInfo | undefined, candidate: MeshLinkInfo): MeshLinkInfo {
    if (!current) {
        return candidate;
    }
    return !isConnected(current) && isConnected(candidate) ? candidate : current;
}

function clientName(node: MeshNodeInfo): string {
    return node.configured || node.name || node.mac || node.uid;
}

function compareClients(a: ClientView, b: ClientView): number {
    if (!!a.node.configured !== !!b.node.configured) {
        return a.node.configured ? -1 : 1;
    }
    if (a.connected !== b.connected) {
        return a.connected ? -1 : 1;
    }
    return clientName(a.node).localeCompare(clientName(b.node));
}

/**
 * Builds the tree of the infrastructure with its clients and the rows of the table
 *
 * @param response
 * @param options
 */
export function buildTree(response: MeshResponse | null, options: TreeOptions): MeshTree {
    const nodes = response?.nodes || [];
    const links = response?.links || [];
    const byUid = new Map<string, MeshNodeInfo>();
    nodes.forEach(node => byUid.set(node.uid, node));

    const isInfra = (uid: string): boolean => {
        const role = byUid.get(uid)?.role;
        return !!role && role !== 'client';
    };

    const uplinks = new Map<string, MeshLinkInfo>();
    const clientLinks = new Map<string, MeshLinkInfo>();

    for (const link of links) {
        if (!byUid.has(link.from) || !byUid.has(link.to) || link.from === link.to) {
            continue;
        }
        if (isInfra(link.from) && isInfra(link.to)) {
            // `from` is the upstream side
            uplinks.set(link.to, better(uplinks.get(link.to), link));
        } else if (isInfra(link.from)) {
            clientLinks.set(link.to, better(clientLinks.get(link.to), link));
        } else if (isInfra(link.to)) {
            // a link in the other direction: the access point is `to`
            const swapped: MeshLinkInfo = { ...link, from: link.to, to: link.from };
            clientLinks.set(link.from, better(clientLinks.get(link.from), swapped));
        }
    }

    // the master never has a parent, even if the box reports a link to a repeater the other way round
    const infraNodes = nodes.filter(node => node.role !== 'client');
    infraNodes.forEach(node => node.role === 'master' && uplinks.delete(node.uid));

    const views = new Map<string, InfraView>();
    infraNodes.forEach(node => views.set(node.uid, { node, uplink: uplinks.get(node.uid), clients: [], children: [] }));

    // clients
    let total = 0;
    const unassigned: ClientView[] = [];
    const rows: TableRow[] = [];
    for (const node of nodes) {
        if (node.role !== 'client') {
            continue;
        }
        total++;
        const link = clientLinks.get(node.uid);
        const connected = isConnected(link);
        if (options.onlyConfigured && !node.configured) {
            continue;
        }
        // a configured device is always shown - its absence is the interesting information
        if (!connected && !options.showDisconnected && !node.configured) {
            continue;
        }
        const client: ClientView = { node, link, connected };
        const accessPoint = link ? views.get(link.from) : undefined;
        if (accessPoint) {
            accessPoint.clients.push(client);
        } else {
            unassigned.push(client);
        }
        const kind = link ? linkKind(link) : '';
        rows.push({
            uid: node.uid,
            name: clientName(node),
            hostName: node.name,
            configured: !!node.configured,
            accessPoint: accessPoint?.node?.name || '',
            kind,
            type: link?.type || '',
            connected,
            curRx: link?.curRx,
            curTx: link?.curTx,
            mac: node.mac,
            ip: node.ip,
        });
    }
    views.forEach(view => view.clients.sort(compareClients));
    unassigned.sort(compareClients);
    rows.sort((a, b) => {
        if (a.configured !== b.configured) {
            return a.configured ? -1 : 1;
        }
        if (a.connected !== b.connected) {
            return a.connected ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    // tree of the infrastructure, the master first
    const ordered = [...infraNodes].sort((a, b) => {
        const rank = (n: MeshNodeInfo): number => (n.role === 'master' ? 0 : n.role === 'slave' ? 1 : 2);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    const placed = new Set<string>();
    const roots: InfraView[] = [];
    const attach = (view: InfraView): void => {
        placed.add(view.node!.uid);
        for (const child of ordered) {
            const childView = views.get(child.uid)!;
            if (!placed.has(child.uid) && childView.uplink?.from === view.node!.uid) {
                view.children.push(childView);
                attach(childView);
            }
        }
    };
    for (const node of ordered) {
        const view = views.get(node.uid)!;
        const parent = view.uplink && views.get(view.uplink.from);
        // roots: nodes without parent, and nodes whose parent chain is a cycle
        if (!placed.has(node.uid) && (!parent || node.role === 'master')) {
            roots.push(view);
            attach(view);
        }
    }
    for (const node of ordered) {
        if (!placed.has(node.uid)) {
            const view = views.get(node.uid)!;
            roots.push(view);
            attach(view);
        }
    }

    return { roots, unassigned, rows, total };
}

// ---------------------------------------------------------------------------------------------
// Geometry
//
// Two layouts: `tree` places the cards of the repeaters side by side below their parent (the
// classic view), `stack` places every card below the previous one, indented by its depth. The
// tree is used if it fits into the available width, otherwise the stack - so a phone gets the
// stack and no horizontal scrolling.

export const CHIP_W = 196;
/** Smallest chip in the stack layout - a phone gets one column of readable names */
export const CHIP_MIN_W = 170;
/** Widest chip in the stack layout */
export const CHIP_MAX_W = 360;
export const CHIP_H = 26;
export const GAP = 6;
export const PAD = 10;
export const HEADER_H = 60;
export const CARD_MIN_W = 240;
export const LEVEL_GAP = 76;
export const SIBLING_GAP = 32;
export const MARGIN = 16;
/** Indentation per level and gap between two cards of the stack layout */
export const STACK_INDENT = 22;
export const STACK_GAP = 30;
/** Margin of the stack layout, smaller for a phone */
export const STACK_MARGIN = 8;

export interface PlacedCard {
    view: InfraView;
    x: number;
    y: number;
    w: number;
    h: number;
    columns: number;
    chipW: number;
}

export interface PlacedEdge {
    link: MeshLinkInfo;
    /** SVG path */
    d: string;
    /** Position of the label (band, rate) */
    labelX: number;
    labelY: number;
}

export interface MeshLayout {
    kind: 'tree' | 'stack';
    cards: PlacedCard[];
    edges: PlacedEdge[];
    width: number;
    height: number;
}

/**
 * Columns of the client grid of one card in the tree layout
 *
 * @param count number of clients
 */
export function clientColumns(count: number): number {
    if (count <= 8) {
        return 1;
    }
    if (count <= 20) {
        return 2;
    }
    if (count <= 48) {
        return 3;
    }
    return 4;
}

function cardHeight(count: number, columns: number): number {
    const rows = Math.ceil(count / columns);
    return HEADER_H + (count ? rows * (CHIP_H + GAP) - GAP + PAD : 0);
}

/**
 * Positions of all cards and edges, repeaters side by side below their parent
 *
 * @param roots the trees of the infrastructure
 */
export function layoutTree(roots: InfraView[]): MeshLayout {
    const cards: PlacedCard[] = [];
    const edges: PlacedEdge[] = [];
    const widths = new Map<InfraView, number>();

    const size = (view: InfraView): { w: number; h: number; columns: number } => {
        const count = view.clients.length;
        const columns = clientColumns(count);
        const w = Math.max(CARD_MIN_W, columns * CHIP_W + (columns - 1) * GAP + 2 * PAD);
        return { w, h: cardHeight(count, columns), columns };
    };

    const measure = (view: InfraView): number => {
        const own = size(view).w;
        const children = view.children.reduce((sum, child) => sum + measure(child), 0);
        const width = Math.max(own, children + SIBLING_GAP * Math.max(0, view.children.length - 1));
        widths.set(view, width);
        return width;
    };

    let height = 0;
    const place = (view: InfraView, x0: number, y: number): PlacedCard => {
        const s = size(view);
        const width = widths.get(view)!;
        const card: PlacedCard = {
            view,
            x: x0 + (width - s.w) / 2,
            y,
            w: s.w,
            h: s.h,
            columns: s.columns,
            chipW: CHIP_W,
        };
        cards.push(card);
        height = Math.max(height, y + s.h);

        const childrenWidth =
            view.children.reduce((sum, child) => sum + widths.get(child)!, 0) +
            SIBLING_GAP * Math.max(0, view.children.length - 1);
        let childX = x0 + (width - childrenWidth) / 2;
        for (const child of view.children) {
            const childCard = place(child, childX, y + s.h + LEVEL_GAP);
            if (child.uplink) {
                const x1 = card.x + card.w / 2;
                const y1 = card.y + card.h;
                const x2 = childCard.x + childCard.w / 2;
                const y2 = childCard.y;
                const midY = y1 + (y2 - y1) / 2;
                edges.push({
                    link: child.uplink,
                    d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`,
                    labelX: x2 + 6,
                    labelY: y2 - 10,
                });
            }
            childX += widths.get(child)! + SIBLING_GAP;
        }
        return card;
    };

    let x = MARGIN;
    for (const root of roots) {
        measure(root);
        place(root, x, MARGIN);
        x += widths.get(root)! + SIBLING_GAP * 2;
    }

    return {
        kind: 'tree',
        cards,
        edges,
        width: Math.max(x - SIBLING_GAP * 2 + MARGIN, 0),
        height: height + MARGIN,
    };
}

/**
 * Positions of all cards and edges, every card below the previous one and indented by its depth.
 * The cards and their client grids fill `width`.
 *
 * @param roots the trees of the infrastructure
 * @param width available width in pixels
 */
export function layoutStack(roots: InfraView[], width: number): MeshLayout {
    const cards: PlacedCard[] = [];
    const edges: PlacedEdge[] = [];
    let y = STACK_MARGIN;

    const place = (view: InfraView, depth: number): PlacedCard => {
        const x = STACK_MARGIN + depth * STACK_INDENT;
        const w = Math.max(CHIP_MIN_W + 2 * PAD, width - STACK_MARGIN - x);
        const inner = w - 2 * PAD;
        const count = view.clients.length;
        const columns = Math.max(1, Math.min(count || 1, Math.floor((inner + GAP) / (CHIP_MIN_W + GAP))));
        const chipW = Math.min(CHIP_MAX_W, (inner - (columns - 1) * GAP) / columns);
        const card: PlacedCard = { view, x, y, w, h: cardHeight(count, columns), columns, chipW };
        cards.push(card);
        y += card.h + STACK_GAP;

        // a rail at the left side of the parent, which the indented children do not cover; every
        // child continues it from the junction of the previous one, so the colors do not overlap
        const railX = card.x + STACK_INDENT / 2;
        let railStart = card.y + card.h;
        for (const child of view.children) {
            const childCard = place(child, depth + 1);
            if (child.uplink) {
                const y2 = childCard.y + 24;
                edges.push({
                    link: child.uplink,
                    d: `M ${railX} ${railStart} V ${y2} H ${childCard.x}`,
                    labelX: childCard.x + 4,
                    labelY: childCard.y - 8,
                });
                railStart = y2;
            }
        }
        return card;
    };

    for (const root of roots) {
        place(root, 0);
    }

    return { kind: 'stack', cards, edges, width, height: Math.max(y - STACK_GAP + STACK_MARGIN, 0) };
}

/**
 * The tree layout if it fits into `width`, otherwise the stack layout
 *
 * @param roots the trees of the infrastructure
 * @param width available width in pixels
 */
export function layoutMesh(roots: InfraView[], width: number): MeshLayout {
    const tree = layoutTree(roots);
    return tree.width <= width ? tree : layoutStack(roots, width);
}

/**
 * Characters of a text with `fontSize` which fit into `width` pixels (average width of a character)
 *
 * @param width available width
 * @param fontSize font size in pixels
 * @param bold bold text is wider
 */
export function fittingChars(width: number, fontSize: number, bold = false): number {
    return Math.max(3, Math.floor(width / (fontSize * (bold ? 0.62 : 0.56))));
}

/**
 * Shortens a text for an SVG element of a fixed width
 *
 * @param text
 * @param maxChars
 */
export function ellipsis(text: string, maxChars: number): string {
    return text.length > maxChars ? `${text.substring(0, Math.max(1, maxChars - 1))}…` : text;
}

/**
 * kbit/s as Mbit/s
 *
 * @param kbit
 */
export function mbit(kbit?: number): string {
    if (!kbit) {
        return '–';
    }
    const value = kbit / 1000;
    return value >= 10 ? Math.round(value).toString() : value.toFixed(1);
}
