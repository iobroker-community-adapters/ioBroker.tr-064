/**
 * `<iob-tr064-presence>`: who is at home, like the vis-2 widget `Tr064Presence` - the configured devices of the
 * instance (tab "Devices": present or away and where they are connected) or the persons of the presence detection
 * (tab "Persons": present or away, since when, and the guests).
 */
import type { JSX, ReactNode } from 'react';

import type { WebComponentSettings } from '@iobroker/web-components';
import { defineWebComponent } from '@iobroker/web-components/element';

import { formatDuration, formatEventTime, loadPersons, PERSON_STATES } from '../../src-shared/presenceApi';
import { toBool, toNumber, toText } from '../../src-widgets/src/format';
import { Tr064Element } from './base';
import { COMPONENTS, instanceIdOf } from './constants';
import { Icon } from './icons';
import { Hint, Loading, nameText, textSetting, valueOf } from './ui';

interface PresenceSettings extends WebComponentSettings {
    instance?: string;
    mode?: string;
    group?: string;
    title?: string;
    onlyActive?: boolean;
    activeFirst?: boolean;
    showAccessPoint?: boolean;
    showGuests?: boolean;
}

/** The states of a device which are shown */
const DEVICE_STATES = ['active', 'accessPoint', 'connection'] as const;

/** The states of a person which are shown */
const PERSON_LIST_STATES = [
    PERSON_STATES.present,
    PERSON_STATES.lastArrival,
    PERSON_STATES.lastDeparture,
    PERSON_STATES.presentSince,
    PERSON_STATES.absentSince,
] as const;

/** A device below `devices` or a person below `presence.persons` */
interface Entry {
    id: string;
    name: string;
}

interface Row extends Entry {
    active: boolean | undefined;
    /** the second line */
    info: string;
    /** right of the row: when the person came or left */
    time: string;
}

const CSS = `
.presence {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: clamp(4px, 3cqmin, 12px);
}
.p-title { flex: 0 0 auto; font-weight: 600; font-size: 15px; line-height: 1.3; margin-bottom: 4px; }
.summary { flex: 0 0 auto; font-size: 12px; margin-bottom: 6px; }
.empty { font-size: 13px; padding: 8px 0; }
.rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
.row { display: flex; align-items: center; gap: 10px; padding: 6px 0; min-width: 0; }
.avatar {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: color-mix(in srgb, currentColor 38%, transparent);
    background: color-mix(in srgb, currentColor 6%, transparent);
}
.avatar.active { color: var(--iob-success); background: color-mix(in srgb, var(--iob-success) 15%, transparent); }
.row-text { flex: 1 1 auto; min-width: 0; }
.row-name { font-size: 14px; font-weight: 600; line-height: 1.3; }
.row-info { font-size: 12px; line-height: 1.35; }
.row-time { flex: 0 0 auto; font-size: 12px; font-variant-numeric: tabular-nums; }
`;

/**
 * The persons instead of the devices
 *
 * @param settings the settings of the element
 */
function isPersonMode(settings: PresenceSettings): boolean {
    return settings.mode === 'persons';
}

/**
 * What decides which devices or persons are listed
 *
 * @param settings the settings of the element
 */
function listKey(settings: PresenceSettings): string {
    const persons = isPersonMode(settings);
    return [
        instanceIdOf(settings.instance),
        persons ? 'persons' : 'devices',
        persons ? textSetting(settings.group).toLowerCase() : '',
    ].join('|');
}

/**
 * The state of the number of guests, if it is shown
 *
 * @param settings the settings of the element
 */
function guestsIdOf(settings: PresenceSettings): string | null {
    const instanceId = instanceIdOf(settings.instance);
    return instanceId && isPersonMode(settings) && settings.showGuests !== false
        ? `${instanceId}.presence.guests.count`
        : null;
}

/**
 * Name of the channel without the IP address which the adapter appends: `Handy Anna (192.168.178.23)`
 *
 * @param name `common.name` of the channel
 */
function deviceName(name: string): string {
    return name.replace(/\s*\((?:\d{1,3}(?:\.\d{1,3}){3}|[\da-f:]+|undefined)?\)\s*$/i, '').trim();
}

class Tr064Presence extends Tr064Element<PresenceSettings> {
    /** The devices or persons, `null` while they are read */
    #entries: Entry[] | null = null;

    /** For which settings `#entries` were read */
    #entriesKey = '';

