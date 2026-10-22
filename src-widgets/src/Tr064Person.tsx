import React from 'react';

import { alpha, Box, IconButton, type Theme } from '@mui/material';
import { FileDownload as IconExport, Person as IconPerson, PersonOff as IconAway } from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic, { faint, muted, StateWatcher, type StateValues } from './Generic';
import { presenceSelectComponent } from './PresenceSelect';
import { toBool, toNumber, toText } from './format';
import {
    findPerson,
    formatDuration,
    formatEventTime,
    loadPersons,
    loadPresenceHistory,
    PERSON_STATES,
    type PersonRef,
    type PersonStateName,
    type PresenceHistory,
} from './shared/presenceApi';

interface Tr064PersonRxData {
    instance: string;
    /** name of the person as in the tab "Persons", not an object ID */
    person: string;
    noCard: boolean;
    widgetTitle: string;
    showName: boolean;
    /** shown instead of the name of the person */
    nameText: string;
    /** photo for both states, if a state has neither an own image nor an own icon */
    image: string;
    grayAbsent: boolean;
    presentIcon: string;
    presentImage: string;
    presentText: string;
    presentColor: string;
    absentIcon: string;
    absentImage: string;
    absentText: string;
    absentColor: string;
    showDuration: boolean;
    showArrival: boolean;
    showDeparture: boolean;
    showToday: boolean;
    showDevices: boolean;
    showHistory: boolean;
    historyCount: number | string;
    historyDays: number | string;
    /** button in the header of the history which downloads the comings and goings as a CSV file for Excel */
    showExport: boolean;
}

interface Tr064PersonState extends VisRxWidgetState {
    /** `null` while the persons of the instance are read */
    persons: PersonRef[] | null;
    /** Values of the states of the person, by full ID */
    personValues: StateValues;
    /** `null` while it is read or if it is not shown */
    history: PresenceHistory | null;
    /** Size of the content, measured */
    size: { width: number; height: number };
    /** only to render the durations again every minute */
    now: number;
}

/** The states of the person which are watched */
const WATCHED: PersonStateName[] = [
    'present',
    'lastArrival',
    'lastDeparture',
    'presentSince',
    'absentSince',
    'presentToday',
    'absentToday',
    'devices',
    'history',
];

/** Width of a detail box, its height and the gap between them, in px */
const DETAIL_W = 120;
const DETAIL_H = 40;
const GAP = 8;
/** Height of a row of the history and of its header */
const HISTORY_ROW = 28;
const HISTORY_HEAD = 22;
/** Events of the export at most */
const EXPORT_COUNT = 10_000;

/**
 * - `compact`: narrow - picture, name and status below each other, centered
 * - `row`: wide and flat - picture left, name and status right, the times right of them
 * - `full`: picture and name as header, the times as boxes below, then the history
 */
type PersonMode = 'compact' | 'row' | 'full';

interface PersonLayout {
    mode: PersonMode;
    /** px */
    avatar: number;
    /** compact, row: the duration below the status */
    durationLine: boolean;
    /** full: rows of detail boxes which fit; row: the times on the right */
    detailRows: number;
    columns: number;
    history: boolean;
}

interface Detail {
    key: string;
    label: string;
    value: string;
    /** a row of its own */
    wide?: boolean;
}

