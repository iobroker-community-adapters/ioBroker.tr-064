/**
 * `<iob-tr064-person>`: one person of the presence detection, like the devices widget `PersonComponent` and the
 * vis-2 widget `Tr064Person` - photo or symbol, present or away and for how long, arrival and departure, the time at
 * home today, the devices and the last comings and goings (from a history instance or the adapter), which can be
 * downloaded as CSV.
 *
 * The person is the channel `tr-064.<n>.presence.persons.<name>`. Three layouts by container queries: `compact`
 * (narrow), `row` (flat) and the full one.
 */
import type { CSSProperties, JSX, KeyboardEvent, ReactNode } from 'react';

import type { WebComponentSettings } from '@iobroker/web-components';
import { defineWebComponent } from '@iobroker/web-components/element';

import {
    formatDuration,
    formatEventTime,
    loadPresenceHistory,
    PERSON_STATES,
    type PersonStateName,
    type PresenceHistory,
} from '../../src-shared/presenceApi';
import { toBool, toNumber, toText } from '../../src-widgets/src/format';
import { Tr064Element } from './base';
import { COMPONENTS } from './constants';
import { Icon } from './icons';
import { Hint, intSetting, nameText, textSetting, valueOf } from './ui';

interface PersonSettings extends WebComponentSettings {
    person?: string;
    showName?: boolean;
    nameText?: string;
    image?: string;
    grayAbsent?: boolean;
    presentText?: string;
    presentColor?: string;
    absentText?: string;
    absentColor?: string;
    showDuration?: boolean;
    showArrival?: boolean;
    showDeparture?: boolean;
    showToday?: boolean;
    showDevices?: boolean;
    showHistory?: boolean;
    historyCount?: number;
    historyDays?: number;
    showExport?: boolean;
}

/** One box of the details: a label and a value */
interface Detail {
    key: string;
    label: string;
    value: string;
    /** a row of its own */
    wide?: boolean;
}

/** The comings and goings of the export: the last `historyDays` days, at most this many */
const EXPORT_COUNT = 10_000;

/** The channel of a person and the instance, from the ID of the channel or of a state below it */
const PERSON_ID = /^(tr-064\.\d+\.presence\.persons\.[^.]+)(?:\.|$)/;