    #ticker: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super(CSS);
    }

    override connectedCallback(): void {
        super.connectedCallback();
        // the durations of the persons go on
        this.#ticker ||= setInterval(() => {
            if (isPersonMode(this.settings)) {
                this.requestDraw();
            }
        }, 60_000);
    }

    override disconnectedCallback(): void {
        if (this.#ticker) {
            clearInterval(this.#ticker);
            this.#ticker = null;
        }
        super.disconnectedCallback();
    }

    protected override getStateIds(settings: PresenceSettings): (string | null)[] {
        if (!instanceIdOf(settings.instance) || this.#entriesKey !== listKey(settings) || !this.#entries) {
            return [];
        }
        const names: readonly string[] = isPersonMode(settings) ? PERSON_LIST_STATES : DEVICE_STATES;
        return [...this.#entries.flatMap(entry => names.map(name => `${entry.id}.${name}`)), guestsIdOf(settings)];
    }

    /** Reads the devices or persons when the settings name others, then subscribes their states */
    #load(settings: PresenceSettings): void {
        const key = listKey(settings);
        const socket = this.socket;
        const instanceId = instanceIdOf(settings.instance);
        if (key === this.#entriesKey || !socket || !instanceId) {
            return;
        }
        this.#entriesKey = key;
        this.#entries = null;
        const persons = isPersonMode(settings);
        const group = textSetting(settings.group).toLowerCase();
        const read = async (): Promise<Entry[]> => {
            if (persons) {
                const list = await loadPersons(socket, instanceId);
                return list
                    .filter(person => !group || person.group.toLowerCase() === group)
                    .map(person => ({ id: person.id, name: person.name }));
            }
            // a device is a direct child of `devices` with an `active` below it - the object of the device is a
            // `state` (it carries `active` itself, issue #777) or a `channel`
            const prefix = `${instanceId}.devices.`;
            const end = `${prefix}香`;
            const [states, channels] = await Promise.all([
                socket.getObjectViewSystem('state', prefix, end),
                socket.getObjectViewSystem('channel', prefix, end),
            ]);
            const objects: Record<string, ioBroker.Object> = { ...channels, ...states };
            return Object.keys(objects)
                .filter(
                    id =>
                        id.length > prefix.length &&
                        !id.substring(prefix.length).includes('.') &&
                        !!objects[`${id}.active`],
                )
                .map(id => ({
                    id,
                    name:
                        deviceName(nameText(objects[id]?.common?.name, this.systemLang)) ||
                        id.substring(prefix.length).replace(/_/g, ' '),
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        };
        read()
            .catch((e: unknown) => {
                console.warn(`Cannot read the ${persons ? 'persons' : 'devices'} of ${instanceId}: ${String(e)}`);
                return [];
            })
            .then(entries => {
                if (this.#entriesKey === key) {
                    this.#entries = entries;
                    this.resubscribe();
                }
            })
            .catch(() => undefined);
    }

    #deviceRows(entries: Entry[]): Row[] {
        const showWhere = this.settings.showAccessPoint !== false;
        return entries.map(device => {
            const active = toBool(valueOf(this.states, `${device.id}.active`));
            const where = [
                toText(valueOf(this.states, `${device.id}.accessPoint`)),
                toText(valueOf(this.states, `${device.id}.connection`)),
            ]
                .filter(Boolean)
                .join(' · ');
            let info = '…';
            if (active) {
                info = showWhere && where ? where : this.t('vis_present');
            } else if (active === false) {
                info = this.t('vis_away');
            }
            return { ...device, active, info, time: '' };
        });
    }

    /** A person: present or away and for how long, and when it came or left */
    #personRows(entries: Entry[]): Row[] {
        const lang = this.systemLang;
        const now = Date.now();
        return entries.map(person => {
            const value = (name: string): ioBroker.StateValue | undefined =>
                valueOf(this.states, `${person.id}.${name}`);
            const active = toBool(value(PERSON_STATES.present));
            if (active === undefined) {
                return { ...person, active, info: '…', time: '' };
            }
            const since = toNumber(value(active ? PERSON_STATES.lastArrival : PERSON_STATES.lastDeparture));
            const minutes = toNumber(value(active ? PERSON_STATES.presentSince : PERSON_STATES.absentSince));
            let duration = 0;
            if (since && since <= now) {
                duration = now - since;
            } else if (minutes) {
                duration = minutes * 60_000;
            }
            const word = this.t(active ? 'vis_present' : 'vis_away');
            return {
                ...person,
                active,
                info: duration ? `${word} · ${formatDuration(duration, lang)}` : word,
                time: since ? formatEventTime(since, lang) : '',
            };
        });
    }

    #list(entries: Entry[]): JSX.Element {
        const settings = this.settings;
        const persons = isPersonMode(settings);
        let rows = persons ? this.#personRows(entries) : this.#deviceRows(entries);
        const present = rows.filter(row => row.active).length;
        const guestsId = guestsIdOf(settings);
        const guests = guestsId ? toNumber(valueOf(this.states, guestsId)) : undefined;
        const summary = this.t('vis_present_count', present, entries.length);
        if (settings.onlyActive) {
            rows = rows.filter(row => row.active);
        }
        if (settings.activeFirst !== false) {
            rows.sort((a, b) => Number(!!b.active) - Number(!!a.active) || a.name.localeCompare(b.name));
        }
        let empty = '';
        if (!rows.length) {
            empty = this.t(entries.length ? 'vis_nobody_present' : persons ? 'vis_no_persons' : 'vis_no_devices');
        }
        return (
            <>
                <div className="summary muted">
                    {guests === undefined ? summary : `${summary} · ${this.t('vis_guests_count', guests)}`}
                </div>
                {empty ? <div className="empty muted">{empty}</div> : null}
                <div className="rows">
                    {rows.map(row => (
                        <div
                            key={row.id}
                            className="row"
                        >
                            <span className={`avatar${row.active ? ' active' : ''}`}>
                                <Icon name={row.active ? 'Person' : 'PersonOff'} />
                            </span>
                            <div className="row-text">
                                <div className="row-name ellipsis">{row.name}</div>
                                <div className="row-info muted ellipsis">{row.info}</div>
                            </div>
                            {row.time ? <span className="row-time muted">{row.time}</span> : null}
                        </div>
                    ))}
                </div>
            </>
        );
    }

    protected draw(): ReactNode {
        const settings = this.settings;
        if (!instanceIdOf(settings.instance)) {
            return (
                <Hint
                    icon="Person"
                    text={this.t('wc_chooseInstance')}
                />
            );
        }
        this.#load(settings);
        const entries = this.#entriesKey === listKey(settings) ? this.#entries : null;
        const title = textSetting(settings.title);
        return (
            <div className="presence">
                {title ? <div className="p-title ellipsis">{title}</div> : null}
                {entries ? this.#list(entries) : <Loading />}
            </div>
        );
    }
}

defineWebComponent(COMPONENTS.presence.tag, Tr064Presence);
