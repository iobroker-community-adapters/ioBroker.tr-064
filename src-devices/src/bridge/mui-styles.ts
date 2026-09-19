// `@mui/material/styles` of the host - see host.ts. The host shares only `@mui/material`, whose index
// re-exports everything of `./styles`.
import type * as MuiStylesTypes from '@mui/material/styles';

import { hostModule } from './host';

const MuiStyles = hostModule<typeof MuiStylesTypes>('@mui/material');

export const { ThemeProvider, alpha, createTheme, styled, useTheme } = MuiStyles;
