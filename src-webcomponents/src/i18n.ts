/**
 * The few words of the web components that the dictionaries of the adapter do not have. Read by the build
 * (`vite.config.ts`), which merges them with the dictionaries and puts only the used words into a module.
 */
export const OWN_WORDS: Record<ioBroker.Languages, Record<string, string>> = {
    en: {
        wc_chooseInstance: 'Choose an instance of tr-064 in the settings',
        wc_personHelp: 'The channel of the person: tr-064.0.presence.persons.<name>',
        wc_imageHelp: 'Address of a photo of the person. Empty: an icon',
    },
    de: {
        wc_chooseInstance: 'Eine Instanz von tr-064 in den Einstellungen wählen',
        wc_personHelp: 'Der Kanal der Person: tr-064.0.presence.persons.<Name>',
        wc_imageHelp: 'Adresse eines Fotos der Person. Leer: ein Symbol',
    },
    ru: {
        wc_chooseInstance: 'Выберите экземпляр tr-064 в настройках',
        wc_personHelp: 'Канал человека: tr-064.0.presence.persons.<имя>',
        wc_imageHelp: 'Адрес фотографии человека. Пусто: значок',
    },
    pt: {
        wc_chooseInstance: 'Escolha uma instância de tr-064 nas configurações',
        wc_personHelp: 'O canal da pessoa: tr-064.0.presence.persons.<nome>',
        wc_imageHelp: 'Endereço de uma foto da pessoa. Vazio: um ícone',
    },
    nl: {
        wc_chooseInstance: 'Kies een instantie van tr-064 in de instellingen',
        wc_personHelp: 'Het kanaal van de persoon: tr-064.0.presence.persons.<naam>',
        wc_imageHelp: 'Adres van een foto van de persoon. Leeg: een pictogram',
    },
    fr: {
        wc_chooseInstance: 'Choisissez une instance de tr-064 dans les paramètres',
        wc_personHelp: 'Le canal de la personne : tr-064.0.presence.persons.<nom>',
        wc_imageHelp: "Adresse d'une photo de la personne. Vide : une icône",
    },
    it: {
        wc_chooseInstance: 'Scegli un’istanza di tr-064 nelle impostazioni',
        wc_personHelp: 'Il canale della persona: tr-064.0.presence.persons.<nome>',
        wc_imageHelp: 'Indirizzo di una foto della persona. Vuoto: un’icona',
    },
    es: {
        wc_chooseInstance: 'Elija una instancia de tr-064 en la configuración',
        wc_personHelp: 'El canal de la persona: tr-064.0.presence.persons.<nombre>',
        wc_imageHelp: 'Dirección de una foto de la persona. Vacío: un icono',
    },
    pl: {
        wc_chooseInstance: 'Wybierz instancję tr-064 w ustawieniach',
        wc_personHelp: 'Kanał osoby: tr-064.0.presence.persons.<nazwa>',
        wc_imageHelp: 'Adres zdjęcia osoby. Puste: ikona',
    },
    uk: {
        wc_chooseInstance: 'Виберіть екземпляр tr-064 у налаштуваннях',
        wc_personHelp: 'Канал особи: tr-064.0.presence.persons.<ім’я>',
        wc_imageHelp: 'Адреса фотографії особи. Порожньо: значок',
    },
    'zh-cn': {
        wc_chooseInstance: '请在设置中选择 tr-064 的实例',
        wc_personHelp: '人员的通道：tr-064.0.presence.persons.<名称>',
        wc_imageHelp: '人员照片的地址。为空：显示图标',
    },
};
