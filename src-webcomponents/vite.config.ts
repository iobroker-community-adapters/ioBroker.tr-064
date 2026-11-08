import react from '@vitejs/plugin-react';
import { checkManifest, getReactImportPath, REACT_SPECIFIERS, type WebComponentText } from '@iobroker/web-components';
import { readFileSync } from 'node:fs';
import type { Plugin, UserConfig } from 'vite';

// with the extension: Vite may load its config natively, without a bundler that would add it
import {
    COMPONENTS,
    isComponentKey,
    LANGUAGES,
    manifestFile,
    moduleFile,
    modulePath,
    type ComponentKey,
} from './src/constants.ts';
import { OWN_WORDS } from './src/i18n.ts';
import { buildManifest } from './src/manifest.ts';

/**
 * The web components of tr-064, one ES module each - `admin/webcomponents/tr064-<name>.js` - with its manifest
 * `tr064-<name>.json` next to it (`common.webComponents`). Every host - Aura, admin, vis-2, devices - reads them
 * from `/adapter/tr-064/webcomponents/`. No module federation: the host shares nothing but the socket.
 *
 * A host imports exactly one URL per component, so every component is a build of its own (`vite build --mode
 * <component>`, see `package.json`): the code they share is compiled into each module.
 *
 * React is not bundled: the four React imports point at `lib/esm/react-19.js`, which web and admin serve beside
 * `adapter/`. The path is relative to the module, so a path prefix of a reverse proxy stays.
 */

type Dictionary = Record<string, Record<string, string>>;

/** The prefixes of the keys of the dictionaries, see `src/words.ts` */
const NAMESPACES = ['tr064_', 'vis_', 'fritzdm_', 'wc_'];

function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/** All words of the adapter by language: the dictionaries of devices, src-shared, vis-2 (`vis_`) and our own */
function loadDictionary(): Dictionary {
    const dictionary: Dictionary = {};
    for (const lang of LANGUAGES) {
        const vis = readJson<Record<string, string>>(`../src-widgets/src/i18n/${lang}.json`);
        dictionary[lang] = {
            ...readJson<Record<string, string>>(`../src-devices/src/i18n/${lang}.json`),
            ...readJson<Record<string, string>>(`../src-shared/i18n/${lang}.json`),
            ...Object.fromEntries(Object.entries(vis).map(([key, text]) => [`vis_${key}`, text])),
            ...OWN_WORDS[lang],
        };
    }
    return dictionary;
}

/**
 * A text in every language. A plain string (the label of a devices widget) is the same in every language: hosts
 * compare the name of a component with the label of the native widget in the language of the user
 *
 * @param text a string or `{ en, de, ... }`
 */
function inAllLanguages(text: ioBroker.StringOrTranslated): WebComponentText {
    return Object.fromEntries(
        LANGUAGES.map(lang => [lang, typeof text === 'string' ? text : text[lang] || text.en]),
    ) as WebComponentText;
}

/**
 * Collects the keys of the dictionaries the sources of a module name and puts only those words into the module:
 * every `__TR064_WORDS__` becomes the picked dictionary. A key made of a prefix and a value
 * (`` `vis_access_${type}` ``) brings every key with that prefix. A named key without an English text fails the
 * build.
 *
 * @param dictionary all words
 */
