/**
 * The words an element shows, in the languages of ioBroker.
 *
 * The keys are those of the dictionaries of the adapter: `tr064_*` of `src-shared/i18n`, `fritzdm_*` of
 * `src-devices/src/i18n`, the keys of `src-widgets/src/i18n` with the prefix `vis_`, and `wc_*` of `i18n.ts`. The
 * build (`vite.config.ts`) puts only the words a module uses into it: it collects every key the sources name, and
 * for a key made of a prefix and a value (`` `vis_access_${type}` ``) every key with that prefix.
 */

declare const __TR064_WORDS__: Record<string, Record<string, string>>;

/** Once: the build writes the picked dictionary in place of every `__TR064_WORDS__` */
const WORDS = __TR064_WORDS__;

export type Translate = (key: string, ...args: (string | number)[]) => string;

/**
 * A word in one language, English if it has no translation; every `%s` is replaced by the next argument
 *
 * @param lang the language of the system
 * @param key key of the dictionary
 * @param args the values of the `%s`
 */
export function word(lang: string, key: string, ...args: (string | number)[]): string {
    let text = WORDS[lang]?.[key] || WORDS.en?.[key] || key;
    for (const arg of args) {
        text = text.replace('%s', String(arg));
    }
    return text;
}

/**
 * A translation function for one language
 *
 * @param lang the language of the system
 */
export function translator(lang: string): Translate {
    return (key, ...args) => word(lang, key, ...args);
}

/**
 * A word in one language if the dictionary has it, `fallback` otherwise - for values of the box that may have a
 * translation (`DSL`, `Up`)
 *
 * @param lang the language of the system
 * @param key key of the dictionary
 * @param fallback the text without translation
 */
export function wordOr(lang: string, key: string, fallback: string): string {
    return WORDS[lang]?.[key] || WORDS.en?.[key] || fallback;
}
