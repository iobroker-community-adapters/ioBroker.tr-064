import React from 'react';

import { alpha, Box, CircularProgress } from '@mui/material';
import { Person as IconPerson, PersonOff as IconAway } from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic, { faint, muted, StateWatcher, type StateValues } from './Generic';
import { presenceSelectComponent } from './PresenceSelect';
import { toBool, toNumber, toText } from './format';
import { formatDuration, formatEventTime, loadPersons, PERSON_STATES } from './shared/presenceApi';

interface Tr064PresenceRxData {
    instance: string;
    /** `devices` (also if not set - the widgets before 5.2) or `persons` */
    mode: 'devices' | 'persons' | '';
    /** persons: only the persons of this group, empty = all */
    group: string;
    /** persons: the number of devices in the guest network */
    showGuests: boolean;
    noCard: boolean;
    widgetTitle: string;
    onlyActive: boolean;
    activeFirst: boolean;
    showAccessPoint: boolean;
}

/** One configured device (a channel below `tr-064.<n>.devices`) or person (below `presence.persons`) */
interface PresenceDevice {
    /** e.g. `tr-064.0.devices.Handy_Anna` */
    id: string;
    name: string;
}

interface Tr064PresenceState extends VisRxWidgetState {
    devices: PresenceDevice[] | null;
    /** Values of the device states, by full ID (not `values`, that one belongs to vis-2) */
    presence: StateValues;
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

/** One row of the list */
interface PresenceRow extends PresenceDevice {
    active: boolean | undefined;
    /** the second line */
    info: string;
    /** right of the row: when the person came or left */
    time: string;
}

/**
 * Name of the channel without the IP address which the adapter appends: `Handy Anna (192.168.178.23)`
 *
 * @param name `common.name` of the channel
 */
function deviceName(name: string): string {
    return name.replace(/\s*\((?:\d{1,3}(?:\.\d{1,3}){3}|[\da-f:]+|undefined)?\)\s*$/i, '').trim();
}

/**
 * The configured devices of the instance (tab "Devices"): present or away, and where they are
 * connected - or the persons of the presence detection (tab "Persons"): present or away, and since when
 */
export default class Tr064Presence extends Generic<Tr064PresenceRxData, Tr064PresenceState> {
    private watcher: StateWatcher | null = null;

