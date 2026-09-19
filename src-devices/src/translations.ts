// Loaded by ioBroker.devices before the components and merged into its dictionary
// (`I18n.extendTranslations`), so the keys have to be unique across all adapters: `fritzdm_*` for
// the tile, `tr064_*` for the mesh view of `src/shared/` (copy of `src-shared/`).
import { meshTranslations } from './shared/i18n';

import en from './i18n/en.json';
import de from './i18n/de.json';
import ru from './i18n/ru.json';
import pt from './i18n/pt.json';
import nl from './i18n/nl.json';
import fr from './i18n/fr.json';
import it from './i18n/it.json';
import es from './i18n/es.json';
import pl from './i18n/pl.json';
import uk from './i18n/uk.json';
import zhCn from './i18n/zh-cn.json';

const translations: Record<ioBroker.Languages, Record<string, string>> = {
    en: { ...meshTranslations.en, ...en },
    de: { ...meshTranslations.de, ...de },
    ru: { ...meshTranslations.ru, ...ru },
    pt: { ...meshTranslations.pt, ...pt },
    nl: { ...meshTranslations.nl, ...nl },
    fr: { ...meshTranslations.fr, ...fr },
    it: { ...meshTranslations.it, ...it },
    es: { ...meshTranslations.es, ...es },
    pl: { ...meshTranslations.pl, ...pl },
    uk: { ...meshTranslations.uk, ...uk },
    'zh-cn': { ...meshTranslations['zh-cn'], ...zhCn },
};

export default translations;
