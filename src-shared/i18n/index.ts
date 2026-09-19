/**
 * Translations of the `tr064_*` keys of the mesh view, by language.
 *
 * E.g. `I18n.extendTranslations(meshTranslations)` of `@iobroker/gui-components`, or
 * `meshTranslate('de')` as `t` of `MeshView` for a host without own translation system.
 */
import de from './de.json';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import it from './it.json';
import nl from './nl.json';
import pl from './pl.json';
import pt from './pt.json';
import ru from './ru.json';
import uk from './uk.json';
import zhCN from './zh-cn.json';

export type MeshLanguage = 'en' | 'de' | 'ru' | 'pt' | 'nl' | 'fr' | 'it' | 'es' | 'pl' | 'uk' | 'zh-cn';

export const meshTranslations: Record<MeshLanguage, Record<string, string>> = {
    en,
    de,
    ru,
    pt,
    nl,
    fr,
    it,
    es,
    pl,
    uk,
    'zh-cn': zhCN,
};

/**
 * A `t` function for `MeshView`: the text in `lang`, English if missing, `%s` replaced by the arguments
 *
 * @param lang language of the texts
 */
export function meshTranslate(lang: string): (key: string, ...args: (string | number)[]) => string {
    const words = meshTranslations[lang as MeshLanguage] || meshTranslations.en;
    return (key: string, ...args: (string | number)[]): string => {
        let text = words[key] || meshTranslations.en[key] || key;
        for (const arg of args) {
            text = text.replace('%s', String(arg));
        }
        return text;
    };
}