    private ticker: ReturnType<typeof setInterval> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            devices: null,
            presence: {},
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplTr064Presence',
            visSet: 'tr-064',
            visSetLabel: 'set_label',
            visSetColor: '#e2001a',
            visName: 'FRITZ!Box Presence',
            visWidgetLabel: 'presence',
            visHelp: 'presence_help',
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
                            name: 'mode',
                            type: 'select',
                            label: 'mode',
                            tooltip: 'mode_tooltip',
                            options: [
                                { value: 'devices', label: 'mode_devices' },
                                { value: 'persons', label: 'mode_persons' },
                            ],
                            default: 'devices',
                        },
                        {
                            name: 'group',
                            type: 'custom',
                            label: 'group',
                            tooltip: 'group_tooltip',
                            component: presenceSelectComponent('group'),
                            hidden: "data.mode !== 'persons'",
                        },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'widgetTitle', type: 'text', label: 'title', hidden: '!!data.noCard' },
                        { name: 'onlyActive', type: 'checkbox', default: false, label: 'only_active' },
                        { name: 'activeFirst', type: 'checkbox', default: true, label: 'active_first' },
                        {
                            name: 'showAccessPoint',
                            type: 'checkbox',
                            default: true,
                            label: 'show_access_point',
                            hidden: "data.mode === 'persons'",
                        },
                        {
                            name: 'showGuests',
                            type: 'checkbox',
                            default: true,
                            label: 'show_guests',
                            tooltip: 'show_guests_tooltip',
                            hidden: "data.mode !== 'persons'",
                        },
                    ],
                },
            ],
            visDefaultStyle: { width: 320, height: 360, position: 'relative' },
            visPrev: 'widgets/tr-064/img/prev_tr064_presence.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return Tr064Presence.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.watcher = new StateWatcher(this.getWatchSocket(), presence => this.setState({ presence }));
        // the durations of the persons change every minute
        this.ticker = setInterval(() => {
            if (this.isPersonMode()) {
                this.forceUpdate();
            }
        }, 60_000);
        void this.loadDevices();
    }

    componentWillUnmount(): void {
        this.watcher?.stop();
        this.watcher = null;
        if (this.ticker) {
            clearInterval(this.ticker);
            this.ticker = null;
        }
        super.componentWillUnmount();
    }

    onRxDataChanged(prevRxData: Tr064PresenceRxData): void {
        const rxData = this.state.rxData;
        if (
            prevRxData.instance !== rxData.instance ||
            prevRxData.mode !== rxData.mode ||
            (this.isPersonMode() &&
                ((prevRxData.group || '') !== (rxData.group || '') || prevRxData.showGuests !== rxData.showGuests))
        ) {
            this.setState({ devices: null }, () => void this.loadDevices());
        }
    }

    /** The persons instead of the devices; a widget without `mode` (before 5.2) shows the devices */
    private isPersonMode(): boolean {
        return this.state.rxData.mode === 'persons';
    }

    private getGuestsId(): string {
        return `${this.getInstanceId()}.presence.guests.count`;
    }

    /** The persons of the instance, only the ones of the group if one is set */
    private async loadPersonList(): Promise<void> {
        const group = (this.state.rxData.group || '').trim().toLowerCase();
        const persons = (await loadPersons(this.getPresenceSocket(), this.getInstanceId())).filter(
            person => !group || person.group.toLowerCase() === group,
        );
        if (!this.watcher) {
            return; // unmounted meanwhile
        }
        const ids = persons.flatMap(person => PERSON_LIST_STATES.map(name => `${person.id}.${name}`));
        if (this.state.rxData.showGuests !== false) {
            ids.push(this.getGuestsId());
        }
        this.watcher.watch(ids);
        this.setState({ devices: persons.map(person => ({ id: person.id, name: person.name })) });
    }

    /** The channels below `devices` (or the persons), sorted by name */
    private async loadDevices(): Promise<void> {
        if (this.isPersonMode()) {
            return this.loadPersonList();
        }
        const prefix = `${this.getInstanceId()}.devices.`;
        let devices: PresenceDevice[] = [];
        try {
            const channels: Record<string, ioBroker.Object> =
                (await this.props.context.socket.getObjectViewSystem('channel', prefix, `${prefix}香`)) || {};
            devices = Object.keys(channels)
                // only direct children
                .filter(id => id.length > prefix.length && !id.substring(prefix.length).includes('.'))
                .map(id => ({
                    id,
                    name:
                        deviceName(Generic.getText(channels[id]?.common?.name || '')) ||
                        id.substring(prefix.length).replace(/_/g, ' '),
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            console.warn(`Cannot read the devices of ${this.getInstanceId()}: ${String(e)}`);
        }
        if (!this.watcher) {
            return; // unmounted meanwhile
        }
        this.watcher.watch(devices.flatMap(device => DEVICE_STATES.map(name => `${device.id}.${name}`)));
        this.setState({ devices });
    }

    private getDeviceRows(): PresenceRow[] {
        const values = this.state.presence;
        const showWhere = this.state.rxData.showAccessPoint !== false;
        return (this.state.devices || []).map(device => {
            const active = toBool(values[`${device.id}.active`]);
            const where = [toText(values[`${device.id}.accessPoint`]), toText(values[`${device.id}.connection`])]
                .filter(Boolean)
                .join(' · ');
            let info = '…';
            if (active) {
                info = showWhere && where ? where : Generic.t('present');
            } else if (active === false) {
                info = Generic.t('away');
            }
            return { ...device, active, info, time: '' };
        });
    }

    /** A person: present or away and for how long, and when it came or left */
    private getPersonRows(): PresenceRow[] {
        const values = this.state.presence;
        const lang = Generic.getLanguage();
        const now = Date.now();
        return (this.state.devices || []).map(person => {
            const active = toBool(values[`${person.id}.${PERSON_STATES.present}`]);
            if (active === undefined) {
                return { ...person, active, info: '…', time: '' };
            }
            const since = toNumber(
                values[`${person.id}.${active ? PERSON_STATES.lastArrival : PERSON_STATES.lastDeparture}`],
            );
            const minutes = toNumber(
                values[`${person.id}.${active ? PERSON_STATES.presentSince : PERSON_STATES.absentSince}`],
            );
            let duration = 0;
            if (since && since <= now) {
                duration = now - since;
            } else if (minutes) {
                duration = minutes * 60_000;
            }
            const word = Generic.t(active ? 'present' : 'away');
            return {
                ...person,
                active,
                info: duration ? `${word} · ${formatDuration(duration, lang)}` : word,
                time: since ? formatEventTime(since, lang) : '',
            };
        });
    }

    private renderList(): React.JSX.Element {
        const rxData = this.state.rxData;
        const values = this.state.presence;
        if (!this.state.devices) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                    <CircularProgress size={24} />
                </Box>
            );
        }

        const persons = this.isPersonMode();
        let rows = persons ? this.getPersonRows() : this.getDeviceRows();
        const present = rows.filter(row => row.active).length;
        const guests = persons && rxData.showGuests !== false ? toNumber(values[this.getGuestsId()]) : undefined;
        const summary = Generic.t('present_count', String(present), String(this.state.devices.length));
        if (rxData.onlyActive) {
            rows = rows.filter(row => row.active);
        }
        if (rxData.activeFirst !== false) {
            rows.sort((a, b) => Number(!!b.active) - Number(!!a.active) || a.name.localeCompare(b.name));
        }

        return (
            <Box
                sx={theme => ({
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    height: '100%',
                    width: '100%',
                    fontFamily: theme.typography.fontFamily,
                    color: theme.palette.text.primary,
                })}
            >
                <Box
                    sx={theme => ({
                        flex: '0 0 auto',
                        fontSize: 12,
                        color: muted(theme),
                        mb: '6px',
                    })}
                >
                    {guests === undefined ? summary : `${summary} · ${Generic.t('guests_count', String(guests))}`}
                </Box>
                {!rows.length ? (
                    <Box sx={theme => ({ fontSize: 13, color: muted(theme), py: 1 })}>
                        {Generic.t(
                            this.state.devices.length ? 'nobody_present' : persons ? 'no_persons' : 'no_devices',
                        )}
                    </Box>
                ) : null}
                <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', mx: '-4px', px: '4px' }}>
                    {rows.map(row => {
                        return (
                            <Box
                                key={row.id}
                                sx={{ display: 'flex', alignItems: 'center', gap: '10px', py: '6px', minWidth: 0 }}
                            >
                                <Box
                                    sx={theme => ({
                                        flex: '0 0 auto',
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: row.active ? theme.palette.success.main : faint(theme),
                                        backgroundColor: row.active
                                            ? alpha(theme.palette.success.main, 0.15)
                                            : alpha(theme.palette.text.primary, 0.06),
                                        '& .MuiSvgIcon-root': { fontSize: 18 },
                                    })}
                                >
                                    {row.active ? <IconPerson /> : <IconAway />}
                                </Box>
                                <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                                    <Box
                                        sx={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            lineHeight: 1.3,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {row.name}
                                    </Box>
                                    <Box
                                        sx={theme => ({
                                            fontSize: 12,
                                            lineHeight: 1.35,
                                            color: muted(theme),
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        })}
                                    >
                                        {row.info}
                                    </Box>
                                </Box>
                                {row.time ? (
                                    <Box
                                        sx={theme => ({
                                            flex: '0 0 auto',
                                            fontSize: 12,
                                            color: muted(theme),
                                            fontVariantNumeric: 'tabular-nums',
                                        })}
                                    >
                                        {row.time}
                                    </Box>
                                ) : null}
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const content = this.renderList();
        if (this.state.rxData.noCard || props.widget?.usedInWidget) {
            return (
                <div style={{ width: '100%', height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
                    {content}
                </div>
            );
        }
        return this.wrapContent(content, null, {
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