const CSS = `
.person { height: 100%; min-height: 0; padding: clamp(4px, 3cqmin, 12px); }
.v { display: none; height: 100%; min-height: 0; min-width: 0; }
.v-full { display: flex; flex-direction: column; gap: 12px; }
@container (max-width: 199.98px) {
    .v-full { display: none; }
    .v-compact { display: flex; }
}
@container (min-width: 200px) and (max-height: 99.98px) {
    .v-full { display: none; }
    .v-row { display: flex; }
}
.avatar {
    position: relative;
    flex: 0 0 auto;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color);
    background: color-mix(in srgb, var(--color) 15%, transparent);
    transition: box-shadow 0.3s, background-color 0.3s;
}
.avatar.photo {
    background: transparent;
    box-shadow: 0 0 0 2px var(--iob-paper), 0 0 0 4px var(--color);
}
.avatar > .icon { width: 58%; height: 58%; }
.avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; transition: filter 0.3s, opacity 0.3s; }
.avatar img.gray { filter: grayscale(1); opacity: 0.6; }
.name { font-weight: 600; line-height: 1.3; }
.state { display: flex; align-items: center; gap: 6px; min-width: 0; line-height: 1.3; font-weight: 600; color: var(--color); }
.state .dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--color); }
.state .dot.present { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color) 18%, transparent); }
.state.hint { font-weight: 400; color: color-mix(in srgb, currentColor 64%, transparent); }
.state.hint span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.duration { font-size: 12px; line-height: 1.35; }

/* compact */
.v-compact { flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
.v-compact .avatar { --size: clamp(28px, min(60cqi, 100cqh - 70px), 140px); margin-bottom: 4px; }
.v-compact .name { font-size: 15px; width: 100%; }
.v-compact .state { font-size: 13px; justify-content: center; width: 100%; }
.v-compact .duration { width: 100%; display: none; }
@container (min-height: 130px) {
    .v-compact .duration { display: block; }
}

/* row */
.v-row { align-items: center; gap: 12px; }
.v-row .avatar { --size: clamp(32px, 100cqh - 8px, 72px); }
.v-row .texts { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.v-row .name { font-size: 15px; }
.v-row .state { font-size: 13px; }
.v-row .duration, .v-row .times { display: none; }
@container (min-height: 54px) {
    .v-row .duration { display: block; }
}
@container (min-width: 300px) and (min-height: 44px) {
    .v-row .times { display: grid; }
}
.times { flex: 0 0 auto; grid-template-columns: auto auto; column-gap: 8px; row-gap: 2px; font-size: 12px; line-height: 1.35; }
.times .value { color: var(--iob-text); font-weight: 600; text-align: right; }

/* full */
.header { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; min-width: 0; }
.header .avatar { --size: 52px; }
.header .texts { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.header .name { font-size: 16px; }
.header .state { font-size: 13px; }
@container (min-width: 320px) and (min-height: 200px) {
    .header .avatar { --size: 64px; }
    .header .name { font-size: 18px; }
    .header .state { font-size: 14px; }
}
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.details { flex: 0 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.detail {
    min-width: 0;
    min-height: 40px;
    padding: 4px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, currentColor 5%, transparent);
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.detail.wide { grid-column: 1 / -1; }
.detail .label { font-size: 11px; line-height: 1.3; }
.detail .value { font-size: 14px; font-weight: 600; line-height: 1.3; }
.detail.wide .value { white-space: normal; overflow-wrap: anywhere; }
.history { flex: 0 0 auto; display: flex; flex-direction: column; }
.history-dialog { padding: 0 4px 12px; max-height: 70vh; overflow-y: auto; }
.history-dialog .history { display: flex; }
@container (max-height: 179.98px) {
    .history { display: none; }
}
.history-head {
    height: 22px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}
.history-head .source { margin-left: auto; font-size: 11px; font-weight: 400; }
.history-head .icon-button { font-size: 16px; padding: 2px; }
.history-empty { font-size: 12px; padding: 6px 0; }
.event { height: 28px; display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; }
.event .dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--color); }
.event .what { flex: 0 1 auto; font-weight: 600; }
.event .long { flex: 0 1 auto; font-size: 12px; }
.event .when { flex: 0 0 auto; margin-left: auto; font-size: 12px; font-variant-numeric: tabular-nums; }
`;

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

