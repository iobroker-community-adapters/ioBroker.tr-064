// Person tile for ioBroker.devices: is a person of the presence detection at home?
//
// The settings store the NAME of the person (tab "Persons" of the tr-064 instance), not an object
// ID - `loadPersons()`/`findPerson()` of `src/shared/presenceApi.ts` find its channel
// `tr-064.<n>.presence.persons.<id>`. The tile shows photo or icon, the name, present/away, since
// when and the last coming and going - the more room the tile has, the more. A click opens the
// comings and goings in a dialog; they are read with `loadPresenceHistory()` only while it is open.

import type { ComponentType, JSX, KeyboardEvent, ReactNode } from 'react';
import WidgetGeneric, {
    AdapterReact,
    React,
    MuiMaterial,
    getTileStyles,
    isNeumorphicTheme,
    type CustomWidgetPlugin,
    type WidgetGenericProps,
    type WidgetGenericState,
} from '@iobroker/dm-widgets';
import type {
    BoxProps,
    CircularProgressProps,
    DialogContentProps,
    DialogProps,
    DialogTitleProps,
    IconButtonProps,
    Theme,
    TypographyProps,
} from '@mui/material';
// `WidgetGeneric.getConfigSchema()` declares its return with the types of dm-utils, the schema is
// written against the types of json-config (dm-utils uses the same ones).
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { I18n as I18nType, IconProps } from '@iobroker/gui-components';

import {
    findPerson,
    formatDuration,
    formatEventTime,
    loadPersons,
    loadPresenceHistory,
    parseHistoryJson,
    PERSON_STATES,
    type PersonRef,
    type PresenceEvent,
    type PresenceHistory,
    type PresenceSocket,
} from './shared/presenceApi';
import { normalizeInstance } from './utils';
import { alpha, SIZE_OPTIONS, stop, tileRootStyle, type Size } from './tileUtils';
import {
    ArrivalIcon,
    ChevronIcon,
    CloseIcon,
    DepartureIcon,
    DevicesIcon,
    HistoryIcon,
    PersonIcon,
    RefreshIcon,
} from './icons';

// React and MUI of the host (see `@iobroker/dm-widgets`), not a second copy of our own
const Box: ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogTitle: ComponentType<DialogTitleProps> = MuiMaterial?.DialogTitle;
const DialogContent: ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const IconButton: ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const CircularProgress: ComponentType<CircularProgressProps> = MuiMaterial?.CircularProgress;
const I18n = AdapterReact?.I18n as typeof I18nType;
const Icon = AdapterReact?.Icon as ComponentType<IconProps> | undefined;

/** States of a person the tile reads, relative to its channel */
const VALUE_KEYS = [
    PERSON_STATES.present,
    PERSON_STATES.lastArrival,
    PERSON_STATES.lastDeparture,
    PERSON_STATES.presentToday,
    PERSON_STATES.absentToday,
    PERSON_STATES.devices,
    PERSON_STATES.history,
] as const;

type ValueKey = (typeof VALUE_KEYS)[number];

type Values = Partial<Record<ValueKey, ioBroker.StateValue>>;

/** How many events the dialog shows, and from how many days a history instance is asked */
const HISTORY_COUNT = 50;
const HISTORY_DAYS = 14;

/** How many events the 2x2 tile lists */
const TILE_EVENTS = 4;

/** The "since" texts are refreshed this often */
const TICK_MS = 30_000;

/** A person which was not found (adapter not started yet, typo) is looked up again this often */
const RETRY_MS = 60_000;

interface PersonSettings extends CustomWidgetPlugin {
    /** tr-064 instance, e.g. `tr-064.0` */
    instance?: string;
    /** name of the person as configured in the tab "Persons" */
    person?: string;
    /** the name is shown (default) */
    showName?: boolean;
    /** photo as data URL - has precedence over the icons */
    photo?: string;
    // `icon`/`iconActive` (absent/present) and `text`/`textActive` are fields of `WidgetSettingsBase`
    /** photo and icon are grayed out while the person is away (default) */
    dimAbsent?: boolean;
    /** since when present/away (default) */
    showSince?: boolean;
    /** time of the last coming and going (default) */
    showLastChange?: boolean;
    /** the comings and goings: list in the 2x2 tile, dialog on click (default) */
    showHistory?: boolean;
}

/** Where the person stands: `loading` until the persons of the instance were read */
type Lookup = 'loading' | 'found' | 'notFound' | 'none';

interface HistoryState extends PresenceHistory {
    loading: boolean;
}

interface PersonComponentState extends WidgetGenericState {
    person: PersonRef | null;
    lookup: Lookup;
    /** latest value of every state of the person, `null` if the state does not exist */
    values: Values;
    /** `info.connection` of the instance */
    connected: boolean | null;
    /** the history dialog is open */
    historyOpen: boolean;
    history: HistoryState;
    /** the clock of the "since" texts */
    now: number;
}

const EMPTY_HISTORY: HistoryState = { events: [], source: 'none', loading: false };

function isTrue(value: ioBroker.StateValue | undefined): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function numberOf(value: ioBroker.StateValue | undefined): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

/** `Anna` -> `A`, `Anna Maria Schmidt` -> `AS` */
function initialsOf(name: string): string {
    const words = name
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .split(/[\s-]+/)
        .filter(Boolean);
    if (!words.length) {
        return '';
    }
    const first = Array.from(words[0])[0] || '';
    const last = words.length > 1 ? Array.from(words[words.length - 1])[0] || '' : '';
    return (first + last).toUpperCase();
}

