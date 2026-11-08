/**
 * The styles every component of tr-064 shares, put into its shadow root before the styles of the component.
 *
 * The element is transparent and inherits `color` and `font` of the host; secondary text is the inherited color
 * with less opacity, so it fits every background. Colors of the theme come from the variables `--iob-*` which the
 * base class sets on the element (and `showElementDialog()` on the content of a dialog).
 *
 * `.mount` is the size container (`container-type: size`): the components lay themselves out with container
 * queries and `cqi`/`cqmin` instead of measuring.
 */
export const BASE_CSS = `
:host {
    display: block;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
}
*, *::before, *::after {
    box-sizing: border-box;
}
.mount {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    container-type: size;
    -webkit-tap-highlight-color: transparent;
}
.dialog-content {
    font-family: var(--iob-font-family, inherit);
    color: var(--iob-text, inherit);
}
.muted { color: color-mix(in srgb, currentColor 64%, transparent); }
.faint { color: color-mix(in srgb, currentColor 38%, transparent); }
.ellipsis {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.icon {
    display: inline-block;
    flex: 0 0 auto;
    width: 1em;
    height: 1em;
    fill: currentColor;
}
.hint {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    text-align: center;
    font-size: clamp(11px, 6cqmin, 14px);
    line-height: 1.35;
    color: color-mix(in srgb, currentColor 64%, transparent);
    overflow: hidden;
}
.hint .icon { font-size: clamp(20px, 16cqmin, 36px); opacity: 0.7; }
.spinner {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--iob-primary, currentColor) 22%, transparent);
    border-top-color: var(--iob-primary, currentColor);
    animation: tr064-spin 0.9s linear infinite;
}
@keyframes tr064-spin {
    to { transform: rotate(360deg); }
}
.alert {
    padding: 8px 12px;
    border-radius: var(--iob-border-radius, 4px);
    border-left: 3px solid var(--iob-warning, #ed6c02);
    background: color-mix(in srgb, var(--iob-warning, #ed6c02) 14%, transparent);
    font-size: 13px;
    line-height: 1.4;
}
.alert.info {
    border-left-color: var(--iob-info, #0288d1);
    background: color-mix(in srgb, var(--iob-info, #0288d1) 14%, transparent);
}
.alert.error {
    border-left-color: var(--iob-error, #d32f2f);
    background: color-mix(in srgb, var(--iob-error, #d32f2f) 14%, transparent);
}
button {
    font: inherit;
    color: inherit;
}
.icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 5px;
    border: 0;
    border-radius: 50%;
    background: none;
    font-size: 18px;
    cursor: pointer;
}
.icon-button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 10%, transparent); }
.icon-button:disabled { opacity: 0.4; cursor: default; }
.text-button {
    padding: 6px 14px;
    border: 0;
    border-radius: var(--iob-border-radius, 4px);
    background: var(--iob-primary, #3399cc);
    color: var(--iob-primary-contrast, #fff);
    font-weight: 600;
    cursor: pointer;
}
.text-button.secondary {
    background: color-mix(in srgb, currentColor 10%, transparent);
    color: inherit;
}
:focus-visible {
    outline: 2px solid var(--iob-primary, currentColor);
    outline-offset: 1px;
}
.clickable { cursor: pointer; }
.edit .clickable { cursor: default; }
`;
