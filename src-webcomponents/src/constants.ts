/**
 * The web components of tr-064 and what the build and the elements share about them. Read by `vite.config.ts`
 * too, so this file imports nothing that needs a browser.
 */

export const ADAPTER = 'tr-064';

/** The components, one module and one manifest each; `vite build --mode <key>` builds one of them */
export const COMPONENTS = {
    fritzbox: { tag: 'iob-tr064-fritzbox', file: 'tr064-fritzbox' },
    mesh: { tag: 'iob-tr064-mesh', file: 'tr064-mesh' },
    presence: { tag: 'iob-tr064-presence', file: 'tr064-presence' },
    person: { tag: 'iob-tr064-person', file: 'tr064-person' },
    'guest-wlan': { tag: 'iob-tr064-guest-wlan', file: 'tr064-guest-wlan' },
} as const;

export type ComponentKey = keyof typeof COMPONENTS;

/** The languages of ioBroker - every text of a manifest is given in all of them */
export const LANGUAGES: ioBroker.Languages[] = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

/**
 * Whether a text is the key of a component
 *
 * @param key e.g. the mode of the build
 */
export function isComponentKey(key: string): key is ComponentKey {
    return Object.prototype.hasOwnProperty.call(COMPONENTS, key);
}

/** The built module of a component, next to its manifest */
export function moduleFile(key: ComponentKey): string {
    return `${COMPONENTS[key].file}.js`;
}

/** The manifest the build writes next to the module; `common.webComponents` names this one */
export function manifestFile(key: ComponentKey): string {
    return `${COMPONENTS[key].file}.json`;
}

/** Where `tasks.ts` puts the module in the admin folder; the React import is relative to it */
export function modulePath(key: ComponentKey): string {
    return `webcomponents/${moduleFile(key)}`;
}

/**
 * `tr-064.<n>` of an `instance` setting: `tr-064.0`, `system.adapter.tr-064.0` and a bare `0` are accepted
 *
 * @param raw value of the setting
 * @returns the instance, or null if the setting is empty or names no instance of tr-064
 */
export function instanceIdOf(raw: unknown): string | null {
    const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
    const match = value.match(/^(?:system\.adapter\.)?(?:tr-064\.)?(\d+)$/);
    return match ? `${ADAPTER}.${match[1]}` : null;
}
