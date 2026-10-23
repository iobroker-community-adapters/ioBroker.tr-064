import React from 'react';

import { alpha, Box } from '@mui/material';
import { Lock as IconLock, QrCode2 as IconQr } from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic, { faint, muted, StateWatcher, type StateValues } from './Generic';
import GuestWlanDialog from './GuestWlanDialog';
import { toBool } from './format';
import GuestWlanView from './shared/GuestWlanView';
import {
    GUEST_WLAN_REFRESH_INTERVAL,
    GuestWlanLoader,
    WLAN_QR_KINDS,
    WLAN_QR_STATES,
    wlanQrKind,
    wlanTitleKey,
    type GuestWlanState,
} from './shared/guestWlanApi';
import type { WlanQrKind } from './shared/types';

/**
 * - `tile`: the code is always shown in the widget
 * - `dialog`: the widget is a button, a click shows the code in a dialog
 * - `pin`: like `dialog`, but the PIN is asked first
 */
type ShowMode = 'tile' | 'dialog' | 'pin';

/** Seconds after which the dialog closes by itself, if the attribute is empty */
const DEFAULT_AUTO_CLOSE = 60;

/** Milliseconds after a new password was written into `states.wlan*Password` until the box has it */
const PASSWORD_DELAY = 3000;

interface Tr064GuestWlanRxData {
    instance: string;
    /** the guest WLAN (default, also for widgets of 5.3.0 without it) or one band of the own WLAN */
    wlan: WlanQrKind;
    mode: ShowMode;
    pin: string;
    /** shown instead of the name of the WLAN; not `name`, that is the name of the widget in the vis-2 editor */
    widgetTitle: string;
    noCard: boolean;
    showSsid: boolean;
    showPassword: boolean;
    autoClose: number | string;
}

interface Tr064GuestWlanState extends VisRxWidgetState {
    /** `GuestWlanLoaderState` under another name: vis-2 keeps the data of the widget in `state.data` */
    guest: GuestWlanState;
    /** Values of the states, by full ID */
    fb: StateValues;
    size: { width: number; height: number };
    dialogOpen: boolean;
}

/**
 * QR code of a WLAN - the guest WLAN or one band of the own WLAN: on the widget, or in a dialog
 * after a click - with or without PIN.
 *
 * The adapter answers `sendTo('guestWlan')` with SSID and password; nothing of it is in a state. In
 * the modes with dialog the password is read only while the dialog is open.
 */
export default class Tr064GuestWlan extends Generic<Tr064GuestWlanRxData, Tr064GuestWlanState> {
    private loader: GuestWlanLoader | null = null;

    private watcher: StateWatcher | null = null;

    private observer: ResizeObserver | null = null;