/** The picture of a state: its image, else its icon, else the general image, else the default icon */
interface Picture {
    image: string;
    icon: string;
}

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** An SVG can be colored as a mask, other pictures are shown as they are */
function isSvg(src: string): boolean {
    return /^data:image\/svg\+xml/i.test(src) || /\.svg(?:[?#].*)?$/i.test(src);
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

/** A field of the CSV file, quoted if it contains the separator, a quote or a line break */
function csvField(value: string | number, separator: string): string {
    const text = String(value);
    return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
/** One person of the presence detection (tab "Persons"): present or absent, since when, and the last comings and goings */
export default class Tr064Person extends Generic<Tr064PersonRxData, Tr064PersonState> {
    private watcher: StateWatcher | null = null;

    private observer: ResizeObserver | null = null;

    private rootElement: HTMLDivElement | null = null;

    private ticker: ReturnType<typeof setInterval> | null = null;

    private historyTimer: ReturnType<typeof setTimeout> | null = null;

    /** counts the loads, an answer of an older one is dropped */
    private loadCounter = 0;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            persons: null,
            personValues: {},
            history: null,
            size: { width: 0, height: 0 },
            now: Date.now(),
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplTr064Person',
            visSet: 'tr-064',
            visSetLabel: 'set_label',
            visSetColor: '#e2001a',
            visName: 'FRITZ!Box Person',
            visWidgetLabel: 'person',
            visHelp: 'person_help',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'instance',
                            type: 'instance',
                            adapter: 'tr-064',
                            default: 'tr-064.0',
                            label: 'instance',
                        },
                        {
                            name: 'person',
                            type: 'custom',
                            label: 'person',
                            tooltip: 'person_tooltip',
                            component: presenceSelectComponent('person'),
                        },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'widgetTitle', type: 'text', label: 'title', hidden: '!!data.noCard' },
                        { name: 'showName', type: 'checkbox', default: true, label: 'show_name' },
                        {
                            name: 'nameText',
                            type: 'text',
                            label: 'name',
                            tooltip: 'person_name_tooltip',
                            hidden: 'data.showName === false',
                        },
                        { name: 'image', type: 'image', label: 'image', tooltip: 'image_tooltip' },
                        { name: 'grayAbsent', type: 'checkbox', default: true, label: 'gray_absent' },
                    ],
                },
                {
                    name: 'present',
                    label: 'when_present',
                    fields: [
                        { name: 'presentIcon', type: 'icon64', label: 'icon' },
                        { name: 'presentImage', type: 'image', label: 'image', tooltip: 'state_image_tooltip' },
                        { name: 'presentText', type: 'text', label: 'text', tooltip: 'present_text_tooltip' },
                        { name: 'presentColor', type: 'color', label: 'color' },
                    ],
                },
                {
                    name: 'absent',
                    label: 'when_absent',
                    fields: [
                        { name: 'absentIcon', type: 'icon64', label: 'icon' },
                        { name: 'absentImage', type: 'image', label: 'image', tooltip: 'state_image_tooltip' },
                        { name: 'absentText', type: 'text', label: 'text', tooltip: 'absent_text_tooltip' },
                        { name: 'absentColor', type: 'color', label: 'color' },
                    ],
                },
                {
                    name: 'times',
                    label: 'times',
                    fields: [
                        { name: 'showDuration', type: 'checkbox', default: true, label: 'show_duration' },
                        { name: 'showArrival', type: 'checkbox', default: true, label: 'show_arrival' },
                        { name: 'showDeparture', type: 'checkbox', default: true, label: 'show_departure' },
                        { name: 'showToday', type: 'checkbox', default: false, label: 'show_today' },
                        { name: 'showDevices', type: 'checkbox', default: false, label: 'show_devices' },
                    ],
                },
                {
                    name: 'history',
                    label: 'history',
                    fields: [
                        {
                            name: 'showHistory',
                            type: 'checkbox',
                            default: true,
                            label: 'show_history',
                            tooltip: 'show_history_tooltip',
                        },
                        {
                            name: 'historyCount',
                            type: 'number',
                            default: 10,
                            min: 1,
                            max: 100,
                            label: 'history_count',
                            hidden: 'data.showHistory === false',
                        },
                        {
                            name: 'historyDays',
                            type: 'number',
                            default: 7,
                            min: 1,
                            max: 365,
                            label: 'history_days',
                            tooltip: 'history_days_tooltip',
                            hidden: 'data.showHistory === false',
                        },
                        {
                            name: 'showExport',
                            type: 'checkbox',
                            default: true,
                            label: 'show_export',
                            tooltip: 'show_export_tooltip',
                            hidden: 'data.showHistory === false',
                        },
                    ],
                },
            ],
            visDefaultStyle: { width: 300, height: 340, position: 'relative' },
            visPrev: 'widgets/tr-064/img/prev_tr064_person.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return Tr064Person.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.watcher = new StateWatcher(this.getWatchSocket(), personValues => this.onValues(personValues));
        // the durations change every minute
        this.ticker = setInterval(() => this.setState({ now: Date.now() }), 60_000);
        void this.loadPerson();
    }

    componentWillUnmount(): void {
        this.watcher?.stop();
        this.watcher = null;
        this.observer?.disconnect();
        this.observer = null;
        if (this.ticker) {
            clearInterval(this.ticker);
            this.ticker = null;
        }
        if (this.historyTimer) {
            clearTimeout(this.historyTimer);
            this.historyTimer = null;
        }
        super.componentWillUnmount();
    }

    onRxDataChanged(prevRxData: Tr064PersonRxData): void {
        const rxData = this.state.rxData;
        if (prevRxData.instance !== rxData.instance || prevRxData.person !== rxData.person) {
            this.setState({ persons: null, history: null }, () => void this.loadPerson());
        } else if (
            prevRxData.showHistory !== rxData.showHistory ||
            prevRxData.historyCount !== rxData.historyCount ||
            prevRxData.historyDays !== rxData.historyDays
        ) {
            void this.loadHistory();
        }
    }

    /** The person of the attribute `person`, `undefined` if it is not set or not found */
    private getPerson(): PersonRef | undefined {
        return this.state.persons ? findPerson(this.state.persons, this.state.rxData.person) : undefined;
    }

    private async loadPerson(): Promise<void> {
        const persons = await loadPersons(this.getPresenceSocket(), this.getInstanceId());
        if (!this.watcher) {
            return; // unmounted meanwhile
        }
        const person = findPerson(persons, this.state.rxData.person);
        this.watcher.watch(person ? WATCHED.map(name => `${person.id}.${PERSON_STATES[name]}`) : []);
        this.setState({ persons }, () => void this.loadHistory());
    }

    /** The comings and goings, from a history instance or the state `history` of the adapter */
    private async loadHistory(): Promise<void> {
        const counter = ++this.loadCounter;
        const person = this.getPerson();
        if (!person || this.state.rxData.showHistory === false) {
            this.setState({ history: null });
            return;
        }
        const history = await loadPresenceHistory(this.getPresenceSocket(), person.id, {
            count: clamp(Math.round(Number(this.state.rxData.historyCount) || 10), 1, 100),
            days: clamp(Math.round(Number(this.state.rxData.historyDays) || 7), 1, 365),
        });
        if (this.watcher && counter === this.loadCounter) {
            this.setState({ history });
        }
    }

    /**
     * Downloads the comings and goings of the last `historyDays` days as a CSV file which Excel opens directly:
     * UTF-8 with BOM, `;` as separator for the languages whose Excel expects it, the oldest event first
     */
    private exportHistory = async (): Promise<void> => {
        const person = this.getPerson();
        if (!person) {
            return;
        }
        const history = await loadPresenceHistory(this.getPresenceSocket(), person.id, {
            count: EXPORT_COUNT,
            days: clamp(Math.round(Number(this.state.rxData.historyDays) || 7), 1, 365),
        });
        const lang = Generic.getLanguage();
        const separator = lang === 'en' || lang === 'zh-cn' ? ',' : ';';
        const present = this.isPresent();
        const events = [...history.events].reverse();
        const rows = [
            [Generic.t('date'), Generic.t('time'), Generic.t('event'), Generic.t('duration_minutes')],
            ...events.map((event, i) => {
                // how long the state of the event lasted: until the next event, the newest one until now
                const end = i < events.length - 1 ? events[i + 1].ts : event.present === present ? Date.now() : 0;
                const date = new Date(event.ts);
                return [
                    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
                    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
                    Generic.t(event.present ? 'arrived' : 'departed'),
                    end > event.ts ? Math.round((end - event.ts) / 60_000) : '',
                ];
            }),
        ];
        const csv = rows.map(row => row.map(value => csvField(value, separator)).join(separator)).join('\r\n');
        const now = new Date();
        const fileName = `${person.name.replace(/[\\/:*?"<>|]+/g, '_')}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
        // the byte order mark tells Excel that the file is UTF-8
        const bom = String.fromCharCode(0xfeff);
        const url = URL.createObjectURL(new Blob([`${bom}${csv}\r\n`], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    /** New values: a coming or going reloads the history - a little later, so a history instance has it */
    private onValues(personValues: StateValues): void {
        const person = this.getPerson();
        const changed =
            !!person &&
            ['present', 'history'].some(name => {
                const id = `${person.id}.${name}`;
                return id in this.state.personValues && this.state.personValues[id] !== personValues[id];
            });
        this.setState({ personValues });
        if (changed) {
            if (this.historyTimer) {
                clearTimeout(this.historyTimer);
            }
            this.historyTimer = setTimeout(() => {
                this.historyTimer = null;
                void this.loadHistory();
            }, 1000);
        }
    }

    /** Callback ref of the content: measures it, also when the element is replaced */
    private setRoot = (element: HTMLDivElement | null): void => {
        if (element === this.rootElement) {
            return;
        }
        this.observer?.disconnect();
        this.observer = null;
        this.rootElement = element;
        if (!element) {
            return;
        }
        const measure = (width: number, height: number): void => {
            const size = { width: Math.round(width), height: Math.round(height) };
            if (size.width !== this.state.size.width || size.height !== this.state.size.height) {
                this.setState({ size });
            }
        };
        const rect = element.getBoundingClientRect();
        measure(rect.width, rect.height);
        if (typeof ResizeObserver !== 'undefined') {
            this.observer = new ResizeObserver(entries => {
                const box = entries[0]?.borderBoxSize?.[0];
                if (box) {
                    measure(box.inlineSize, box.blockSize);
                } else if (entries[0]) {
                    measure(entries[0].contentRect.width, entries[0].contentRect.height);
                }
            });
            this.observer.observe(element);
        }
    };

    /** A height in the style of the widget: otherwise the widget grows with its content and only the width counts */
    private hasFixedHeight(): boolean {
        const height = this.state.rxStyle?.height;
        return height !== undefined && height !== null && height !== '' && height !== 'auto';
    }

    private value(name: PersonStateName): ioBroker.StateValue | undefined {
        const person = this.getPerson();
        return person ? this.state.personValues[`${person.id}.${PERSON_STATES[name]}`] : undefined;
    }

    /** The times which are switched on, in the order they are dropped from the end if the widget is too small */
    private getDetails(): Detail[] {
        const rxData = this.state.rxData;
        const lang = Generic.getLanguage();
        const details: Detail[] = [];
        const time = (name: 'lastArrival' | 'lastDeparture'): string =>
            formatEventTime(toNumber(this.value(name)) || 0, lang);
        const minutes = (name: 'presentToday' | 'absentToday'): string => {
            const value = toNumber(this.value(name));
            return value === undefined ? '—' : formatDuration(value * 60_000, lang);
        };
        if (rxData.showArrival !== false) {
            details.push({ key: 'arrival', label: Generic.t('arrived'), value: time('lastArrival') });
        }
        if (rxData.showDeparture !== false) {
            details.push({ key: 'departure', label: Generic.t('departed'), value: time('lastDeparture') });
        }
        if (rxData.showToday) {
            details.push({ key: 'presentToday', label: Generic.t('present_today'), value: minutes('presentToday') });
            details.push({ key: 'absentToday', label: Generic.t('absent_today'), value: minutes('absentToday') });
        }
        if (rxData.showDevices) {
            details.push({
                key: 'devices',
                label: Generic.t('devices'),
                value: toText(this.value('devices')) || '—',
                wide: true,
            });
        }
        return details;
    }

    /** Rows of the detail boxes with `columns` boxes each, a wide one has a row of its own */
    private static detailRows(details: Detail[], columns: number): Detail[][] {
        const rows: Detail[][] = [];
        let current: Detail[] = [];
        for (const detail of details) {
            if (detail.wide || current.length >= columns) {
                if (current.length) {
                    rows.push(current);
                }
                current = [];
            }
            current.push(detail);
            if (detail.wide) {
                rows.push(current);
                current = [];
            }
        }
        if (current.length) {
            rows.push(current);
        }
        return rows;
    }

    private getLayout(details: Detail[]): PersonLayout {
        let { width, height } = this.state.size;
        if (!width) {
            // not measured yet: the size of the style, if it is given in pixels
            width = (parseInt(String(this.state.rxStyle?.width ?? ''), 10) || 300) - 32;
            height = (parseInt(String(this.state.rxStyle?.height ?? ''), 10) || 340) - 32;
        }
        const fixedHeight = this.hasFixedHeight();
        const h = fixedHeight ? height : Infinity;
        const rxData = this.state.rxData;
        const showName = rxData.showName !== false;
        const showDuration = rxData.showDuration !== false;
        const layout: PersonLayout = {
            mode: 'full',
            avatar: 56,
            durationLine: false,
            detailRows: 0,
            columns: 1,
            history: false,
        };

        if (width < 200) {
            layout.mode = 'compact';
            // name 20, status 18 (a long hint two lines), duration 16 px and the gaps
            const status = this.getTexts(this.isPresent()).hint.length > 16 ? 34 : 18;
            const text = (showName ? 20 : 0) + status + 8;
            const free = Math.min(h, 400) - text;
            layout.durationLine = showDuration && free - 16 >= 40;
            layout.avatar = Math.round(clamp(Math.min(width * 0.6, free - (layout.durationLine ? 16 : 0)), 28, 140));
            return layout;
        }

        if (fixedHeight && height < 100) {
            layout.mode = 'row';
            layout.avatar = Math.round(clamp(height - 8, 32, 72));
            // the arrival and departure right of the name
            layout.detailRows = width >= 300 && height >= 44 ? 1 : 0;
            // name, status and duration need 54 px
            layout.durationLine = showDuration && height >= 54;
            return layout;
        }

        layout.avatar = width >= 320 && h >= 200 ? 64 : 52;
        layout.columns = Math.max(1, Math.floor((width + GAP) / (DETAIL_W + GAP)));
        let free = h - layout.avatar - 12;
        const rows = Tr064Person.detailRows(details, layout.columns).length;
        while (layout.detailRows < rows && free >= DETAIL_H) {
            layout.detailRows++;
            free -= DETAIL_H + GAP;
        }
        layout.history = rxData.showHistory !== false && free >= 4 + HISTORY_HEAD + 2 * HISTORY_ROW;
        return layout;
    }

    /** Status of the person: `undefined` while it is not known */
    private isPresent(): boolean | undefined {
        return toBool(this.value('present'));
    }

    private getPicture(present: boolean | undefined): Picture {
        const rxData = this.state.rxData;
        if (present === undefined) {
            return { image: this.getImageUrl(rxData.image), icon: '' };
        }
        const prefix = present ? 'present' : 'absent';
        const own = this.getImageUrl(rxData[`${prefix}Image`]);
        const icon = own ? '' : (rxData[`${prefix}Icon`] || '').trim();
        return { image: own || (icon ? '' : this.getImageUrl(rxData.image)), icon };
    }

    /** Color of a state: the configured one, green for present, gray for absent and unknown */
    private getColor(theme: Theme, present: boolean | undefined): string {
        if (present === undefined) {
            return faint(theme);
        }
        const color = ((present ? this.state.rxData.presentColor : this.state.rxData.absentColor) || '').trim();
        return color || (present ? theme.palette.success.main : muted(theme));
    }

    /** Text of a state: the configured one or `present`/`away` */
    private getStateText(present: boolean | undefined): string {
        if (present === undefined) {
            return '…';
        }
        const rxData = this.state.rxData;
        const text = (present ? rxData.presentText : rxData.absentText) || '';
        return text.trim() || Generic.t(present ? 'present' : 'away');
    }

    /** Since when the person is present or absent, in ms; 0 if it is not known */
    private getDuration(present: boolean | undefined): number {
        if (present === undefined) {
            return 0;
        }
        const now = Date.now();
        const since = toNumber(this.value(present ? 'lastArrival' : 'lastDeparture'));
        if (since && since <= now) {
            return now - since;
        }
        const minutes = toNumber(this.value(present ? 'presentSince' : 'absentSince'));
        return minutes ? minutes * 60_000 : 0;
    }

    // ---- render parts -------------------------------------------------------

    private renderAvatar(size: number, present: boolean | undefined): React.JSX.Element {
        const gray = present === false && this.state.rxData.grayAbsent !== false;
        const picture = this.getPicture(present);
        return (
            <Box
                sx={theme => {
                    const color = this.getColor(theme, present);
                    return {
                        position: 'relative',
                        flex: '0 0 auto',
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color,
                        backgroundColor: picture.image ? 'transparent' : alpha(color, 0.15),
                        // a ring in the color of the state around a photo
                        boxShadow: picture.image
                            ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 ${size >= 48 ? 4 : 3}px ${color}`
                            : undefined,
                        transition: 'box-shadow 0.3s, background-color 0.3s',
                        '& .MuiSvgIcon-root': { width: '58%', height: '58%' },
                    };
                }}
            >
                {Tr064Person.renderPicture(picture, present, gray)}
            </Box>
        );
    }

    private static renderPicture(picture: Picture, present: boolean | undefined, gray: boolean): React.JSX.Element {
        const { image, icon } = picture;
        if (image) {
            return (
                <Box
                    component="img"
                    src={image}
                    alt=""
                    sx={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        filter: gray ? 'grayscale(1)' : undefined,
                        opacity: gray ? 0.6 : 1,
                        transition: 'filter 0.3s, opacity 0.3s',
                    }}
                />
            );
        }
        if (icon && isSvg(icon)) {
            // colored with the color of the state
            const mask = `url("${icon.replace(/"/g, '%22')}") center / contain no-repeat`;
            return (
                <Box
                    component="span"
                    sx={{
                        width: '58%',
                        height: '58%',
                        backgroundColor: 'currentColor',
                        mask,
                        WebkitMask: mask,
                    }}
                />
            );
        }
        if (icon) {
            return (
                <Box
                    component="img"
                    src={icon}
                    alt=""
                    sx={{ width: '58%', height: '58%', objectFit: 'contain' }}
                />
            );
        }
        return present === false ? <IconAway /> : <IconPerson />;
    }

    /** Name, status and duration of the person */
    private getTexts(present: boolean | undefined): { name: string; hint: string } {
        const rxData = this.state.rxData;
        const wanted = (rxData.person || '').trim();
        const person = this.getPerson();
        const name = (rxData.nameText || '').trim() || person?.name || wanted || Generic.t('person');
        let hint = '';
        if (!wanted) {
            hint = Generic.t('select_person');
        } else if (this.state.persons && !person) {
            hint = Generic.t('person_not_found', wanted);
        } else if (present === undefined) {
            hint = '…';
        }
        return { name, hint };
    }

    private renderStatus(present: boolean | undefined, fontSize: number, center: boolean): React.JSX.Element {
        const { hint } = this.getTexts(present);
        return (
            <Box
                sx={theme => {
                    return {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: center ? 'center' : 'flex-start',
                        gap: '6px',
                        minWidth: 0,
                        fontSize,
                        lineHeight: 1.3,
                        fontWeight: 600,
                        color: hint ? muted(theme) : this.getColor(theme, present),
                    };
                }}
            >
                {hint ? null : (
                    <Box
                        component="span"
                        sx={theme => {
                            const color = this.getColor(theme, present);
                            return {
                                flex: '0 0 auto',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: color,
                                boxShadow: present ? `0 0 0 3px ${alpha(color, 0.18)}` : undefined,
                            };
                        }}
                    />
                )}
                <Box
                    component="span"
                    sx={
                        hint
                            ? {
                                  // a hint may take two lines
                                  overflow: 'hidden',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  textAlign: center ? 'center' : 'left',
                                  fontWeight: 400,
                              }
                            : { ...ellipsis, fontWeight: 600 }
                    }
                >
                    {hint || this.getStateText(present)}
                </Box>
            </Box>
        );
    }

    private renderDurationText(
        present: boolean | undefined,
        fontSize: number,
        center: boolean,
    ): React.JSX.Element | null {
        const duration = this.getDuration(present);
        if (this.state.rxData.showDuration === false || !duration) {
            return null;
        }
        return (
            <Box
                sx={theme => ({
                    ...ellipsis,
                    fontSize,
                    lineHeight: 1.35,
                    color: muted(theme),
                    textAlign: center ? 'center' : 'left',
                })}
            >
                {Generic.t('for_duration', formatDuration(duration, Generic.getLanguage()))}
            </Box>
        );
    }

    private renderName(name: string, fontSize: number, center: boolean): React.JSX.Element | null {
        if (this.state.rxData.showName === false) {
            return null;
        }
        return (
            <Box
                sx={{ ...ellipsis, fontSize, fontWeight: 600, lineHeight: 1.3, textAlign: center ? 'center' : 'left' }}
            >
                {name}
            </Box>
        );
    }

    private renderCompact(layout: PersonLayout, present: boolean | undefined): React.JSX.Element {
        const { name } = this.getTexts(present);
        return (
            <Box
                sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    minWidth: 0,
                }}
            >
                <Box sx={{ mb: '4px' }}>{this.renderAvatar(layout.avatar, present)}</Box>
                <Box sx={{ width: '100%', minWidth: 0 }}>{this.renderName(name, 15, true)}</Box>
                <Box sx={{ width: '100%', minWidth: 0 }}>{this.renderStatus(present, 13, true)}</Box>
                {layout.durationLine ? (
                    <Box sx={{ width: '100%', minWidth: 0 }}>{this.renderDurationText(present, 12, true)}</Box>
                ) : null}
            </Box>
        );
    }

    private renderHeader(layout: PersonLayout, present: boolean | undefined): React.JSX.Element {
        const { name } = this.getTexts(present);
        const big = layout.avatar >= 64;
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: '0 0 auto' }}>
                {this.renderAvatar(layout.avatar, present)}
                <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {this.renderName(name, big ? 18 : 16, false)}
                    {this.renderStatus(present, big ? 14 : 13, false)}
                    {this.renderDurationText(present, 12, false)}
                </Box>
            </Box>
        );
    }

    private renderRow(layout: PersonLayout, details: Detail[], present: boolean | undefined): React.JSX.Element {
        const { name } = this.getTexts(present);
        const times = layout.detailRows ? details.filter(d => d.key === 'arrival' || d.key === 'departure') : [];
        return (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                {this.renderAvatar(layout.avatar, present)}
                <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {this.renderName(name, 15, false)}
                    {this.renderStatus(present, 13, false)}
                    {layout.durationLine ? this.renderDurationText(present, 12, false) : null}
                </Box>
                {times.length ? (
                    <Box
                        sx={theme => ({
                            flex: '0 0 auto',
                            display: 'grid',
                            gridTemplateColumns: 'auto auto',
                            columnGap: '8px',
                            rowGap: '2px',
                            fontSize: 12,
                            lineHeight: 1.35,
                            color: muted(theme),
                        })}
                    >
                        {times.map(detail => (
                            <React.Fragment key={detail.key}>
                                <span>{detail.label}</span>
                                <Box
                                    component="span"
                                    sx={theme => ({
                                        color: theme.palette.text.primary,
                                        fontWeight: 600,
                                        textAlign: 'right',
                                    })}
                                >
                                    {detail.value}
                                </Box>
                            </React.Fragment>
                        ))}
                    </Box>
                ) : null}
            </Box>
        );
    }

    private static renderDetails(rows: Detail[][], columns: number): React.JSX.Element | null {
        if (!rows.length) {
            return null;
        }
        return (
            <Box
                sx={{
                    flex: '0 0 auto',
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: `${GAP}px`,
                }}
            >
                {rows.flat().map(detail => (
                    <Box
                        key={detail.key}
                        sx={theme => ({
                            gridColumn: detail.wide ? '1 / -1' : undefined,
                            minWidth: 0,
                            height: DETAIL_H,
                            boxSizing: 'border-box',
                            px: '10px',
                            py: '4px',
                            borderRadius: '10px',
                            backgroundColor: alpha(theme.palette.text.primary, 0.05),
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                        })}
                    >
                        <Box sx={theme => ({ ...ellipsis, fontSize: 11, lineHeight: 1.3, color: muted(theme) })}>
                            {detail.label}
                        </Box>
                        <Box sx={{ ...ellipsis, fontSize: 14, lineHeight: 1.3, fontWeight: 600 }}>{detail.value}</Box>
                    </Box>
                ))}
            </Box>
        );
    }

    private renderHistory(scroll: boolean): React.JSX.Element {
        const history = this.state.history;
        const lang = Generic.getLanguage();
        const events = history?.events || [];
        const present = this.isPresent();
        return (
            <Box
                sx={{
                    flex: scroll ? '1 1 auto' : '0 0 auto',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Box
                    sx={theme => ({
                        flex: '0 0 auto',
                        height: HISTORY_HEAD,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: muted(theme),
                        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                    })}
                >
                    <span style={ellipsis}>{Generic.t('history')}</span>
                    {history?.source === 'history' && history.instance ? (
                        <Box
                            component="span"
                            sx={theme => ({
                                fontSize: 11,
                                fontWeight: 400,
                                color: faint(theme),
                                flex: '0 0 auto',
                                ml: 'auto',
                            })}
                        >
                            {history.instance}
                        </Box>
                    ) : null}
                    {this.state.rxData.showExport !== false && events.length ? (
                        <IconButton
                            size="small"
                            title={Generic.t('export_excel')}
                            disabled={this.state.editMode}
                            onClick={() => void this.exportHistory()}
                            sx={{
                                flex: '0 0 auto',
                                p: '2px',
                                color: 'inherit',
                                '& .MuiSvgIcon-root': { fontSize: 16 },
                            }}
                        >
                            <IconExport />
                        </IconButton>
                    ) : null}
                </Box>
                <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: scroll ? 'auto' : 'visible' }}>
                    {!history ? (
                        <Box sx={theme => ({ fontSize: 12, color: muted(theme), py: '6px' })}>…</Box>
                    ) : !events.length ? (
                        <Box sx={theme => ({ fontSize: 12, color: muted(theme), py: '6px' })}>
                            {Generic.t('no_history')}
                        </Box>
                    ) : (
                        events.map((event, i) => {
                            // how long the state of the event lasted: until the next event, the newest one until now
                            const end = i ? events[i - 1].ts : event.present === present ? Date.now() : 0;
                            const duration = end > event.ts ? formatDuration(end - event.ts, lang) : '';
                            return (
                                <Box
                                    key={`${event.ts}_${i}`}
                                    sx={{
                                        height: HISTORY_ROW,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        minWidth: 0,
                                        fontSize: 13,
                                    }}
                                >
                                    <Box
                                        component="span"
                                        sx={theme => ({
                                            flex: '0 0 auto',
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            backgroundColor: this.getColor(theme, event.present),
                                        })}
                                    />
                                    <Box
                                        component="span"
                                        sx={{ flex: '0 1 auto', ...ellipsis, fontWeight: 600 }}
                                    >
                                        {Generic.t(event.present ? 'arrived' : 'departed')}
                                    </Box>
                                    {duration ? (
                                        <Box
                                            component="span"
                                            sx={theme => ({
                                                flex: '0 1 auto',
                                                ...ellipsis,
                                                fontSize: 12,
                                                color: muted(theme),
                                            })}
                                        >
                                            {duration}
                                        </Box>
                                    ) : null}
                                    <Box
                                        component="span"
                                        sx={theme => ({
                                            flex: '0 0 auto',
                                            ml: 'auto',
                                            fontSize: 12,
                                            color: muted(theme),
                                            fontVariantNumeric: 'tabular-nums',
                                        })}
                                    >
                                        {formatEventTime(event.ts, lang)}
                                    </Box>
                                </Box>
                            );
                        })
                    )}
                </Box>
            </Box>
        );
    }

    private renderFull(layout: PersonLayout, details: Detail[], present: boolean | undefined): React.JSX.Element {
        const rows = Tr064Person.detailRows(details, layout.columns).slice(0, layout.detailRows);
        return (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                {this.renderHeader(layout, present)}
                {Tr064Person.renderDetails(rows, layout.columns)}
                {layout.history ? this.renderHistory(this.hasFixedHeight()) : null}
            </Box>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const present = this.isPresent();
        const details = this.getDetails();
        const layout = this.getLayout(details);
        let content: React.JSX.Element;
        switch (layout.mode) {
            case 'compact':
                content = this.renderCompact(layout, present);
                break;
            case 'row':
                content = this.renderRow(layout, details, present);
                break;
            default:
                content = this.renderFull(layout, details, present);
                break;
        }

        const body = (
            <Box
                ref={this.setRoot}
                className="tr064-person"
                sx={theme => ({
                    flex: '1 1 auto',
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    fontFamily: theme.typography.fontFamily,
                    color: theme.palette.text.primary,
                })}
            >
                {content}
            </Box>
        );

        if (this.state.rxData.noCard || props.widget?.usedInWidget) {
            return (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {body}
                </div>
            );
        }
        return this.wrapContent(body, null, {
            alignItems: 'stretch',
            minHeight: 0,
            padding: 12,
            paddingBottom: 12,
            // explicit box-sizing: with a CssBaseline the card content is border-box, without it content-box
            boxSizing: 'border-box',
            height: '100%',
            overflow: 'hidden',
        });
    }
}
