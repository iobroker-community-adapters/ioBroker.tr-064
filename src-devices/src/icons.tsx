// The icons of the tile, taken from the MUI icons of the host (`@iobroker/dm-widgets` bridge).

import type { ComponentType, JSX } from 'react';
import { MuiIcons, MuiMaterial, React } from '@iobroker/dm-widgets';
import type { BoxProps, SvgIconProps } from '@mui/material';

const Box: ComponentType<BoxProps> = MuiMaterial?.Box;

export type GlyphProps = Pick<SvgIconProps, 'sx' | 'className'>;

/**
 * An icon of the host's `@mui/icons-material`, with a text glyph as fallback: rendering
 * `undefined` as a component would tear down the whole category of the dashboard.
 */
function bridgedIcon(name: string, glyph: string): ComponentType<GlyphProps> {
    const Component = (MuiIcons as Record<string, ComponentType<GlyphProps>> | undefined)?.[name];
    if (Component) {
        return Component;
    }
    return function GlyphIcon({ sx }: GlyphProps): JSX.Element {
        return (
            <Box
                component="span"
                sx={{ lineHeight: 1, display: 'inline-flex', ...(sx as object) }}
            >
                {glyph}
            </Box>
        );
    };
}

export const RouterIcon = bridgedIcon('RouterOutlined', '⌂');
export const RingingIcon = bridgedIcon('RingVolume', '☎');
export const DownIcon = bridgedIcon('SouthRounded', '↓');
export const UpIcon = bridgedIcon('NorthRounded', '↑');
export const WlanIcon = bridgedIcon('Wifi', '≋');
export const WlanOffIcon = bridgedIcon('WifiOff', '≋');
export const VoicemailIcon = bridgedIcon('Voicemail', '✉');
export const MissedCallIcon = bridgedIcon('PhoneMissed', '☏');
export const GlobeIcon = bridgedIcon('Public', '◍');
export const MeshIcon = bridgedIcon('Hub', '⌘');
export const CloseIcon = bridgedIcon('Close', '✕');
export const ChevronIcon = bridgedIcon('ChevronRight', '›');
