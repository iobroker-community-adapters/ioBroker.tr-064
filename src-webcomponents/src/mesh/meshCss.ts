/**
 * Styles of `MeshPanel`: the mesh component and the dialog of the FRITZ!Box component.
 *
 * The scroll area is the container `mesh`: the table drops columns by its width, and the graph shows the tree of
 * `layoutTree()` only where it fits (a rule `MeshPanel` writes with the width of the tree) - otherwise the stack,
 * whose cards fill the width.
 */
import { CHIP_W, GAP, HEADER_H, PAD } from '../../../src-shared/meshLayout';

export const MESH_CSS = `
.mesh {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-height: 0;
    font-size: 13px;
}
.mesh-title { font-weight: 600; font-size: 15px; flex: 0 0 auto; }
.mesh-toolbar {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    font-size: 13px;
}
.mesh-toolbar label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    white-space: nowrap;
}
.mesh-toolbar input { margin: 0; accent-color: var(--iob-primary); }
.mesh-toolbar .grow { flex: 1 1 auto; }
.mesh-switch {
    display: inline-flex;
    border: 1px solid var(--iob-divider);
    border-radius: var(--iob-border-radius, 4px);
    overflow: hidden;
}
.mesh-switch button {
    display: inline-flex;
    padding: 4px 8px;
    border: 0;
    background: none;
    font-size: 16px;
    cursor: pointer;
}
.mesh-switch button[aria-pressed='true'] {
    background: color-mix(in srgb, var(--iob-primary) 18%, transparent);
    color: var(--iob-primary);
}
.mesh-switch button:disabled, .mesh-toolbar label.disabled { cursor: default; opacity: 0.6; }
.mesh-legend { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12px; }
.mark { display: inline-block; flex: 0 0 auto; width: 10px; height: 10px; border-radius: 2px; background: var(--kind); }
.mesh-legend span { display: inline-flex; align-items: center; gap: 4px; }
.mesh-updated { font-size: 12px; }
.mesh-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    container: mesh / inline-size;
    border: 1px solid var(--iob-divider);
    border-radius: calc(2 * var(--iob-border-radius, 4px));
}
.mesh-state { flex: 1 1 auto; min-height: 0; }
/* in a dialog of the host the content decides the height */
.mesh.in-dialog { height: auto; }
.mesh.in-dialog .mesh-scroll { flex: 0 1 auto; max-height: 70vh; }

/* the graph: cards with chips, as a stack (default) or a tree */
.graph-tree { display: none; position: relative; }
.graph-tree > svg { position: absolute; left: 0; top: 0; overflow: visible; }
.graph-tree .card { position: absolute; }
.graph-stack { display: flex; flex-direction: column; gap: 10px; padding: 8px; }
.stack-item { display: flex; flex-direction: column; gap: 4px; }
.uplink { display: flex; align-items: center; gap: 6px; font-size: 11px; padding-left: 2px; }
.card {
    border: 1px solid var(--iob-divider);
    border-radius: 8px;
    background: var(--iob-paper);
    padding: 0 ${PAD}px ${PAD}px;
    min-width: 0;
}
.graph-stack .card.linked { border-left: 4px solid var(--kind); }
.graph-stack .card.linked.off { border-left-style: dashed; }
.card.master { border: 2px solid var(--iob-primary); }
.card.unassigned { border-style: dashed; }
.card-header {
    height: ${HEADER_H}px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-width: 0;
}
.card-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.card-title { flex: 1 1 auto; font-size: 14px; font-weight: 600; }
.card-count { flex: 0 0 auto; font-size: 11px; }
.card-sub { font-size: 11px; }
.chips {
    display: grid;
    gap: ${GAP}px;
    grid-template-columns: repeat(auto-fill, minmax(min(212px, 100%), 1fr));
    grid-auto-rows: var(--chip-h);
}
.graph-tree .chips { grid-template-columns: repeat(var(--cols), ${CHIP_W}px); }
.chip {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 0 8px 0 13px;
    border: 1px solid var(--iob-divider);
    border-radius: 7px;
    background: color-mix(in srgb, currentColor 5%, transparent);
    overflow: hidden;
}
.chip::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--kind); }
.chip.configured { border: 2px solid var(--iob-primary); }
.chip.off { border-style: dashed; opacity: 0.6; }
.chip.configured.off { opacity: 0.85; }
.chip-icon {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--kind);
    background: color-mix(in srgb, var(--kind) 14%, transparent);
}
.chip-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.chip-name { font-size: 12.5px; font-weight: 600; line-height: 1.25; }
.chip.configured .chip-name { font-weight: 700; color: var(--iob-primary); }
.chip-line { display: flex; gap: 8px; font-size: 10px; line-height: 1.3; min-width: 0; }
.chip-line .vendor { flex: 1 1 auto; font-style: italic; opacity: 0.75; }
.chip-line .ip { flex: 0 1 auto; margin-left: auto; }
.chips.three .chip-line { flex-direction: column; gap: 1px; }
.chips.three .chip-line .ip { margin-left: 0; }
.chip-side {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-size: 10px;
}
.signal { display: inline-flex; align-items: center; gap: 4px; color: var(--signal); font-size: 10.5px; white-space: nowrap; }
.signal svg { width: 13px; height: 11px; fill: currentColor; }
.edge-label { font-size: 11px; fill: currentColor; opacity: 0.64; }

/* the table */
.mesh-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mesh-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: left;
    font-weight: 600;
    background: var(--iob-paper);
    white-space: nowrap;
}
.mesh-table th, .mesh-table td { padding: 6px 8px; border-bottom: 1px solid var(--iob-divider); vertical-align: top; }
.mesh-table tr.off { opacity: 0.6; }
.mesh-table .device { overflow-wrap: anywhere; }
.mesh-table .device-name { display: flex; align-items: center; gap: 6px; }
.mesh-table .device-name .icon { font-size: 17px; color: var(--kind, inherit); }
.mesh-table tr.configured .device-name { font-weight: 700; color: var(--iob-primary); }
.mesh-table .sub { font-size: 12px; }
.mesh-table .vendor { font-style: italic; opacity: 0.7; }
.mesh-table .nowrap { white-space: nowrap; }
.mesh-table .mac { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mesh-table .kind { display: flex; align-items: center; gap: 6px; }
.mesh-table .warn { color: var(--iob-warning); }
.mesh-table .narrow-only { display: none; }
@container mesh (max-width: 759.98px) {
    .mesh-table .full { display: none; }
}
@container mesh (max-width: 479.98px) {
    .mesh-table .medium { display: none; }
    .mesh-table .narrow-only { display: block; }
    .mesh-table th, .mesh-table td { padding: 6px 4px; }
}
`;