/** A field of a CSV file, quoted if it has to be */
function csvField(value: string | number, separator: string): string {
    const text = String(value);
    return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function vars(values: Record<string, string>): CSSProperties {
    return values;
}

class Tr064Person extends Tr064Element<PersonSettings> {
    #history: PresenceHistory | null = null;

    /** For which person and settings `#history` was read */
    #historyKey = '';

    #historyTimer: ReturnType<typeof setTimeout> | null = null;

    #loadCounter = 0;

    /** The values of `present` and `history` of the last drawing: a change reads the history again */
    #seen = '';

    #ticker: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super(CSS);
    }

    override connectedCallback(): void {
        super.connectedCallback();
        // the durations go on
        this.#ticker ||= setInterval(() => this.requestDraw(), 60_000);
    }

    override disconnectedCallback(): void {
        if (this.#ticker) {
            clearInterval(this.#ticker);
            this.#ticker = null;
        }
        if (this.#historyTimer) {
            clearTimeout(this.#historyTimer);
            this.#historyTimer = null;
        }
        // read again when the element comes back
        this.#historyKey = '';
        super.disconnectedCallback();
    }

    /** The channel of the person, null if the setting names none */
    static #channelOf(settings: PersonSettings): string | null {
        return textSetting(settings.person).match(PERSON_ID)?.[1] || null;
    }

    protected override getObjectIds(settings: PersonSettings): (string | null)[] {
        // the name of the person
        return [Tr064Person.#channelOf(settings)];
    }

    protected override getStateIds(settings: PersonSettings): string[] {
        const channel = Tr064Person.#channelOf(settings);
        return channel ? Object.values(PERSON_STATES).map(name => `${channel}.${name}`) : [];
    }

    get #channel(): string | null {
        return Tr064Person.#channelOf(this.settings);
    }

    #value(name: PersonStateName): ioBroker.StateValue | undefined {
        const channel = this.#channel;
        return channel ? valueOf(this.states, `${channel}.${PERSON_STATES[name]}`) : undefined;
    }

    #historyOptions(): { count: number; days: number } {
        return {
            count: intSetting(this.settings.historyCount, 10, 1, 100),
            days: intSetting(this.settings.historyDays, 7, 1, 365),
        };
    }

    /** Reads the history when the person or its settings changed, and a moment after a coming or going */
    #updateHistory(channel: string): void {
        if (this.settings.showHistory === false || !this.socket) {
            this.#history = null;
            this.#historyKey = '';
            return;
        }
        const options = this.#historyOptions();
        const key = `${channel}|${options.count}|${options.days}`;
        const seen = `${String(this.#value('present'))}|${String(this.#value('history'))}`;
        if (key !== this.#historyKey) {
            this.#historyKey = key;
            this.#history = null;
            this.#seen = seen;
            void this.#loadHistory(channel, options);
        } else if (seen !== this.#seen) {
            this.#seen = seen;
            if (this.#historyTimer) {
                clearTimeout(this.#historyTimer);
            }
            // a little later, so that a history instance has it
            this.#historyTimer = setTimeout(() => {
                this.#historyTimer = null;
                void this.#loadHistory(channel, options);
            }, 1000);
        }
    }

    async #loadHistory(channel: string, options: { count: number; days: number }): Promise<void> {
        const socket = this.socket;
        if (!socket) {
            return;
        }
        const counter = ++this.#loadCounter;
        const history = await loadPresenceHistory(socket, channel, options);
        if (counter === this.#loadCounter) {
            this.#history = history;
            this.requestDraw();
        }
    }

    /**
     * Downloads the comings and goings of the last `historyDays` days as a CSV file which Excel opens directly:
     * UTF-8 with BOM, `;` as separator for the languages whose Excel expects it, the oldest event first
     */
    readonly #export = async (): Promise<void> => {
        const channel = this.#channel;
        const socket = this.socket;
        if (!channel || !socket || this.editMode) {
            return;
        }
        const t = this.t;
        const history = await loadPresenceHistory(socket, channel, {
            count: EXPORT_COUNT,
            days: this.#historyOptions().days,
        });
        const lang = this.systemLang;
        const separator = lang === 'en' || lang === 'zh-cn' ? ',' : ';';
        const present = toBool(this.#value('present'));
        const events = [...history.events].reverse();
        const rows = [
            [t('vis_date'), t('vis_time'), t('vis_event'), t('vis_duration_minutes')],
            ...events.map((event, i) => {
                // how long the state of the event lasted: until the next event, the newest one until now
                const end = i < events.length - 1 ? events[i + 1].ts : event.present === present ? Date.now() : 0;
                const date = new Date(event.ts);
                return [
                    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
                    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
                    t(event.present ? 'vis_arrived' : 'vis_departed'),
                    end > event.ts ? Math.round((end - event.ts) / 60_000) : '',
                ];
            }),
        ];
        const csv = rows.map(row => row.map(value => csvField(value, separator)).join(separator)).join('\r\n');
        const now = new Date();
        const fileName = `${this.#personName().replace(/[\\/:*?"<>|]+/g, '_')}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
        // the byte order mark tells Excel that the file is UTF-8
        const url = URL.createObjectURL(
            new Blob([`${String.fromCharCode(0xfeff)}${csv}\r\n`], { type: 'text/csv;charset=utf-8' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    /** The name of the person as configured, from its channel */
    #personName(): string {
        const channel = this.#channel;
        if (!channel) {
            return '';
        }
        const obj = this.objects[channel];
        const native = (obj?.native || {}) as { person?: string };
        return native.person || nameText(obj?.common?.name, this.systemLang) || channel.split('.').pop() || '';
    }

    /** Color of a state: the configured one, the success color for present, gray for absent and unknown */
    #color(present: boolean | undefined): string {
        if (present === undefined) {
            return 'color-mix(in srgb, currentColor 38%, transparent)';
        }
        const color = textSetting(present ? this.settings.presentColor : this.settings.absentColor);
        return color || (present ? 'var(--iob-success)' : 'color-mix(in srgb, currentColor 64%, transparent)');
    }

    #stateText(present: boolean | undefined): string {
        if (present === undefined) {
            return '…';
        }
        const text = textSetting(present ? this.settings.presentText : this.settings.absentText);
        return text || this.t(present ? 'vis_present' : 'vis_away');
    }

    /** Since when the person is present or absent, in ms; 0 if it is not known */
    #duration(present: boolean | undefined): number {
        if (present === undefined) {
            return 0;
        }
        const now = Date.now();
        const since = toNumber(this.#value(present ? 'lastArrival' : 'lastDeparture'));
        if (since && since <= now) {
            return now - since;
        }
        const minutes = toNumber(this.#value(present ? 'presentSince' : 'absentSince'));
        return minutes ? minutes * 60_000 : 0;
    }

    #details(): Detail[] {
        const settings = this.settings;
        const lang = this.systemLang;
        const t = this.t;
        const time = (name: 'lastArrival' | 'lastDeparture'): string =>
            formatEventTime(toNumber(this.#value(name)) || 0, lang);
        const minutes = (name: 'presentToday' | 'absentToday'): string => {
            const value = toNumber(this.#value(name));
            return value === undefined ? '—' : formatDuration(value * 60_000, lang);
        };
        const details: Detail[] = [];
        if (settings.showArrival !== false) {
            details.push({ key: 'arrival', label: t('vis_arrived'), value: time('lastArrival') });
        }
        if (settings.showDeparture !== false) {
            details.push({ key: 'departure', label: t('vis_departed'), value: time('lastDeparture') });
        }
        if (settings.showToday) {
            details.push({ key: 'presentToday', label: t('vis_present_today'), value: minutes('presentToday') });
            details.push({ key: 'absentToday', label: t('vis_absent_today'), value: minutes('absentToday') });
        }
        if (settings.showDevices) {
            details.push({
                key: 'devices',
                label: t('vis_devices'),
                value: toText(this.#value('devices')) || '—',
                wide: true,
            });
        }
        return details;
    }

    #avatar(present: boolean | undefined): JSX.Element {
        const image = textSetting(this.settings.image);
        const gray = present === false && this.settings.grayAbsent !== false;
        return (
            <span
                className={`avatar${image ? ' photo' : ''}`}
                style={vars({ '--color': this.#color(present) })}
            >
                {image ? (
                    <img
                        src={image}
                        alt=""
                        className={gray ? 'gray' : undefined}
                    />
                ) : (
                    <Icon name={present === false ? 'PersonOff' : 'Person'} />
                )}
            </span>
        );
    }

    #state(present: boolean | undefined, hint: string): JSX.Element {
        return (
            <div
                className={`state${hint ? ' hint' : ''}`}
                style={vars({ '--color': this.#color(present) })}
            >
                {hint ? null : <span className={`dot${present ? ' present' : ''}`} />}
                <span className={hint ? undefined : 'ellipsis'}>{hint || this.#stateText(present)}</span>
            </div>
        );
    }

    #durationLine(present: boolean | undefined): JSX.Element | null {
        const duration = this.#duration(present);
        if (this.settings.showDuration === false || !duration) {
            return null;
        }
        return (
            <div className="duration muted ellipsis">
                {this.t('vis_for_duration', formatDuration(duration, this.systemLang))}
            </div>
        );
    }

    #historyPart(present: boolean | undefined): JSX.Element | null {
        if (this.settings.showHistory === false) {
            return null;
        }
        const history = this.#history;
        const events = history?.events || [];
        const lang = this.systemLang;
        const t = this.t;
        let list: ReactNode;
        if (!history) {
            list = <div className="history-empty muted">…</div>;
        } else if (!events.length) {
            list = <div className="history-empty muted">{t('vis_no_history')}</div>;
        } else {
            list = events.map((event, i) => {
                // how long the state of the event lasted: until the next event, the newest one until now
                const end = i ? events[i - 1].ts : event.present === present ? Date.now() : 0;
                return (
                    <div
                        key={`${event.ts}_${i}`}
                        className="event"
                        style={vars({ '--color': this.#color(event.present) })}
                    >
                        <span className="dot" />
                        <span className="what ellipsis">{t(event.present ? 'vis_arrived' : 'vis_departed')}</span>
                        {end > event.ts ? (
                            <span className="long muted ellipsis">{formatDuration(end - event.ts, lang)}</span>
                        ) : null}
                        <span className="when muted">{formatEventTime(event.ts, lang)}</span>
                    </div>
                );
            });
        }
        return (
            <div className="history">
                <div className="history-head muted">
                    <span className="ellipsis">{t('vis_history')}</span>
                    {history?.source === 'history' && history.instance ? (
                        <span className="source faint">{history.instance}</span>
                    ) : null}
                    {this.settings.showExport !== false && events.length ? (
                        <button
                            type="button"
                            className="icon-button"
                            title={t('vis_export_excel')}
                            aria-label={t('vis_export_excel')}
                            disabled={this.editMode}
                            onClick={() => void this.#export()}
                        >
                            <Icon name="FileDownload" />
                        </button>
                    ) : null}
                </div>
                {list}
            </div>
        );
    }

    get #clickable(): boolean {
        return !this.editMode && this.settings.showHistory !== false && !!this.#channel;
    }

    /** A click shows the comings and goings in a dialog - the small layouts have no room for them */
    readonly #openHistory = (): void => {
        if (!this.#clickable) {
            return;
        }
        const name = textSetting(this.settings.nameText) || this.#personName();
        void this.showElementDialog(name ? `${name} – ${this.t('vis_history')}` : this.t('vis_history'), 420, {
            css: CSS,
            draw: () => <div className="history-dialog">{this.#historyPart(toBool(this.#value('present')))}</div>,
        });
    };

    readonly #onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.#openHistory();
        }
    };

    protected draw(): ReactNode {
        const channel = this.#channel;
        if (!channel) {
            return (
                <Hint
                    icon="Person"
                    text={this.t('vis_select_person')}
                />
            );
        }
        this.#updateHistory(channel);
        const present = toBool(this.#value('present'));
        const exists = this.objects[channel] !== null;
        const personName = this.#personName();
        let hint = '';
        if (!exists) {
            hint = this.t('vis_person_not_found', personName);
        } else if (present === undefined) {
            hint = '…';
        }
        const name =
            this.settings.showName === false ? null : (
                <div className="name ellipsis">
                    {textSetting(this.settings.nameText) || personName || this.t('vis_person')}
                </div>
            );
        const details = this.#details();
        const times = details.filter(detail => detail.key === 'arrival' || detail.key === 'departure');
        const clickable = this.#clickable;
        const click = clickable
            ? {
                  role: 'button',
                  tabIndex: 0,
                  title: this.t('vis_history'),
                  onClick: this.#openHistory,
                  onKeyDown: this.#onKeyDown,
              }
            : {};
        return (
            <div className="person">
                <div
                    {...click}
                    className={`v v-compact${clickable ? ' clickable' : ''}`}
                >
                    {this.#avatar(present)}
                    {name}
                    {this.#state(present, hint)}
                    {this.#durationLine(present)}
                </div>
                <div
                    {...click}
                    className={`v v-row${clickable ? ' clickable' : ''}`}
                >
                    {this.#avatar(present)}
                    <div className="texts">
                        {name}
                        {this.#state(present, hint)}
                        {this.#durationLine(present)}
                    </div>
                    {times.length ? (
                        <div className="times muted">
                            {times.map(detail => [
                                <span key={`${detail.key}-label`}>{detail.label}</span>,
                                <span
                                    key={`${detail.key}-value`}
                                    className="value"
                                >
                                    {detail.value}
                                </span>,
                            ])}
                        </div>
                    ) : null}
                </div>
                <div className="v v-full">
                    <div
                        {...click}
                        className={`header${clickable ? ' clickable' : ''}`}
                    >
                        {this.#avatar(present)}
                        <div className="texts">
                            {name}
                            {this.#state(present, hint)}
                            {this.#durationLine(present)}
                        </div>
                    </div>
                    <div className="body">
                        {details.length ? (
                            <div className="details">
                                {details.map(detail => (
                                    <div
                                        key={detail.key}
                                        className={`detail${detail.wide ? ' wide' : ''}`}
                                    >
                                        <div className="label muted ellipsis">{detail.label}</div>
                                        <div className="value ellipsis">{detail.value}</div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {this.#historyPart(present)}
                    </div>
                </div>
            </div>
        );
    }
}

defineWebComponent(COMPONENTS.person.tag, Tr064Person);
