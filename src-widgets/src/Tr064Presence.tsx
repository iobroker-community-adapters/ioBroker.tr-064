import React from 'react';

import { alpha, Box, CircularProgress } from '@mui/material';
import { Person as IconPerson, PersonOff as IconAway } from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic, { faint, muted, StateWatcher, type StateValues } from './Generic';
import { toBool, toText } from './format';

interface Tr064PresenceRxData {
    instance: string;
    noCard: boolean;
    widgetTitle: string;
    onlyActive: boolean;
    activeFirst: boolean;
    showAccessPoint: boolean;
}

/** One configured device, a channel below `tr-064.<n>.devices` */
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

/**
 * Name of the channel without the IP address which the adapter appends: `Handy Anna (192.168.178.23)`
 *
 * @param name `common.name` of the channel
 */
function deviceName(name: string): string {
    return name.replace(/\s*\((?:\d{1,3}(?:\.\d{1,3}){3}|[\da-f:]+|undefined)?\)\s*$/i, '').trim();
}

/** The configured devices of the instance (tab "Devices"): present or away, and where they are connected */
export default class Tr064Presence extends Generic<Tr064PresenceRxData, Tr064PresenceState> {
    private watcher: StateWatcher | null = null;

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
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'widgetTitle', type: 'text', label: 'title', hidden: '!!data.noCard' },
                        { name: 'onlyActive', type: 'checkbox', default: false, label: 'only_active' },
                        { name: 'activeFirst', type: 'checkbox', default: true, label: 'active_first' },
                        { name: 'showAccessPoint', type: 'checkbox', default: true, label: 'show_access_point' },
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
        void this.loadDevices();
    }

    componentWillUnmount(): void {
        this.watcher?.stop();
        this.watcher = null;
        super.componentWillUnmount();
    }

    onRxDataChanged(prevRxData: Tr064PresenceRxData): void {
        if (prevRxData.instance !== this.state.rxData.instance) {
            this.setState({ devices: null }, () => void this.loadDevices());
        }
    }

    /** The channels below `devices`, sorted by name */
    private async loadDevices(): Promise<void> {
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

        let rows = this.state.devices.map(device => ({
            ...device,
            active: toBool(values[`${device.id}.active`]),
            accessPoint: toText(values[`${device.id}.accessPoint`]),
            connection: toText(values[`${device.id}.connection`]),
        }));
        const present = rows.filter(row => row.active).length;
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
                    {Generic.t('present_count', String(present), String(this.state.devices.length))}
                </Box>
                {!rows.length ? (
                    <Box sx={theme => ({ fontSize: 13, color: muted(theme), py: 1 })}>
                        {Generic.t(this.state.devices.length ? 'nobody_present' : 'no_devices')}
                    </Box>
                ) : null}
                <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', mx: '-4px', px: '4px' }}>
                    {rows.map(row => {
                        const where = [row.accessPoint, row.connection].filter(Boolean).join(' · ');
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
                                        {row.active === undefined
                                            ? '…'
                                            : row.active
                                              ? rxData.showAccessPoint !== false && where
                                                  ? where
                                                  : Generic.t('present')
                                              : Generic.t('away')}
                                    </Box>
                                </Box>
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
