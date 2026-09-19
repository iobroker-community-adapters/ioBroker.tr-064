import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/dm-widgets/modulefederation.devices.config.js';
import path from 'node:path';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import pack from './package.json';

/**
 * ioBroker.devices hands React and MUI to its plugins through `window.__iobrokerShared__` and not
 * through the federation share scope (its own federation instance shares nothing). A plugin which
 * imports `react` or `@mui/material` itself therefore gets a second copy - and every hook in it
 * breaks ("Invalid hook call"), MUI components lose the theme of the host.
 *
 * The own components take React/MUI from `@iobroker/dm-widgets` (`React`, `MuiMaterial`, ...), as
 * documented there. The mesh view of `src/shared/` (copied from `src-shared/`, host independent)
 * imports `react` and `@mui/material` directly, so these imports are resolved to the small modules
 * in `src/bridge/`, which export the host instances. The simulation files are left alone: they
 * populate the bridge from the real packages.
 */
const BRIDGE: Record<string, string> = {
    react: 'src/bridge/react.ts',
    '@mui/material': 'src/bridge/mui-material.ts',
    '@mui/material/styles': 'src/bridge/mui-styles.ts',
    '@mui/icons-material': 'src/bridge/mui-icons.ts',
};

/** Files of the standalone simulation - they use the real packages */
const SIMULATION = /\/src\/(dev-[^/]*|App|index|mockData|HostSim|host-sim)\.tsx?$/;

function usesBridge(importer: string): boolean {
    const file = importer.replace(/\\/g, '/').split('?')[0];
    if (file.includes('/node_modules/')) {
        // the compile time stub of WidgetGeneric extends `Component` of `react`
        return file.includes('/node_modules/@iobroker/dm-widgets/');
    }
    return file.includes('/src/') && !file.includes('/src/bridge/') && !SIMULATION.test(file);
}

function hostBridge(): Plugin {
    return {
        name: 'iobroker-devices-host-bridge',
        enforce: 'pre',
        resolveId(source, importer) {
            const target = BRIDGE[source];
            if (!target || !importer || !usesBridge(importer)) {
                return null;
            }
            return path.resolve(__dirname, target);
        },
    };
}

/**
 * Shared through federation: only what the tile imports at runtime. React and MUI come from
 * `window.__iobrokerShared__` (see above); gui-components and moment are used by the simulation
 * only - shared, federation would put a fallback copy of them (> 1.7 MB) into the build.
 */
const SHARED_PACKAGES = ['@iobroker/dm-widgets'];

export default ({ command }: ConfigEnv): UserConfig => ({
    plugins: [
        hostBridge(),
        federation({
            manifest: true,
            // Must be unique across all adapters that deliver widgets to ioBroker.devices.
            name: 'DevicesWidgetTr064Set',
            filename: 'customDevices.js',
            exposes: {
                './Components': './src/Components.tsx',
                './translations': './src/translations',
            },
            remotes: {},
            // `npm start` (serve): the federation plugin evaluates the shared packages before the entry
            // of the page - `@iobroker/dm-widgets` would then read the host globals before
            // `src/dev-shim.ts` set them and render nothing. The simulation does not use federation.
            shared:
                command === 'serve'
                    ? {}
                    : moduleFederationShared(
                          Object.keys(pack.devDependencies).filter(name => SHARED_PACKAGES.includes(name)),
                      ),
            dts: false,
        }),
        react(),
        commonjs(),
    ],
    resolve: {
        tsconfigPaths: true,
    },
    server: {
        port: 3003,
        proxy: {
            '/files': 'http://localhost:8081',
            '/adapter': 'http://localhost:8081',
            '/session': 'http://localhost:8081',
            '/log': 'http://localhost:8081',
            '/lib': 'http://localhost:8081',
        },
    },
    base: './',
    build: {
        // module federation emits top level await, which needs Chrome 89 or newer
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            // not index.html: the page is the simulation (`npm start`), see src/no-page.ts
            input: command === 'build' ? { 'no-page': path.resolve(__dirname, 'src/no-page.ts') } : undefined,
            onwarn(warning, warn): void {
                // Suppress "Module level directives cause errors when bundled" warnings
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
});
