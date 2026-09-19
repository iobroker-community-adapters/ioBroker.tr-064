// SIMULATION ONLY (`npm start`) - not part of the federation build.
//
// ioBroker.devices puts its React, MUI, gui-components and the real `WidgetGeneric` on `window`
// before it loads a plugin (`pluginLoader.ts`); `@iobroker/dm-widgets` and `src/bridge/` read them
// when their modules are evaluated. Here the same globals are filled from the packages of this
// project and from `dev-host.tsx`.
//
// `index.tsx` imports this file FIRST: ES modules are evaluated depth first in import order, so
// the globals exist before the tile (and with it `@iobroker/dm-widgets`) is evaluated.

import * as ReactRuntime from 'react';
import * as ReactDomRuntime from 'react-dom';
import * as MuiMaterial from '@mui/material';
import * as MuiIcons from '@mui/icons-material';
import momentRuntime from 'moment';
import * as AdapterReact from '@iobroker/gui-components';

import * as DevHost from './dev-host';

const shared = {
    react: ReactRuntime,
    'react-dom': ReactDomRuntime,
    // copies: a module namespace object can not be extended by the host code, a plain object can
    '@mui/material': { ...MuiMaterial },
    '@mui/icons-material': { ...MuiIcons },
    moment: momentRuntime,
    '@iobroker/gui-components': AdapterReact,
};

const globals = window as unknown as Record<string, unknown>;
globals.__iobrokerShared__ = shared;
globals.__iobrokerDmWidgets__ = { ...DevHost };

console.log(
    '[dev-shim] host globals ready - Box:',
    typeof shared['@mui/material'].Box,
    'Hub icon:',
    typeof (shared['@mui/icons-material'] as Record<string, unknown>).Hub,
);
