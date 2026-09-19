// SIMULATION ONLY (`npm run host-sim`, after `npm run build`) - not part of the federation build.
//
// Loads the BUILT plugin (`build/customDevices.js`) the way ioBroker.devices does it
// (`pluginLoader.ts`): host globals first, then a `@module-federation/runtime` instance that shares
// nothing, `registerRemotes` + `loadRemote('<name>/translations')` and `'<name>/Components'`.
// It shows that the production bundle takes React and MUI from the host - a second React copy
// would fail with "Invalid hook call" as soon as the mesh dialog opens.
import './dev-shim';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance } from '@module-federation/runtime';
import { I18n } from '@iobroker/gui-components';

import App, { type TileClass } from './App';

// ioBroker.devices is itself built with the federation plugin, which creates the global instance;
// here the instance of `createInstance()` is used directly.
const federation = createInstance({ name: 'iobroker_devices', shared: {}, remotes: [] });
federation.registerRemotes([{ name: 'tr_064', entry: `${window.location.origin}/customDevices.js`, type: 'module' }]);

async function start(): Promise<void> {
    const container = document.getElementById('root');
    if (!container) {
        return;
    }
    const root = createRoot(container);
    try {
        const translations = (await federation.loadRemote('tr_064/translations')) as {
            default: Record<ioBroker.Languages, Record<string, string>>;
        };
        I18n.extendTranslations(translations.default);
        const components = (await federation.loadRemote('tr_064/Components')) as { default: Record<string, TileClass> };
        const Remote = components.default.FritzBoxComponent;
        if (!Remote) {
            throw new Error(`FritzBoxComponent not found, available: ${Object.keys(components.default).join(', ')}`);
        }
        root.render(
            <App
                component={Remote}
                banner={`Loaded through module federation: ${window.location.origin}/customDevices.js`}
            />,
        );
    } catch (error) {
        root.render(<pre style={{ color: 'red' }}>{String((error as Error)?.stack || error)}</pre>);
    }
}

void start();