function intlLang(lang: string): string {
    return lang === 'zh-cn' ? 'zh-CN' : lang || 'en';
}

/** `Today`, `Yesterday` or `Monday, 05.10.` in the language of the host */
function dayLabel(ts: number, lang: string): string {
    const locale = intlLang(lang);
    const date = new Date(ts);
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const startOfDay = new Date(ts).setHours(0, 0, 0, 0);
    const days = Math.round((startOfToday - startOfDay) / 86_400_000);
    if (days === 0 || days === 1) {
        try {
            const text = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
            return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
        } catch {
            // falls through to the date
        }
    }
    return date.toLocaleDateString(locale, {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    });
}

export class PersonComponent extends WidgetGeneric<PersonComponentState, PersonSettings> {
    private subscriptions: { id: string; handler: (id: string, state: ioBroker.State | null) => void }[] = [];

    private connectionSubscription: {
        id: string;
        handler: (id: string, state: ioBroker.State | null) => void;
    } | null = null;

    /** Counts the lookups: the answer of an older one is dropped */
    private lookupRun = 0;

    private historyRun = 0;

    private ticker: ReturnType<typeof setInterval> | null = null;

    private lastLookup = 0;

    constructor(props: WidgetGenericProps<PersonSettings>) {
        super(props);
        this.state = {
            ...this.state,
            person: null,
            lookup: 'loading',
            values: {},
            connected: null,
            historyOpen: props.openDialogId === PersonComponent.dialogIdOf(props),
            history: EMPTY_HISTORY,
            now: Date.now(),
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        const schema: JsonConfigItemPanel = {
            type: 'panel',
            items: {
                // replaces the size of the host, which has no 2x2
                size: {
                    type: 'select',
                    label: 'wm_Size',
                    options: SIZE_OPTIONS,
                    default: '1x1',
                    format: 'radio',
                    horizontal: true,
                    noTranslation: true,
                },
                // the colors of the host: "active" is present, "inactive" is away
                colorActive: { type: 'color', label: 'fritzdm_colorPresent', sm: 6 },
                color: { type: 'color', label: 'fritzdm_colorAbsent', sm: 6 },
                instance: {
                    type: 'instance',
                    adapter: 'tr-064',
                    label: 'fritzdm_instance',
                    default: 'tr-064.0',
                    sm: 12,
                    md: 6,
                },
                // The adapter answers `personList` with `[{ label, value }]`. Offline instance or an
                // adapter without the message: no options - the field is a plain text field.
                person: {
                    type: 'autocompleteSendTo',
                    label: 'fritzdm_person',
                    help: 'fritzdm_personHelp',
                    command: 'personList',
                    data: {},
                    instance: '${data.instance}',
                    alsoDependsOn: ['instance'],
                    freeSolo: true,
                    sm: 12,
                    md: 6,
                },
                _appearance: {
                    type: 'header',
                    text: 'fritzdm_appearance',
                    size: 5,
                    newLine: true,
                    sm: 12,
                },
                name: {
                    type: 'text',
                    label: 'fritzdm_nameOverride',
                    help: 'fritzdm_nameOverrideHelp',
                    sm: 12,
                    md: 6,
                },
                showName: {
                    type: 'checkbox',
                    label: 'fritzdm_showName',
                    default: true,
                    sm: 12,
                    md: 6,
                },
                photo: {
                    type: 'image',
                    label: 'fritzdm_photo',
                    help: 'fritzdm_photoHelp',
                    base64: true,
                    crop: true,
                    // stored in the settings of the widget - keep it small
                    maxSize: 200 * 1024,
                    accept: { 'image/*': [] },
                    newLine: true,
                    sm: 12,
                },
                iconActive: {
                    type: 'component',
                    subType: 'iconSelect',
                    label: 'fritzdm_iconPresent',
                    hidden: '!!data.photo',
                    sm: 6,
                },
                icon: {
                    type: 'component',
                    subType: 'iconSelect',
                    label: 'fritzdm_iconAbsent',
                    hidden: '!!data.photo',
                    sm: 6,
                },
                textActive: {
                    type: 'text',
                    label: 'fritzdm_textPresent',
                    placeholder: 'fritzdm_present',
                    sm: 6,
                },
                text: {
                    type: 'text',
                    label: 'fritzdm_textAbsent',
                    placeholder: 'fritzdm_absent',
                    sm: 6,
                },
                dimAbsent: {
                    type: 'checkbox',
                    label: 'fritzdm_dimAbsent',
                    default: true,
                    sm: 12,
                },
                _display: {
                    type: 'header',
                    text: 'fritzdm_display',
                    size: 5,
                    newLine: true,
                    sm: 12,
                },
                showSince: {
                    type: 'checkbox',
                    label: 'fritzdm_showSince',
                    default: true,
                    sm: 12,
                },
                showLastChange: {
                    type: 'checkbox',
                    label: 'fritzdm_showLastChange',
                    default: true,
                    sm: 12,
                },
                showHistory: {
                    type: 'checkbox',
                    label: 'fritzdm_showHistory',
                    default: true,
                    sm: 12,
                },
            },
        };

        return { name: 'fritzdm_personWidgetName', schema };
    }

    /** ID of the dialog in the URL hash of ioBroker.devices, so an open dialog survives a reload */
    private static dialogIdOf(props: WidgetGenericProps<PersonSettings>): string {
        return `${props.widget.id}_history`;
    }

    private get dialogId(): string {
        return PersonComponent.dialogIdOf(this.props);
    }

    private get instance(): string {
        return normalizeInstance(this.props.settings.instance);
    }

    private get personName(): string {
        return (this.props.settings.person || '').trim();
    }

    private get socket(): PresenceSocket {
        return this.props.stateContext.getSocket();
    }

    private get lang(): string {
        return this.props.stateContext.language || I18n.getLanguage() || 'en';
    }

    // ---- lifecycle ------------------------------------------------------------

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribeConnection();
        this.lookup();
        this.ticker = setInterval(() => {
            this.setState({ now: Date.now() });
            if (this.state.lookup === 'notFound' && Date.now() - this.lastLookup >= RETRY_MS) {
                this.lookup();
            }
        }, TICK_MS);
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<PersonSettings>>,
        prevState: Readonly<PersonComponentState>,
        snapshot?: unknown,
    ): void {
        super.componentDidUpdate?.(prevProps, prevState, snapshot);

        const instanceChanged = normalizeInstance(prevProps.settings.instance) !== this.instance;
        if (instanceChanged) {
            this.unsubscribeConnection();
            this.subscribeConnection();
        }
        if (instanceChanged || (prevProps.settings.person || '').trim() !== this.personName) {
            this.lookup();
        }

        // the dialog in the URL hash changed: reload, back button of the browser
        if (prevProps.openDialogId !== this.props.openDialogId) {
            const shouldBeOpen = this.props.openDialogId === this.dialogId;
            if (shouldBeOpen && !this.state.historyOpen) {
                this.setState({ historyOpen: true }, () => this.loadHistory());
            } else if (!shouldBeOpen && prevProps.openDialogId === this.dialogId && this.state.historyOpen) {
                this.setState({ historyOpen: false });
            }
        }

        // a coming or going while the dialog is open: it shows the new event
        if (
            this.state.historyOpen &&
            prevState.values.history !== undefined &&
            prevState.values.history !== this.state.values.history
        ) {
            this.loadHistory(true);
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.lookupRun++;
        this.historyRun++;
        this.unsubscribePerson();
        this.unsubscribeConnection();
        if (this.ticker) {
            clearInterval(this.ticker);
            this.ticker = null;
        }
    }

    // ---- states ---------------------------------------------------------------

    /** Reads the persons of the instance and subscribes the states of the configured one */
    private lookup(): void {
        const run = ++this.lookupRun;
        this.lastLookup = Date.now();
        this.unsubscribePerson();
        const name = this.personName;
        if (!name) {
            this.setState({ person: null, lookup: 'none', values: {}, history: EMPTY_HISTORY });
            return;
        }
        if (this.state.lookup !== 'notFound') {
            this.setState({ lookup: 'loading' });
        }
        void loadPersons(this.socket, this.instance).then(persons => {
            if (run !== this.lookupRun) {
                return;
            }
            const person = findPerson(persons, name) || null;
            this.setState({ person, lookup: person ? 'found' : 'notFound', values: {}, history: EMPTY_HISTORY }, () => {
                if (person) {
                    this.subscribePerson(person);
                    if (this.state.historyOpen) {
                        this.loadHistory();
                    }
                }
            });
        });
    }

    private subscribePerson(person: PersonRef): void {
        const context = this.props.stateContext;
        for (const key of VALUE_KEYS) {
            const id = `${person.id}.${key}`;
            const handler = (_id: string, state: ioBroker.State | null): void => this.onValue(key, state);
            context.getState(id, handler);
            this.subscriptions.push({ id, handler });
        }
    }

    private unsubscribePerson(): void {
        const context = this.props.stateContext;
        for (const { id, handler } of this.subscriptions) {
            context.removeState(id, handler);
        }
        this.subscriptions = [];
    }

    /** `info.connection` of the instance: the "disconnected" symbol of the host, as for other devices */
    private subscribeConnection(): void {
        const id = `${this.instance}.info.connection`;
        const handler = (_id: string, state: ioBroker.State | null): void => {
            const val = state ? state.val : null;
            const connected = val === null || val === undefined ? null : isTrue(val);
            this.setState(prev =>
                prev.connected === connected
                    ? null
                    : {
                          connected,
                          indicators: prev.indicators ? { ...prev.indicators, connected } : prev.indicators,
                      },
            );
        };
        this.props.stateContext.getState(id, handler);
        this.connectionSubscription = { id, handler };
    }

    private unsubscribeConnection(): void {
        if (this.connectionSubscription) {
            this.props.stateContext.removeState(this.connectionSubscription.id, this.connectionSubscription.handler);
            this.connectionSubscription = null;
        }
    }

    private onValue(key: ValueKey, state: ioBroker.State | null | undefined): void {
        const val = state ? state.val : null;
        this.setState(prev => (prev.values[key] === val ? null : { values: { ...prev.values, [key]: val } }));
    }

    // ---- history dialog -------------------------------------------------------

    /**
     * Reads the comings and goings for the dialog
     *
     * @param quiet without the spinner (a new event while the dialog is open)
     */
    private loadHistory(quiet?: boolean): void {
        const person = this.state.person;
        const run = ++this.historyRun;
        if (!person) {
            this.setState({ history: EMPTY_HISTORY });
            return;
        }
        if (!quiet) {
            this.setState(prev => ({ history: { ...prev.history, loading: true } }));
        }
        void loadPresenceHistory(this.socket, person.id, { count: HISTORY_COUNT, days: HISTORY_DAYS }).then(history => {
            if (run === this.historyRun) {
                this.setState({ history: { ...history, loading: false } });
            }
        });
    }

    private get canOpenHistory(): boolean {
        return this.props.settings.showHistory !== false && !!this.state.person;
    }

    private openHistory = (): void => {
        if (this.state.historyOpen || !this.canOpenHistory) {
            return;
        }
        this.props.onOpenWidgetDialog?.(this.dialogId);
        this.setState({ historyOpen: true }, () => this.loadHistory());
    };

    private closeHistory = (): void => {
        this.historyRun++;
        this.setState({ historyOpen: false });
        this.props.onCloseWidgetDialog?.();
    };

    private onTileKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.openHistory();
        }
    };

    // ---- WidgetGeneric override points ------------------------------------------

    /** The tile lights up in the "present" color while the person is at home */
    protected isTileActive(): boolean {
        return this.present === true;
    }

    protected hasTileAction(): boolean {
        return this.canOpenHistory;
    }

    protected onTileClick(): void {
        this.openHistory();
    }

    protected renderTileIcon(): JSX.Element | null {
        return this.renderAvatar('1em');
    }

    // ---- derived values ---------------------------------------------------------

    private get values(): Values {
        return this.state.values;
    }

    /** `true`/`false`, `null` while unknown */
    private get present(): boolean | null {
        const value = this.values.present;
        if (this.state.lookup !== 'found' || value === null || value === undefined) {
            return null;
        }
        return isTrue(value);
    }

    private get displayName(): string {
        return (
            this.props.settings.name || this.state.person?.name || this.personName || I18n.t('fritzdm_personWidgetName')
        );
    }

    private get statusText(): string {
        switch (this.state.lookup) {
            case 'none':
                return I18n.t('fritzdm_noPerson');
            case 'notFound':
                return I18n.t('fritzdm_personNotFound');
            case 'loading':
                return '…';
            default:
                break;
        }
        const present = this.present;
        if (present === null) {
            return '…';
        }
        return present
            ? this.props.settings.textActive || I18n.t('fritzdm_present')
            : this.props.settings.text || I18n.t('fritzdm_absent');
    }

    /** The color of the state: the colors of the settings, otherwise green / gray */
    private statusColor(theme: Theme): string {
        if (this.state.lookup === 'notFound') {
            return theme.palette.warning.main;
        }
        const present = this.present;
        if (present === null) {
            return theme.palette.text.disabled;
        }
        return present
            ? this.getAccentColor() || theme.palette.success.main
            : this.getInactiveColor() || theme.palette.text.disabled;
    }

    /** The time of the last change, 0 if unknown */
    private get since(): number {
        const present = this.present;
        if (present === null) {
            return 0;
        }
        return numberOf(present ? this.values.lastArrival : this.values.lastDeparture);
    }

    /** `seit 2 Std. 15 Min.` - empty if unknown or switched off */
    private get sinceText(): string {
        const since = this.since;
        if (!since || this.props.settings.showSince === false) {
            return '';
        }
        return I18n.t('fritzdm_sinceDuration', formatDuration(Math.max(0, this.state.now - since), this.lang));
    }

    private get showLastChange(): boolean {
        return this.props.settings.showLastChange !== false && this.present !== null;
    }

    /** The box does not answer: the values are old, they are shown faded */
    private get staleSx(): Record<string, unknown> {
        return this.state.connected === false ? { opacity: 0.55 } : {};
    }

    private get dimmed(): boolean {
        return this.present === false && this.props.settings.dimAbsent !== false;
    }

    // ---- pieces -----------------------------------------------------------------

    /**
     * Photo, icon of the state or the initials in a circle, with a dot in the color of the state
     *
     * @param size edge length, any CSS length
     * @param dot with the dot (not in the dialog title, where the text says it)
     */
    private renderAvatar(size: string, dot = true): JSX.Element {
        const { photo, icon, iconActive } = this.props.settings;
        const context = this.props.stateContext;
        const present = this.present;
        const iconSrc = present ? iconActive || icon : icon || iconActive;
        const dimSx = this.dimmed ? { filter: 'grayscale(1)', opacity: 0.55 } : {};
        const initials = initialsOf(this.displayName);

        let content: ReactNode;
        if (photo) {
            content = (
                <img
                    src={context.getImagePath(photo) || photo}
                    alt=""
                    draggable={false}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        transition: 'filter 0.3s ease, opacity 0.3s ease',
                        ...dimSx,
                    }}
                />
            );
        } else if (iconSrc && Icon) {
            content = (
                <Box
                    component="span"
                    sx={{ display: 'inline-flex', width: '62%', height: '62%', ...dimSx }}
                >
                    <Icon
                        src={context.getImagePath(iconSrc) || iconSrc}
                        style={{ width: '100%', height: '100%', color: 'inherit' }}
                        // an icon may be a character, e.g. an emoji
                        styleUTF8={{ fontSize: `calc(${size} * 0.5)`, lineHeight: 1 }}
                    />
                </Box>
            );
        } else if (initials && this.state.lookup !== 'none') {
            content = (
                <Box
                    component="span"
                    sx={{ fontSize: `calc(${size} * 0.38)`, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1 }}
                >
                    {initials}
                </Box>
            );
        } else {
            content = <PersonIcon sx={{ fontSize: `calc(${size} * 0.62)` }} />;
        }

        return (
            <Box
                component="span"
                sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0, width: size, height: size }}
            >
                <Box
                    component="span"
                    sx={theme => {
                        const color = this.statusColor(theme);
                        return {
                            width: '100%',
                            height: '100%',
                            boxSizing: 'border-box',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: photo ? undefined : color,
                            backgroundColor: photo ? 'transparent' : alpha(color, present ? 0.18 : 0.1),
                            border: `max(2px, calc(${size} * 0.04)) solid ${alpha(color, present ? 0.75 : 0.35)}`,
                            transition: 'all 0.3s ease',
                        };
                    }}
                >
                    {content}
                </Box>
                {dot && this.state.lookup === 'found' ? (
                    <Box
                        component="span"
                        sx={theme => ({
                            position: 'absolute',
                            right: '1%',
                            bottom: '1%',
                            width: '26%',
                            height: '26%',
                            minWidth: 8,
                            minHeight: 8,
                            boxSizing: 'border-box',
                            borderRadius: '50%',
                            backgroundColor: this.statusColor(theme),
                            border: `2px solid ${theme.palette.background.paper}`,
                        })}
                    />
                ) : null}
            </Box>
        );
    }

    /** Name of the tile - its font shrinks until it fits (`nameRef`, see WidgetGeneric) */
    private renderName(fontSize: string, neumorphicSize: string): JSX.Element | null {
        if (this.props.settings.showName === false) {
            return null;
        }
        return (
            <Typography
                ref={this.nameRef}
                variant="body2"
                sx={theme => ({
                    fontWeight: 600,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    fontSize,
                    ...(isNeumorphicTheme(theme)
                        ? { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: neumorphicSize }
                        : {}),
                })}
            >
                {this.displayName}
            </Typography>
        );
    }

    /**
     * `Present · for 2 h 15 min`
     *
     * @param fontSize size of the text
     * @param withSince the duration in the same line
     */
    private renderStatus(fontSize: string, withSince: boolean): JSX.Element {
        const since = withSince ? this.sinceText : '';

        return (
            <Box
                title={this.state.lookup === 'notFound' ? this.notFoundText : undefined}
                sx={{
                    minWidth: 0,
                    fontSize,
                    lineHeight: 1.35,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    color: 'text.secondary',
                    ...this.staleSx,
                }}
            >
                <Box
                    component="span"
                    sx={theme => ({ fontWeight: 700, color: this.statusColor(theme) })}
                >
                    {this.statusText}
                </Box>
                {since ? <Box component="span">{` · ${since}`}</Box> : null}
            </Box>
        );
    }

    /** The duration alone, a line of its own */
    private renderSince(fontSize: string): JSX.Element | null {
        const since = this.sinceText;
        if (!since) {
            return null;
        }
        return (
            <Typography
                component="div"
                noWrap
                sx={{ fontSize, lineHeight: 1.3, color: 'text.secondary', ...this.staleSx }}
            >
                {since}
            </Typography>
        );
    }

    private get notFoundText(): string {
        return I18n.t('fritzdm_personNotFoundIn', this.personName, this.instance);
    }

    /**
     * Arrow and time of the last coming / going
     *
     * @param kind which one
     * @param fontSize size of the text
     * @param withLabel `Came` / `Left` in front of the time
     */
    private renderEvent(kind: 'arrival' | 'departure', fontSize: string, withLabel: boolean): JSX.Element {
        const ts = numberOf(kind === 'arrival' ? this.values.lastArrival : this.values.lastDeparture);
        const label = I18n.t(kind === 'arrival' ? 'fritzdm_lastArrival' : 'fritzdm_lastDeparture');
        const Arrow = kind === 'arrival' ? ArrivalIcon : DepartureIcon;
        const time = formatEventTime(ts, this.lang);

        return (
            <Box
                component="span"
                title={ts ? `${label}: ${new Date(ts).toLocaleString(intlLang(this.lang))}` : label}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3em',
                    minWidth: 0,
                    fontSize,
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                    color: 'text.secondary',
                    fontVariantNumeric: 'tabular-nums',
                    ...this.staleSx,
                }}
            >
                <Arrow
                    sx={theme => ({
                        fontSize: '1.15em',
                        flexShrink: 0,
                        color:
                            kind === 'arrival'
                                ? this.getAccentColor() || theme.palette.success.main
                                : theme.palette.text.disabled,
                    })}
                />
                {withLabel ? <Box component="span">{label}</Box> : null}
                <Box
                    component="span"
                    sx={{
                        fontWeight: 600,
                        color: ts ? 'text.primary' : 'text.disabled',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {time}
                </Box>
            </Box>
        );
    }

    /** Came / left next to each other */
    private renderEvents(fontSize: string, withLabels: boolean): JSX.Element | null {
        if (!this.showLastChange) {
            return null;
        }
        return (
            <Box
                sx={{ display: 'flex', alignItems: 'center', gap: '0.9em', minWidth: 0, fontSize, overflow: 'hidden' }}
            >
                {this.renderEvent('arrival', 'inherit', withLabels)}
                {this.renderEvent('departure', 'inherit', withLabels)}
            </Box>
        );
    }

    /** Present / away today as a bar, from `presentToday` / `absentToday` */
    private renderToday(fontSize: string): JSX.Element | null {
        const presentMin = numberOf(this.values.presentToday);
        const absentMin = numberOf(this.values.absentToday);
        if (this.state.lookup !== 'found' || presentMin + absentMin <= 0) {
            return null;
        }
        const share = (presentMin / (presentMin + absentMin)) * 100;
        const presentText = formatDuration(presentMin * 60_000, this.lang);
        const absentText = formatDuration(absentMin * 60_000, this.lang);

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, fontSize, ...this.staleSx }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, color: 'text.secondary' }}>
                    <Box
                        component="span"
                        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {`${I18n.t('fritzdm_presentToday')}: `}
                        <Box
                            component="span"
                            sx={{ fontWeight: 600, color: 'text.primary' }}
                        >
                            {presentText}
                        </Box>
                    </Box>
                    <Box
                        component="span"
                        sx={{ whiteSpace: 'nowrap' }}
                        title={`${I18n.t('fritzdm_absentToday')}: ${absentText}`}
                    >
                        {absentText}
                    </Box>
                </Box>
                <Box
                    title={`${I18n.t('fritzdm_presentToday')}: ${presentText} · ${I18n.t('fritzdm_absentToday')}: ${absentText}`}
                    sx={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(127,127,127,0.22)' }}
                >
                    <Box
                        sx={theme => ({
                            width: `${share}%`,
                            height: '100%',
                            borderRadius: 'inherit',
                            backgroundColor: this.getAccentColor() || theme.palette.success.main,
                            transition: 'width 0.6s ease',
                        })}
                    />
                </Box>
            </Box>
        );
    }

    /** The last comings and goings of the state `history` - only the 2x2 tile has room for them */
    private renderTileHistory(fontSize: string): JSX.Element | null {
        if (this.props.settings.showHistory === false || this.state.lookup !== 'found') {
            return null;
        }
        const events = parseHistoryJson(this.values.history).slice(0, TILE_EVENTS);
        if (!events.length) {
            return null;
        }
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'max(2px, 0.8cqi)',
                    minWidth: 0,
                    fontSize,
                    ...this.staleSx,
                }}
            >
                {events.map(event => {
                    const Arrow = event.present ? ArrivalIcon : DepartureIcon;
                    return (
                        <Box
                            key={`${event.ts}_${event.present}`}
                            sx={{ display: 'flex', alignItems: 'center', gap: '0.45em', minWidth: 0, lineHeight: 1.3 }}
                        >
                            <Arrow
                                sx={theme => ({
                                    fontSize: '1.1em',
                                    flexShrink: 0,
                                    color: event.present
                                        ? this.getAccentColor() || theme.palette.success.main
                                        : theme.palette.text.disabled,
                                })}
                            />
                            <Box
                                component="span"
                                sx={{ color: 'text.secondary', flexShrink: 0 }}
                            >
                                {I18n.t(event.present ? 'fritzdm_came' : 'fritzdm_left')}
                            </Box>
                            <Box
                                component="span"
                                sx={{
                                    ml: 'auto',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontVariantNumeric: 'tabular-nums',
                                }}
                            >
                                {formatEventTime(event.ts, this.lang)}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        );
    }

    /** The host's indicators (disconnected, settings) - a click on them must not open the dialog */
    private renderTileIndicators(): JSX.Element {
        return (
            <div
                onClick={stop}
                onKeyDown={stop}
                style={{ display: 'contents' }}
            >
                {this.renderIndicators(this.renderSettingsButton())}
            </div>
        );
    }

    /**
     * The outer box which the host places in its grid, with the tile and the dialog.
     *
     * The dialog is a sibling of the tile: React events bubble through the portal of the dialog to
     * the React parents, so a click in the dialog must neither reach the tile nor the host.
     */
    private renderFrame(
        size: Size,
        tileSx: (theme: Theme) => Record<string, unknown>,
        content: ReactNode,
    ): JSX.Element {
        const active = this.isTileActive();
        const clickable = this.canOpenHistory;

        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => tileRootStyle(theme, size)}
            >
                {size === '2x1' ? (
                    // one column wide and square: the height of a 1x1 tile, as the host does it
                    <Box sx={{ width: 'calc(50% - 6px)', aspectRatio: '1' }} />
                ) : null}
                <Box
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={
                        clickable
                            ? `${this.displayName} - ${I18n.t('fritzdm_showHistoryOf')}`
                            : `${this.displayName}: ${this.statusText}`
                    }
                    onClick={clickable ? this.openHistory : undefined}
                    onKeyDown={clickable ? this.onTileKeyDown : undefined}
                    sx={theme => ({
                        boxSizing: 'border-box',
                        position: size === '2x1' ? 'absolute' : 'relative',
                        ...(size === '2x1' ? { inset: 0 } : {}),
                        width: '100%',
                        overflow: 'hidden',
                        userSelect: 'none',
                        cursor: clickable ? 'pointer' : 'default',
                        textAlign: 'left',
                        color: 'text.primary',
                        outline: 'none',
                        ...(getTileStyles(
                            theme,
                            active,
                            this.getAccentColor() || theme.palette.success.main,
                            clickable,
                            this.getInactiveColor(),
                        ) as Record<string, unknown>),
                        '&:focus-visible': {
                            boxShadow: `0 0 0 2px ${this.statusColor(theme)} inset`,
                        },
                        ...tileSx(theme),
                    })}
                >
                    {content}
                    {this.renderTileIndicators()}
                </Box>
                {this.state.historyOpen ? (
                    <span
                        style={{ display: 'contents' }}
                        onClick={stop}
                        onPointerDown={stop}
                        onMouseDown={stop}
                        onTouchStart={stop}
                        onKeyDown={stop}
                    >
                        {this.renderHistoryDialog()}
                    </span>
                ) : null}
            </Box>
        );
    }

    // ---- dialog -----------------------------------------------------------------

    /** One event of the dialog: came/left, time, how long it lasted */
    private renderHistoryRow(event: PresenceEvent, until: number, ongoing: boolean): JSX.Element {
        const locale = intlLang(this.lang);
        const Arrow = event.present ? ArrivalIcon : DepartureIcon;
        const duration = formatDuration(Math.max(0, until - event.ts), this.lang);
        const durationText = ongoing
            ? I18n.t('fritzdm_sinceDuration', duration)
            : I18n.t(event.present ? 'fritzdm_stayed' : 'fritzdm_wasAway', duration);

        return (
            <Box
                key={`${event.ts}_${event.present}`}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, minWidth: 0 }}
            >
                <Box
                    sx={theme => {
                        const color = event.present
                            ? this.getAccentColor() || theme.palette.success.main
                            : theme.palette.text.secondary;
                        return {
                            width: 32,
                            height: 32,
                            flexShrink: 0,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color,
                            backgroundColor: alpha(color, 0.14),
                        };
                    }}
                >
                    <Arrow sx={{ fontSize: 18 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        noWrap
                        sx={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.3 }}
                    >
                        {I18n.t(event.present ? 'fritzdm_came' : 'fritzdm_left')}
                    </Typography>
                    <Typography
                        noWrap
                        variant="caption"
                        component="div"
                        sx={{ color: 'text.secondary', fontStyle: ongoing ? 'italic' : 'normal', lineHeight: 1.3 }}
                    >
                        {durationText}
                    </Typography>
                </Box>
                <Typography
                    title={new Date(event.ts).toLocaleString(locale)}
                    sx={{ fontSize: '0.9rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
                >
                    {new Date(event.ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </Typography>
            </Box>
        );
    }

    /** The events grouped by day, newest first */
    private renderHistoryList(): JSX.Element {
        const { events, loading } = this.state.history;
        if (loading && !events.length) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={28} />
                </Box>
            );
        }
        if (!events.length) {
            return (
                <Typography sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: '0.9rem' }}>
                    {I18n.t('fritzdm_noHistory')}
                </Typography>
            );
        }

        const groups: { day: string; rows: JSX.Element[] }[] = [];
        events.forEach((event, i) => {
            const day = dayLabel(event.ts, this.lang);
            // the newest event lasts until now, every other one until the next newer event
            const until = i === 0 ? this.state.now : events[i - 1].ts;
            const ongoing = i === 0 && this.present === event.present;
            const row = this.renderHistoryRow(event, until, ongoing);
            const last = groups[groups.length - 1];
            if (last?.day === day) {
                last.rows.push(row);
            } else {
                groups.push({ day, rows: [row] });
            }
        });

        return (
            <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
                {groups.map(group => (
                    <Box
                        key={group.day}
                        sx={{ mb: 1.5 }}
                    >
                        <Typography
                            component="div"
                            sx={theme => ({
                                py: 0.5,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: 'text.secondary',
                                borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                            })}
                        >
                            {group.day}
                        </Typography>
                        {group.rows}
                    </Box>
                ))}
            </Box>
        );
    }

    private renderHistoryDialog(): JSX.Element {
        const { source, instance, events } = this.state.history;
        const devices = String(this.values.devices ?? '').trim();
        const sourceText =
            source === 'history'
                ? I18n.t('fritzdm_historyFrom', instance || 'history')
                : source === 'adapter'
                  ? I18n.t('fritzdm_historyFromAdapter')
                  : '';

        return (
            <Dialog
                open
                onClose={this.closeHistory}
                maxWidth="xs"
                fullWidth
                aria-labelledby={`${this.dialogId}-title`}
                slotProps={{
                    paper: {
                        sx: {
                            maxHeight: 'min(760px, calc(100dvh - 32px))',
                            '@media (max-width: 599.95px)': { m: 1, width: 'calc(100% - 16px)' },
                        },
                    },
                }}
            >
                <DialogTitle
                    id={`${this.dialogId}-title`}
                    component="div"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1, py: 1.5 }}
                >
                    {this.renderAvatar('44px')}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            component="h2"
                            noWrap
                            sx={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.3 }}
                        >
                            {this.displayName}
                        </Typography>
                        {this.renderStatus('0.8rem', true)}
                    </Box>
                    <IconButton
                        onClick={() => this.loadHistory()}
                        title={I18n.t('fritzdm_refresh')}
                        aria-label={I18n.t('fritzdm_refresh')}
                        disabled={this.state.history.loading}
                    >
                        <RefreshIcon />
                    </IconButton>
                    <IconButton
                        onClick={this.closeHistory}
                        title={I18n.t('fritzdm_close')}
                        aria-label={I18n.t('fritzdm_close')}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pt: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {this.renderToday('0.8rem')}
                    {devices && this.present ? (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                color: 'text.secondary',
                                fontSize: '0.8rem',
                                minWidth: 0,
                            }}
                        >
                            <DevicesIcon sx={{ fontSize: '1.2em', flexShrink: 0 }} />
                            <Box
                                component="span"
                                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={devices}
                            >
                                {devices}
                            </Box>
                        </Box>
                    ) : null}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                        <HistoryIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                            {I18n.t('fritzdm_historyTitle')}
                        </Typography>
                    </Box>
                    <Box sx={{ minHeight: 0 }}>{this.renderHistoryList()}</Box>
                    {sourceText && events.length ? (
                        <Typography
                            variant="caption"
                            sx={{ color: 'text.disabled', textAlign: 'right' }}
                        >
                            {sourceText}
                        </Typography>
                    ) : null}
                </DialogContent>
            </Dialog>
        );
    }

    // ---- sizes --------------------------------------------------------------------

    /** 1x1: avatar, name, state and since when */
    renderCompact(): JSX.Element {
        return this.renderFrame(
            '1x1',
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                aspectRatio: '1',
                padding: isNeumorphicTheme(theme) ? 'max(12px, 8cqi)' : 'max(14px, 9cqi)',
            }),
            <>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', minHeight: 0 }}>
                    {this.renderAvatar('max(40px, 32cqi)')}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    {this.renderName('max(0.85rem, 9cqi)', 'max(0.68rem, 6.8cqi)')}
                    {this.renderStatus('max(0.7rem, 7.2cqi)', false)}
                    {this.renderSince('max(0.62rem, 6.2cqi)')}
                </Box>
            </>,
        );
    }

    /** 2x0.5: avatar, name, state with the duration, came and left */
    renderWide(): JSX.Element {
        const events = this.renderEvents('0.68rem', false);

        return this.renderFrame(
            '2x0.5',
            theme => ({
                display: 'flex',
                alignItems: 'center',
                gap: 'max(10px, 3cqi)',
                height: 80,
                padding: isNeumorphicTheme(theme) ? '8px 12px' : '8px 14px',
            }),
            <>
                {this.renderAvatar('48px')}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <Box sx={{ pr: '26px', minWidth: 0 }}>{this.renderName('0.9rem', '0.74rem')}</Box>
                    {this.renderStatus('0.74rem', true)}
                    {events}
                </Box>
            </>,
        );
    }

    /** 2x1: big avatar, name, state, since when, came and left with label */
    renderWideTall(): JSX.Element {
        return this.renderFrame(
            '2x1',
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '6px',
                height: '100%',
                padding: isNeumorphicTheme(theme) ? 'max(12px, 3.5cqi)' : 'max(14px, 4cqi)',
            }),
            <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 'max(12px, 3.5cqi)', minWidth: 0, flex: 1 }}>
                    {this.renderAvatar('max(52px, 19cqi)')}
                    <Box sx={{ flex: 1, minWidth: 0, pr: '20px' }}>
                        {this.renderName('max(0.95rem, 5.4cqi)', 'max(0.76rem, 3.8cqi)')}
                        {this.renderStatus('max(0.78rem, 3.9cqi)', false)}
                        {this.renderSince('max(0.7rem, 3.3cqi)')}
                    </Box>
                </Box>
                {this.renderEvents('max(0.68rem, 3.1cqi)', true)}
            </>,
        );
    }

    /** 2x2: everything - since when, came and left, today, the last comings and goings */
    renderHuge(): JSX.Element {
        const showHistory = this.canOpenHistory;
        const tileHistory = this.renderTileHistory('max(0.72rem, 2.9cqi)');

        return this.renderFrame(
            '2x2',
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                gap: 'max(8px, 2.6cqi)',
                aspectRatio: '1',
                padding: isNeumorphicTheme(theme) ? 'max(14px, 4.5cqi)' : 'max(16px, 5cqi)',
            }),
            <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 'max(12px, 3.5cqi)', minWidth: 0, pr: '26px' }}>
                    {this.renderAvatar('max(60px, 22cqi)')}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {this.renderName('max(1rem, 5.6cqi)', 'max(0.8rem, 4cqi)')}
                        {this.renderStatus('max(0.82rem, 3.8cqi)', false)}
                        {this.renderSince('max(0.74rem, 3.2cqi)')}
                    </Box>
                </Box>

                {this.renderEvents('max(0.72rem, 3cqi)', true)}
                {this.renderToday('max(0.68rem, 2.7cqi)')}
                {tileHistory}

                {showHistory ? (
                    <Box
                        sx={theme => ({
                            mt: 'auto',
                            pt: 'max(6px, 1.8cqi)',
                            borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            color: 'text.secondary',
                            fontSize: 'max(0.72rem, 2.9cqi)',
                            fontWeight: 600,
                            '& .MuiSvgIcon-root': { fontSize: '1.3em' },
                        })}
                    >
                        <HistoryIcon />
                        <Box
                            component="span"
                            sx={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {I18n.t('fritzdm_historyTitle')}
                        </Box>
                        <ChevronIcon />
                    </Box>
                ) : null}
            </>,
        );
    }
}

export default PersonComponent;