function words(dictionary: Dictionary): Plugin {
    const keys = new Set<string>();
    const prefixes = new Set<string>();
    const namespaces = NAMESPACES.join('|');
    const keyPattern = new RegExp(`['"\`]((?:${namespaces})\\w+)['"\`]`, 'g');
    const prefixPattern = new RegExp(`\`((?:${namespaces})\\w*)\\$\\{`, 'g');
    return {
        name: 'tr064-words',
        enforce: 'post',
        transform(code, id) {
            if (id.includes('node_modules')) {
                return null;
            }
            for (const match of code.matchAll(keyPattern)) {
                keys.add(match[1]);
            }
            for (const match of code.matchAll(prefixPattern)) {
                // a bare namespace (`tr064_${wlan}`) would bring the whole dictionary: such keys are named elsewhere
                if (!NAMESPACES.includes(match[1])) {
                    prefixes.add(match[1]);
                }
            }
            return null;
        },
        renderChunk(code) {
            const missing = [...keys].filter(key => !dictionary.en[key]);
            if (missing.length) {
                this.error(`No English text for ${missing.join(', ')}`);
            }
            const picked: Dictionary = {};
            for (const lang of LANGUAGES) {
                picked[lang] = {};
                for (const [key, text] of Object.entries(dictionary[lang])) {
                    if (keys.has(key) || [...prefixes].some(prefix => key.startsWith(prefix))) {
                        picked[lang][key] = text;
                    }
                }
            }
            return { code: code.replace(/\b__TR064_WORDS__\b/g, JSON.stringify(picked)), map: null };
        },
    };
}

/**
 * Writes the manifest next to the module, checked like a host checks it
 *
 * @param key the component
 * @param dictionary all words
 */
function manifest(key: ComponentKey, dictionary: Dictionary): Plugin {
    return {
        name: 'tr064-web-component-manifest',
        generateBundle() {
            const ioPackage = readJson<{
                common: {
                    deviceWidgets: {
                        components: {
                            name: string;
                            label: ioBroker.StringOrTranslated;
                            description: ioBroker.StringOrTranslated;
                        }[];
                    };
                };
            }>('../io-package.json');
            const result = buildManifest(key, {
                word: wordKey => {
                    if (!dictionary.en[wordKey]) {
                        this.error(`The word "${wordKey}" of the manifest has no English text`);
                    }
                    return inAllLanguages(
                        Object.fromEntries(
                            LANGUAGES.map(lang => [lang, dictionary[lang][wordKey] || dictionary.en[wordKey]]),
                        ) as WebComponentText,
                    );
                },
                deviceWidget: name => {
                    const widget = ioPackage.common.deviceWidgets.components.find(item => item.name === name);
                    if (!widget) {
                        this.error(`io-package.json has no devices widget "${name}"`);
                    }
                    return { label: inAllLanguages(widget.label), description: inAllLanguages(widget.description) };
                },
            });
            const problem = checkManifest(result);
            if (problem) {
                this.error(`${manifestFile(key)}: ${problem}`);
            }
            this.emitFile({
                type: 'asset',
                fileName: manifestFile(key),
                source: `${JSON.stringify(result, null, 4)}\n`,
            });
        },
    };
}

export default ({ mode }: { mode: string }): UserConfig => {
    if (!isComponentKey(mode)) {
        throw new Error(
            `Build one web component with "vite build --mode <component>": ${Object.keys(COMPONENTS).join(', ')}`,
        );
    }
    const key = mode;
    const dictionary = loadDictionary();
    const reactImport = getReactImportPath(modulePath(key));

    return {
        plugins: [react(), words(dictionary), manifest(key, dictionary)],
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
        resolve: {
            // `src-shared/guestWlanApi.ts` lies outside of this package: its import has to find our copy
            dedupe: ['qrcode-generator'],
        },
        build: {
            target: 'es2022',
            outDir: './build',
            // every component is a build of its own into the same folder; `tasks.ts` empties it first
            emptyOutDir: false,
            lib: {
                entry: `./src/${key}.tsx`,
                formats: ['es'],
                fileName: (): string => moduleFile(key),
            },
            rollupOptions: {
                external: [...REACT_SPECIFIERS],
                output: {
                    paths: Object.fromEntries(REACT_SPECIFIERS.map(specifier => [specifier, reactImport])),
                    // one file: a host imports exactly one URL
                    codeSplitting: false,
                    // library mode keeps whitespace for the bundler of a consumer; this module is loaded as it is
                    minify: true,
                },
            },
        },
    };
};
