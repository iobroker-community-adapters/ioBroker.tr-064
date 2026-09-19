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

/**
 * Texts of the widgets, loaded by vis-2 as `vis2Tr064Widgets/translations` (`"i18n": "component"`).
 *
 * The prefix must match {@link Generic.getI18nPrefix}, so that `Generic.t('online')` resolves to
 * `tr064_vis_online`. vis-2 prepends it to the labels of the attributes, too. The texts of the mesh
 * view (`tr064_*` of `src-shared/i18n`) are not in here - they come from `meshTranslate()`.
 */
const translations = {
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
    'zh-cn': zhCn,
    prefix: 'tr064_vis_',
};

export default translations;
