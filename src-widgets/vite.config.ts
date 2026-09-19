import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/types-vis-2/modulefederation.vis.config.js';
import { readFileSync } from 'node:fs';

// The shared modules come from @iobroker/types-vis-2, so they stay in sync with what the vis-2 host
// provides. Passing package.json filters the list down to the packages this widget set really uses.
const pack = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const config = {
    plugins: [
        federation({
            manifest: true,
            // must match `common.visWidgets.vis2Tr064Widgets.name` in io-package.json
            name: 'vis2Tr064Widgets',
            // must match the file name of `common.visWidgets.vis2Tr064Widgets.url` (tr-064/customWidgets.js)
            filename: 'customWidgets.js',
            // every entry of `common.visWidgets.vis2Tr064Widgets.components` plus the translations
            exposes: {
                './Tr064FritzBox': './src/Tr064FritzBox',
                './Tr064Mesh': './src/Tr064Mesh',
                './Tr064Presence': './src/Tr064Presence',
                './translations': './src/translations.ts',
            },
            remotes: {},
            shared: moduleFederationShared(pack),
            dts: false,
        }),
        react(),
    ],
    server: {
        port: 4173,
        proxy: {
            '/_socket': 'http://localhost:8082',
            '/vis.0': 'http://localhost:8082',
            '/adapter': 'http://localhost:8082',
            '/vis': 'http://localhost:8082',
            '/widgets': 'http://localhost:8082/vis',
            '/widgets.html': 'http://localhost:8082/vis',
            '/web': 'http://localhost:8082',
            '/state': 'http://localhost:8082',
        },
    },
    base: './',
    resolve: {
        tsconfigPaths: true,
        // the fallback copies inside the widget bundle must be unique too
        dedupe: ['react', 'react-dom', '@emotion/react', '@mui/material', '@mui/private-theming'],
    },
    build: {
        // module federation emits top level await, which needs Chrome 89 or newer
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                // Suppress "Module level directives cause errors when bundled" warnings
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
};

export default config;
