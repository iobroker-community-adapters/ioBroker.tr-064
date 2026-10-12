// Helpers which the tiles of ioBroker.devices share: sizes, frame styles and colors.

import type { SyntheticEvent } from 'react';
import WidgetGeneric, { MuiMaterial } from '@iobroker/dm-widgets';
import type { Theme } from '@mui/material';

export type Size = '1x1' | '2x0.5' | '2x1' | '2x2';

const muiAlpha: (color: string, value: number) => string = MuiMaterial?.alpha;

/** `alpha()` of MUI throws on colors it cannot parse (`red`, CSS variables) - a user color may be one */
export function alpha(color: string, value: number): string {
    try {
        return muiAlpha(color, value);
    } catch {
        return `color-mix(in srgb, ${color} ${Math.round(value * 100)}%, transparent)`;
    }
}

export function stop(e: SyntheticEvent): void {
    e.stopPropagation();
}

/** The sizes of the host plus 2x2 (square, two columns and two rows) */
const sizeIcon = (width: number, height: number): string =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    )}`;

export const SIZE_OPTIONS = [
    { value: '1x1', label: '1×1', icon: sizeIcon(18, 18) },
    { value: '2x1', label: '2×1', icon: sizeIcon(32, 18) },
    { value: '2x0.5', label: '2×½', icon: sizeIcon(32, 12) },
    { value: '2x2', label: '2×2', icon: sizeIcon(32, 32) },
];

/** The outer box of a tile in the grid of the host */
export function tileRootStyle(theme: Theme, size: Size): Record<string, unknown> {
    switch (size) {
        case '2x0.5':
            return WidgetGeneric.getStyleWide(theme) as Record<string, unknown>;
        case '2x1':
            return WidgetGeneric.getStyleWideTall(theme) as Record<string, unknown>;
        case '2x2': {
            const getStyleHuge = (
                WidgetGeneric as unknown as { getStyleHuge?: (theme: Theme) => Record<string, unknown> }
            ).getStyleHuge;
            return getStyleHuge
                ? getStyleHuge(theme)
                : {
                      ...(WidgetGeneric.getStyleCompact(theme) as Record<string, unknown>),
                      gridColumn: 'span 2',
                      gridRow: 'span 2',
                  };
        }
        default:
            return WidgetGeneric.getStyleCompact(theme) as Record<string, unknown>;
    }
}