    private rootElement: HTMLDivElement | null = null;

    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            guest: { data: null, loading: false, error: null },
            fb: {},
            size: { width: 0, height: 0 },
            dialogOpen: false,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplTr064GuestWlan',
            visSet: 'tr-064',
            visSetLabel: 'set_label',
            visSetColor: '#e2001a',
            visName: 'FRITZ!Box Wi-Fi QR code',
            visWidgetLabel: 'guest_qr',
            visHelp: 'guest_qr_help',
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
                            name: 'wlan',
                            type: 'select',
                            options: WLAN_QR_KINDS.map(kind => ({ value: kind, label: `qr_wlan_${kind}` })),
                            default: 'guest',
                            label: 'qr_wlan',
                            tooltip: 'qr_wlan_tooltip',
                        },
                        {
                            name: 'mode',
                            type: 'select',
                            options: [
                                { value: 'tile', label: 'guest_mode_tile' },
                                { value: 'dialog', label: 'guest_mode_dialog' },
                                { value: 'pin', label: 'guest_mode_pin' },
                            ],
                            default: 'dialog',
                            label: 'guest_mode',
                        },
                        {
                            name: 'pin',
                            type: 'password',
                            label: 'guest_pin',
                            tooltip: 'guest_pin_tooltip',
                            hidden: 'data.mode !== "pin"',
                        },
                        {
                            name: 'autoClose',
                            type: 'number',
                            min: 0,
                            max: 3600,
                            default: DEFAULT_AUTO_CLOSE,
                            label: 'guest_auto_close',
                            tooltip: 'guest_auto_close_tooltip',
                            hidden: 'data.mode === "tile"',
                        },
                        { name: 'widgetTitle', type: 'text', label: 'title', tooltip: 'guest_title_tooltip' },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'showSsid', type: 'checkbox', default: true, label: 'guest_show_ssid' },
                        { name: 'showPassword', type: 'checkbox', default: true, label: 'guest_show_password' },
                    ],
                },
            ],
            visDefaultStyle: { width: 220, height: 280, position: 'relative' },
            visPrev: 'widgets/tr-064/img/prev_tr064_guest_wlan.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return Tr064GuestWlan.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.watcher = new StateWatcher(this.getWatchSocket(), values => this.onValues(values));
        this.watcher.watch(this.getStateIds());
        this.startLoader();
    }

    componentWillUnmount(): void {
        this.stopLoader();
        this.watcher?.stop();
        this.watcher = null;
        this.observer?.disconnect();
        this.observer = null;
        super.componentWillUnmount();
    }

    componentDidUpdate(
        prevProps: VisRxWidgetProps,
        prevState: Tr064GuestWlanState & { rxData: Tr064GuestWlanRxData },
    ): void {
        super.componentDidUpdate(prevProps, prevState);
        // the interval depends on the edit mode
        if (prevState.editMode !== this.state.editMode) {
            this.startLoader();
        }
    }

    onRxDataChanged(prevRxData: Tr064GuestWlanRxData): void {
        const rxData = this.state.rxData;
        const wlanChanged = wlanQrKind(prevRxData.wlan) !== this.getWlan();
        if (prevRxData.instance !== rxData.instance || wlanChanged) {
            this.watcher?.watch(this.getStateIds());
        }
        if (prevRxData.instance !== rxData.instance || prevRxData.mode !== rxData.mode || wlanChanged) {
            this.setState({ dialogOpen: false }, () => this.startLoader());
        }
    }

    private getWlan(): WlanQrKind {
        return wlanQrKind(this.state.rxData.wlan);
    }

    /** Relative IDs below `tr-064.<n>`: a change of one of them reads the code again */
    private getStateNames(): { connection: string; on: string; password: string } {
        return { connection: 'info.connection', ...WLAN_QR_STATES[this.getWlan()] };
    }

    private getStateIds(): string[] {
        const instanceId = this.getInstanceId();
        return [
            `system.adapter.${instanceId}.alive`,
            ...Object.values(this.getStateNames()).map(name => `${instanceId}.${name}`),
        ];
    }

    private getMode(): ShowMode {
        const mode = this.state.rxData.mode;
        if (mode === 'tile') {
            return 'tile';
        }
        // without a PIN there is nothing to ask
        return mode === 'pin' && this.getPin() ? 'pin' : 'dialog';
    }

    private getPin(): string {
        return String(this.state.rxData.pin ?? '').trim();
    }

    private getTitle(): string {
        return String(this.state.rxData.widgetTitle || '').trim() || Generic.meshT()(wlanTitleKey(this.getWlan()));
    }

    private getAutoClose(): number {
        const value = parseInt(String(this.state.rxData.autoClose ?? ''), 10);
        return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AUTO_CLOSE;
    }

    // ---- loading (only the mode `tile`, the dialog has its own loader) --------------

    private startLoader(): void {
        this.stopLoader();
        if (this.getMode() !== 'tile') {
            return;
        }
        this.loader = new GuestWlanLoader({
            socket: this.getMeshSocket(),
            instanceId: this.getInstanceId(),
            wlan: this.getWlan(),
            // the editor reads once
            interval: this.state.editMode ? 0 : GUEST_WLAN_REFRESH_INTERVAL,
            onChange: guest => this.setState({ guest }),
        });
        this.loader.start();
    }

    private stopLoader(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.loader?.stop();
        this.loader = null;
        if (this.state.guest.data || this.state.guest.error) {
            this.setState({ guest: { data: null, loading: false, error: null } });
        }
    }

    /** The WLAN was switched, the box connected or a new password written: read the code again */
    private onValues(values: StateValues): void {
        const prev = this.state.fb;
        this.setState({ fb: values });
        if (!this.loader) {
            return;
        }
        const instanceId = this.getInstanceId();
        const names = this.getStateNames();
        const changed = (name: string): boolean =>
            `${instanceId}.${name}` in prev && prev[`${instanceId}.${name}`] !== values[`${instanceId}.${name}`];
        if (changed(names.password)) {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = null;
                void this.loader?.refresh();
            }, PASSWORD_DELAY);
        } else if (changed(names.on) || changed(names.connection)) {
            void this.loader.refresh();
        }
    }

    // ---- size -------------------------------------------------------------------

    /** Callback ref of the root element: measures the widget, also when the element is replaced */
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
                if (entries[0]) {
                    measure(entries[0].contentRect.width, entries[0].contentRect.height);
                }
            });
            this.observer.observe(element);
        }
    };

    // ---- dialog -----------------------------------------------------------------

    private openDialog = (): void => {
        if (!this.state.editMode && this.getMode() !== 'tile') {
            this.setState({ dialogOpen: true });
        }
    };

    private closeDialog = (): void => {
        this.setState({ dialogOpen: false });
    };

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.openDialog();
        }
    };

    // ---- render -----------------------------------------------------------------

    /** The code in the widget: next to the texts if the widget is wide, only the code if it is small */
    private renderCode(): React.JSX.Element {
        const { width, height } = this.state.size;
        const rxData = this.state.rxData;
        const wide = width >= 240 && width >= height * 1.5;
        const small = !wide && (width < 150 || height < 190);
        const withTitle = !small && !rxData.noCard && height >= (wide ? 120 : 220);

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', minHeight: 0 }}>
                {withTitle ? this.renderTitle(15) : null}
                <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>
                    <GuestWlanView
                        data={this.state.guest.data}
                        loading={this.state.guest.loading}
                        error={this.state.guest.error}
                        t={Generic.meshT()}
                        wlan={this.getWlan()}
                        showSsid={rxData.showSsid !== false}
                        showPassword={rxData.showPassword !== false}
                        layout={wide ? 'row' : small ? 'qr' : 'column'}
                        fontSize={wide ? 'clamp(12px, 6cqh, 16px)' : 'clamp(12px, 6.5cqi, 15px)'}
                    />
                </Box>
            </Box>
        );
    }

    private renderTitle(fontSize: number): React.JSX.Element {
        return (
            <div
                style={{
                    fontWeight: 600,
                    fontSize,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: '0 0 auto',
                }}
            >
                {this.getTitle()}
            </div>
        );
    }

    /** The button of the modes `dialog` and `pin`: symbol, title, on/off and what a click does */
    private renderButton(): React.JSX.Element {
        const instanceId = this.getInstanceId();
        const values = this.state.fb;
        const on = toBool(values[`${instanceId}.${this.getStateNames().on}`]);
        const alive = toBool(values[`system.adapter.${instanceId}.alive`]);
        const { width, height } = this.state.size;
        const row = height > 0 && height < 110 && width >= 180;
        const tiny = !row && width > 0 && (width < 120 || height < 80);
        const t = Generic.meshT();
        const status = on === undefined || alive === false ? '' : on ? t('tr064_guestOn') : t('tr064_guestOffShort');

        const icon = (
            <Box
                sx={theme => ({
                    position: 'relative',
                    flex: '0 0 auto',
                    width: row ? 'clamp(34px, 45cqh, 48px)' : 'clamp(36px, 26cqi, 56px)',
                    aspectRatio: '1',
                    borderRadius: '28%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.12),
                    color: theme.palette.mode === 'dark' ? theme.palette.primary.light : theme.palette.primary.main,
                    opacity: on === false ? 0.55 : 1,
                    '& .MuiSvgIcon-root': { width: '64%', height: '64%' },
                })}
            >
                <IconQr />
                {this.getMode() === 'pin' ? (
                    <Box
                        sx={theme => ({
                            position: 'absolute',
                            right: -4,
                            bottom: -4,
                            width: '42%',
                            height: '42%',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.palette.background.paper,
                            color: muted(theme),
                            '& .MuiSvgIcon-root': { width: '70%', height: '70%' },
                        })}
                    >
                        <IconLock />
                    </Box>
                ) : null}
            </Box>
        );

        const statusLine = status ? (
            <Box
                sx={theme => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: 12,
                    color: muted(theme),
                    minWidth: 0,
                })}
            >
                <Box
                    sx={theme => ({
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flex: '0 0 auto',
                        backgroundColor: on ? theme.palette.success.main : faint(theme),
                    })}
                />
                <span>{status}</span>
            </Box>
        ) : null;

        if (tiny) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    {icon}
                </Box>
            );
        }

        if (row) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', height: '100%', minWidth: 0 }}>
                    {icon}
                    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                        {this.renderTitle(15)}
                        {statusLine}
                    </Box>
                </Box>
            );
        }

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: '4px' }}>
                {icon}
                <Box sx={{ flex: '1 1 auto', minHeight: 6 }} />
                {this.renderTitle(16)}
                {statusLine}
                {height >= 150 ? (
                    <Box
                        sx={theme => ({
                            fontSize: 12,
                            lineHeight: 1.3,
                            color: faint(theme),
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        })}
                    >
                        {t('tr064_guestTapToShow')}
                    </Box>
                ) : null}
            </Box>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const mode = this.getMode();
        const clickable = mode !== 'tile' && !this.state.editMode;
        const noCard = !!this.state.rxData.noCard || !!props.widget?.usedInWidget;

        const body = (
            <Box
                ref={this.setRoot}
                className="tr064-guest-wlan"
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `${this.getTitle()} – QR` : undefined}
                onClick={clickable ? this.openDialog : undefined}
                onKeyDown={clickable ? this.onKeyDown : undefined}
                sx={theme => ({
                    flex: '1 1 auto',
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    containerType: 'size',
                    fontFamily: theme.typography.fontFamily,
                    color: theme.palette.text.primary,
                    cursor: clickable ? 'pointer' : 'default',
                    WebkitTapHighlightColor: 'transparent',
                    outline: 'none',
                    borderRadius: '8px',
                    '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${theme.palette.primary.main}` },
                })}
            >
                {mode === 'tile' ? this.renderCode() : this.renderButton()}
            </Box>
        );
        // a sibling of the button: key presses in the dialog (keypad) must not reach `onKeyDown` of the button
        const content = (
            <>
                {body}
                {this.state.dialogOpen && !this.state.editMode ? (
                    <GuestWlanDialog
                        socket={this.getMeshSocket()}
                        instanceId={this.getInstanceId()}
                        wlan={this.getWlan()}
                        title={this.getTitle()}
                        pin={mode === 'pin' ? this.getPin() : ''}
                        showSsid={this.state.rxData.showSsid !== false}
                        showPassword={this.state.rxData.showPassword !== false}
                        autoClose={this.getAutoClose()}
                        t={Generic.meshT()}
                        onClose={this.closeDialog}
                    />
                ) : null}
            </>
        );

        if (noCard) {
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
