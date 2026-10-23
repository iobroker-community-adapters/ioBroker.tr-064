// WLAN QR code tile for ioBroker.devices.
//
// Shows the QR code of the guest WLAN or of one band of the own WLAN, with which a phone joins by its
// camera: on the tile, or in a
// dialog after a click - optionally only after the PIN pad of the host. The access data comes from
// `sendTo('<instance>', 'guestWlan')`; the adapter writes it into no state. In the modes with dialog
// it is read only while the dialog is open, and the open dialog is not stored in the URL hash - a
// reload must not skip the PIN.

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
    DialogContentProps,
    DialogProps,
    DialogTitleProps,
    IconButtonProps,
    Theme,
    TypographyProps,
} from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { I18n as I18nType } from '@iobroker/gui-components';

import { alpha, belowHostButtons, SIZE_OPTIONS, stop, tileRootStyle, type Size } from './tileUtils';
import GuestWlanView from './shared/GuestWlanView';
import {
    GUEST_WLAN_REFRESH_INTERVAL,
    GuestWlanLoader,
    useGuestWlanLoader,
    WLAN_QR_KINDS,
    WLAN_QR_STATES,
    wlanQrKind,
    wlanTitleKey,
    type GuestWlanState,
} from './shared/guestWlanApi';
import type { WlanQrKind } from './shared/types';
import type { MeshSocket } from './shared/meshApi';
import { normalizeInstance } from './utils';
import { CloseIcon, LockIcon, QrIcon } from './icons';

// React and MUI of the host (see `@iobroker/dm-widgets`), not a second copy of our own
const Box: ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogTitle: ComponentType<DialogTitleProps> = MuiMaterial?.DialogTitle;
const DialogContent: ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const IconButton: ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const I18n = AdapterReact?.I18n as typeof I18nType;

/**
 * - `tile`: the code is always on the tile
 * - `dialog`: a click shows the code in a dialog
 * - `pin`: like `dialog`, but the PIN is asked first
 */
type ShowMode = 'tile' | 'dialog' | 'pin';

/** Seconds after which the dialog closes by itself, if nothing is configured */
const DEFAULT_AUTO_CLOSE = 60;

/** Milliseconds after a new password was written into `states.wlan*Password` until the box has it */
const PASSWORD_DELAY = 3000;

/** States the tile reads: the connection, the switch of the WLAN and the state of its password */
type StateKey = 'connection' | 'on' | 'password';

const STATE_KEYS: StateKey[] = ['connection', 'on', 'password'];

/**
 * IDs of the states below `tr-064.<n>`: a change of one of them reads the code again
 *
 * @param wlan the WLAN of the code
 */
function stateIds(wlan: WlanQrKind): Record<StateKey, string> {
    return { connection: 'info.connection', ...WLAN_QR_STATES[wlan] };
}

interface GuestWlanSettings extends CustomWidgetPlugin {
    /** tr-064 instance, e.g. `tr-064.0` */
    instance?: string;
    /** the guest WLAN (default, also for tiles of 5.3.0 without it) or one band of the own WLAN */
    wlan?: WlanQrKind;
    mode?: ShowMode;
    /** asked before the code is shown in the mode `pin` */
    pin?: string;
    /** seconds after which the dialog closes, 0 = never */
    autoClose?: number;
    /** the network name next to the code (default) */
    showSsid?: boolean;
    /** the password next to the code (default) */
    showPassword?: boolean;
}

interface GuestWlanComponentState extends WidgetGenericState {
    /** latest value of every state, `null` if the state does not exist */
    values: Partial<Record<StateKey, ioBroker.StateValue>>;
    /** the code on the tile (mode `tile`) */
    guest: GuestWlanState;
    dialogOpen: boolean;
}

/** `t` of the shared view: the `tr064_*` texts are merged into the dictionary of the host */
function sharedT(key: string, ...args: (string | number)[]): string {
    return I18n.t(key, ...args);
}

/** The code in the dialog with its own loader: the password is read only while the dialog is open */
function DialogCode(props: {
    socket: MeshSocket;
    instanceId: string;
    wlan: WlanQrKind;
    showSsid: boolean;
    showPassword: boolean;
}): JSX.Element {
    const { data, loading, error } = useGuestWlanLoader(props.socket, props.instanceId, props.wlan);
    const showHint = !!data && !data.error && data.enabled !== false;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <GuestWlanView
                data={data}
                loading={loading}
                error={error}
                t={sharedT}
                wlan={props.wlan}
                showSsid={props.showSsid}
                showPassword={props.showPassword}
                qrSize="min(68vw, 300px)"
                fontSize={16}
            />
            {showHint ? (
                <Typography
                    variant="body2"
                    sx={{ color: 'text.secondary', textAlign: 'center' }}
                >
                    {I18n.t(props.wlan === 'guest' ? 'tr064_guestScan' : 'tr064_wlanScan')}
                </Typography>
            ) : null}
        </Box>
    );
}

export class GuestWlanComponent extends WidgetGeneric<GuestWlanComponentState, GuestWlanSettings> {
    private subscriptions: { id: string; handler: (id: string, state: ioBroker.State | null) => void }[] = [];

    private loader: GuestWlanLoader | null = null;

    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

    private closeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: WidgetGenericProps<GuestWlanSettings>) {
        super(props);
        this.state = {
            ...this.state,
            values: {},
            guest: { data: null, loading: false, error: null },
            dialogOpen: false,
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
                instance: {
                    type: 'instance',
                    adapter: 'tr-064',
                    label: 'fritzdm_instance',
                    default: 'tr-064.0',
                    sm: 12,
                    md: 6,
                },
                name: {
                    type: 'text',
                    label: 'fritzdm_nameOverride',
                    help: 'fritzdm_guestNameHelp',
                    sm: 12,
                    md: 6,
                },
                wlan: {
                    type: 'select',
                    label: 'fritzdm_qrWlan',
                    help: 'fritzdm_qrWlanHelp',
                    options: WLAN_QR_KINDS.map(kind => ({ value: kind, label: wlanTitleKey(kind) })),
                    default: 'guest',
                    newLine: true,
                    sm: 12,
                    md: 6,
                },
                mode: {
                    type: 'select',
                    label: 'fritzdm_guestMode',
                    options: [
                        { value: 'tile', label: 'fritzdm_guestModeTile' },
                        { value: 'dialog', label: 'fritzdm_guestModeDialog' },
                        { value: 'pin', label: 'fritzdm_guestModePin' },
                    ],
                    default: 'dialog',
                    newLine: true,
                    sm: 12,
                    md: 6,
                },
                pin: {
                    type: 'password',
                    label: 'fritzdm_guestPin',
                    help: 'fritzdm_guestPinHelp',
                    hidden: 'data.mode !== "pin"',
                    sm: 12,
                    md: 6,
                },
                autoClose: {
                    type: 'number',
                    label: 'fritzdm_guestAutoClose',
                    help: 'fritzdm_guestAutoCloseHelp',
                    min: 0,
                    max: 3600,
                    default: DEFAULT_AUTO_CLOSE,
                    hidden: 'data.mode === "tile"',
                    sm: 12,
                    md: 6,
                },
                showSsid: {
                    type: 'checkbox',
                    label: 'fritzdm_guestShowSsid',
                    default: true,
                    newLine: true,
                    sm: 12,
                    md: 6,
                },
                showPassword: {
                    type: 'checkbox',
                    label: 'fritzdm_guestShowPassword',
                    default: true,
                    sm: 12,
                    md: 6,
                },
            },
        };

        return { name: 'fritzdm_guestWidgetName', schema };
    }

    private get instance(): string {
        return normalizeInstance(this.props.settings.instance);
    }

    private get pin(): string {
        return String(this.props.settings.pin ?? '').trim();
    }

    /** `pin` without a PIN is `dialog` - there is nothing to ask */
    private get mode(): ShowMode {
        const mode = this.props.settings.mode;
        if (mode === 'tile') {
            return 'tile';
        }
        return mode === 'pin' && this.pin ? 'pin' : 'dialog';
    }

    private get autoClose(): number {
        const value = Number(this.props.settings.autoClose);
        return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AUTO_CLOSE;
    }

    private get displayName(): string {
        return this.props.settings?.name || I18n.t(wlanTitleKey(this.wlan));
    }

    private get wlan(): WlanQrKind {
        return wlanQrKind(this.props.settings.wlan);
    }

    private get socket(): MeshSocket {
        return this.props.stateContext.getSocket();
    }

    // ---- lifecycle ------------------------------------------------------------

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribe();
        this.startLoader();
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<GuestWlanSettings>>,
        prevState: Readonly<GuestWlanComponentState>,
        snapshot?: unknown,
    ): void {
        super.componentDidUpdate?.(prevProps, prevState, snapshot);

        const sourceChanged =
            normalizeInstance(prevProps.settings.instance) !== this.instance ||
            wlanQrKind(prevProps.settings.wlan) !== this.wlan;
        if (sourceChanged) {
            this.unsubscribe();
            this.setState({ values: {} }, () => this.subscribe());
        }
        if (sourceChanged || prevProps.settings.mode !== this.props.settings.mode) {
            this.closeDialog();
            this.startLoader();
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribe();
        this.stopLoader();
        this.clearCloseTimer();
    }

    private subscribe(): void {
        const context = this.props.stateContext;
        const ids = stateIds(this.wlan);
        for (const key of STATE_KEYS) {
            const id = `${this.instance}.${ids[key]}`;
            const handler = (_id: string, state: ioBroker.State | null): void => this.onValue(key, state);
            context.getState(id, handler);
            this.subscriptions.push({ id, handler });
        }
    }

    private unsubscribe(): void {
        const context = this.props.stateContext;
        for (const { id, handler } of this.subscriptions) {
            context.removeState(id, handler);
        }
        this.subscriptions = [];
    }

    private onValue(key: StateKey, state: ioBroker.State | null | undefined): void {
        const val = state ? state.val : null;
        const known = key in this.state.values;
        if (known && this.state.values[key] === val) {
            return;
        }
        this.setState(prev => ({
            values: { ...prev.values, [key]: val },
            // the "disconnected" symbol of the host, as for other devices
            indicators:
                key === 'connection' && prev.indicators
                    ? { ...prev.indicators, connected: val === null ? null : !!val }
                    : prev.indicators,
        }));
        // the first value is no change
        if (!known || !this.loader) {
            return;
        }
        if (key === 'password') {
            // the box needs a moment for the new password
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = null;
                void this.loader?.refresh();
            }, PASSWORD_DELAY);
        } else {
            void this.loader.refresh();
        }
    }

    // ---- the code on the tile ---------------------------------------------------

    private startLoader(): void {
        this.stopLoader();
        if (this.mode !== 'tile') {
            return;
        }
        const loader = new GuestWlanLoader({
            socket: this.socket,
            instanceId: this.instance,
            wlan: this.wlan,
            interval: GUEST_WLAN_REFRESH_INTERVAL,
            onChange: guest => {
                if (this.loader === loader) {
                    this.setState({ guest });
                }
            },
        });
        this.loader = loader;
        loader.start();
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

    // ---- dialog -----------------------------------------------------------------

    private openDialog = (): void => {
        if (this.state.dialogOpen || this.mode === 'tile') {
            return;
        }
        if (this.mode === 'pin') {
            // the PIN pad of the host calls `onPinPadSuccess()`
            this.showPinPad(this.pin);
            return;
        }
        this.showDialog();
    };

    private showDialog(): void {
        this.setState({ dialogOpen: true });
        this.clearCloseTimer();
        // the code must not stay on a wall tablet
        if (this.autoClose > 0) {
            this.closeTimer = setTimeout(this.closeDialog, this.autoClose * 1000);
        }
    }

    private closeDialog = (): void => {
        this.clearCloseTimer();
        if (this.state.dialogOpen) {
            this.setState({ dialogOpen: false });
        }
    };

    private clearCloseTimer(): void {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
    }

    private onTileKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.openDialog();
        }
    };

    // ---- WidgetGeneric override points ------------------------------------------

    protected onPinPadSuccess(): void {
        this.showDialog();
    }

    /** The tile lights up while the WLAN is on */
    protected isTileActive(): boolean {
        return this.wlanOn === true;
    }

    protected hasTileAction(): boolean {
        return this.mode !== 'tile';
    }

    protected onTileClick(): void {
        this.openDialog();
    }

    protected renderTileIcon(): JSX.Element | null {
        return this.renderIcon('1em');
    }

    // ---- pieces -----------------------------------------------------------------

    private accent(theme: Theme): string {
        return this.getAccentColor() || theme.palette.primary.main;
    }

    /** `true`/`false` while the state is known */
    private get wlanOn(): boolean | undefined {
        const value = this.state.values.on;
        if (value === null || value === undefined || value === '') {
            return undefined;
        }
        return value === true || value === 'true' || value === 1 || value === '1';
    }

    /** QR symbol, with a lock in the mode `pin` */
    private renderIcon(fontSize: string): JSX.Element {
        const off = this.wlanOn === false;
        return (
            <Box
                component="span"
                sx={theme => ({
                    position: 'relative',
                    display: 'inline-flex',
                    flexShrink: 0,
                    fontSize,
                    lineHeight: 1,
                    color: off ? theme.palette.text.disabled : this.accent(theme),
                    '& .MuiSvgIcon-root': { fontSize: 'inherit' },
                })}
            >
                <QrIcon sx={{ fontSize: 'inherit' }} />
                {this.mode === 'pin' ? (
                    <Box
                        component="span"
                        sx={theme => ({
                            position: 'absolute',
                            right: '-0.12em',
                            bottom: '-0.08em',
                            fontSize: '0.42em',
                            display: 'inline-flex',
                            borderRadius: '50%',
                            p: '0.08em',
                            backgroundColor: theme.palette.background.paper,
                            color: theme.palette.text.secondary,
                        })}
                    >
                        <LockIcon sx={{ fontSize: 'inherit' }} />
                    </Box>
                ) : null}
            </Box>
        );
    }

    /** `● On` / `● Off` of the WLAN, nothing while it is unknown */
    private renderStatus(fontSize: string): JSX.Element | null {
        const on = this.wlanOn;
        if (on === undefined) {
            return null;
        }
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.45em', minWidth: 0, fontSize }}>
                <Box
                    sx={theme => ({
                        width: '0.6em',
                        height: '0.6em',
                        borderRadius: '50%',
                        flexShrink: 0,
                        backgroundColor: on ? theme.palette.success.main : theme.palette.text.disabled,
                    })}
                />
                <Typography
                    component="span"
                    noWrap
                    sx={{ fontSize: 'inherit', color: 'text.secondary', lineHeight: 1.3 }}
                >
                    {on ? I18n.t('tr064_guestOn') : I18n.t('tr064_guestOffShort')}
                </Typography>
            </Box>
        );
    }

    /** Name of the tile - its font shrinks until it fits (`nameRef`, see WidgetGeneric) */
    private renderName(fontSize: string, neumorphicSize: string): JSX.Element {
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

    private static renderHint(fontSize: string): JSX.Element {
        return (
            <Typography
                variant="caption"
                noWrap
                component="div"
                sx={{ color: 'text.secondary', fontSize, lineHeight: 1.3, opacity: 0.8 }}
            >
                {I18n.t('tr064_guestTapToShow')}
            </Typography>
        );
    }

    /** The code with network name and password, as the shared view lays it out */
    private renderCode(layout: 'column' | 'row' | 'qr', fontSize: string): JSX.Element {
        return (
            <GuestWlanView
                data={this.state.guest.data}
                loading={this.state.guest.loading}
                error={this.state.guest.error}
                t={sharedT}
                wlan={this.wlan}
                showSsid={this.props.settings.showSsid !== false}
                showPassword={this.props.settings.showPassword !== false}
                layout={layout}
                fontSize={fontSize}
            />
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
        const clickable = this.mode !== 'tile';

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
                    aria-label={clickable ? `${this.displayName} - ${I18n.t('tr064_guestTapToShow')}` : undefined}
                    onClick={clickable ? this.openDialog : undefined}
                    onKeyDown={clickable ? this.onTileKeyDown : undefined}
                    sx={theme => ({
                        boxSizing: 'border-box',
                        position: size === '2x1' ? 'absolute' : 'relative',
                        ...(size === '2x1' ? { inset: 0 } : {}),
                        width: '100%',
                        overflow: 'hidden',
                        userSelect: clickable ? 'none' : 'text',
                        cursor: clickable ? 'pointer' : 'default',
                        textAlign: 'left',
                        color: 'text.primary',
                        outline: 'none',
                        containerType: 'inline-size',
                        ...(getTileStyles(
                            theme,
                            this.isTileActive(),
                            this.getAccentColor(),
                            clickable,
                            this.getInactiveColor(),
                        ) as Record<string, unknown>),
                        '&:focus-visible': {
                            boxShadow: `0 0 0 2px ${this.accent(theme)} inset`,
                        },
                        ...tileSx(theme),
                    })}
                >
                    {content}
                    {this.renderTileIndicators()}
                </Box>
                {this.state.dialogOpen ? (
                    <span
                        style={{ display: 'contents' }}
                        onClick={stop}
                        onPointerDown={stop}
                        onMouseDown={stop}
                        onTouchStart={stop}
                        onKeyDown={stop}
                    >
                        {this.renderDialog()}
                    </span>
                ) : null}
            </Box>
        );
    }

    private renderDialog(): JSX.Element {
        const id = `${String(this.props.widget.id)}-guest-title`;
        return (
            <Dialog
                open
                onClose={this.closeDialog}
                maxWidth="xs"
                fullWidth
                aria-labelledby={id}
                slotProps={{
                    paper: {
                        sx: {
                            m: 2,
                            // a phone: the whole screen
                            '@media (max-width: 599.95px)': {
                                width: '100%',
                                height: '100%',
                                maxHeight: 'none',
                                m: 0,
                                borderRadius: 0,
                            },
                        },
                    },
                }}
            >
                <DialogTitle
                    id={id}
                    component="div"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1, py: 1.5 }}
                >
                    <QrIcon sx={theme => ({ color: this.accent(theme), fontSize: 28, flexShrink: 0 })} />
                    <Typography
                        component="h2"
                        noWrap
                        sx={{ flex: 1, minWidth: 0, fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.3 }}
                    >
                        {this.displayName}
                    </Typography>
                    <IconButton
                        onClick={this.closeDialog}
                        title={I18n.t('fritzdm_close')}
                        aria-label={I18n.t('fritzdm_close')}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <DialogCode
                        socket={this.socket}
                        instanceId={this.instance}
                        wlan={this.wlan}
                        showSsid={this.props.settings.showSsid !== false}
                        showPassword={this.props.settings.showPassword !== false}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    // ---- sizes --------------------------------------------------------------------

    /** 1x1: the code, or symbol, name and state */
    renderCompact(): JSX.Element {
        const pad = (theme: Theme): string => (isNeumorphicTheme(theme) ? 'max(12px, 8cqi)' : 'max(14px, 9cqi)');

        if (this.mode === 'tile') {
            return this.renderFrame(
                '1x1',
                theme => ({
                    display: 'flex',
                    flexDirection: 'column',
                    aspectRatio: '1',
                    padding: pad(theme),
                }),
                <Box sx={theme => ({ flex: '1 1 auto', minHeight: 0, mt: belowHostButtons(pad(theme)) })}>
                    {this.renderCode('qr', '0.75rem')}
                </Box>,
            );
        }

        return this.renderFrame(
            '1x1',
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                aspectRatio: '1',
                padding: pad(theme),
            }),
            <>
                <Box sx={theme => ({ display: 'flex', alignItems: 'flex-start', mt: belowHostButtons(pad(theme)) })}>
                    {this.renderIcon('max(34px, 25cqi)')}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    {this.renderName('max(0.8rem, 8.5cqi)', 'max(0.68rem, 6.8cqi)')}
                    {this.renderStatus('max(0.66rem, 6.6cqi)')}
                </Box>
            </>,
        );
    }

    /** 2x0.5: name and state, the code on the right (the buttons of the host cover the top left corner) */
    renderWide(): JSX.Element {
        const tile = this.mode === 'tile';
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
                <Box sx={{ alignSelf: 'flex-end', display: 'flex' }}>{this.renderIcon('34px')}</Box>
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <Box sx={{ pr: tile ? 0 : '26px', minWidth: 0 }}>{this.renderName('0.85rem', '0.72rem')}</Box>
                    {this.renderStatus('0.72rem')}
                    {tile ? null : GuestWlanComponent.renderHint('0.68rem')}
                </Box>
                {tile ? (
                    // not below the settings button of the host in the top right corner
                    <Box sx={{ height: '100%', aspectRatio: '1', flex: '0 0 auto', mr: '22px' }}>
                        {this.renderCode('qr', '0.7rem')}
                    </Box>
                ) : null}
            </>,
        );
    }

    /** 2x1: name and state, the code with network name and password next to each other */
    renderWideTall(): JSX.Element {
        const pad = (theme: Theme): string => (isNeumorphicTheme(theme) ? 'max(12px, 3.5cqi)' : 'max(14px, 4cqi)');

        if (this.mode === 'tile') {
            return this.renderFrame(
                '2x1',
                theme => ({
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    height: '100%',
                    padding: pad(theme),
                }),
                <>
                    <Box sx={theme => ({ pr: '26px', minWidth: 0, mt: belowHostButtons(pad(theme)) })}>
                        {this.renderName('max(0.8rem, 3.8cqi)', 'max(0.7rem, 3.2cqi)')}
                    </Box>
                    <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>{this.renderCode('row', 'max(0.75rem, 3.4cqi)')}</Box>
                </>,
            );
        }

        return this.renderFrame(
            '2x1',
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '6px',
                height: '100%',
                padding: pad(theme),
            }),
            <>
                <Box sx={theme => ({ display: 'flex', alignItems: 'flex-start', mt: belowHostButtons(pad(theme)) })}>
                    {this.renderIcon('max(40px, 13cqi)')}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    {this.renderName('max(0.95rem, 4.8cqi)', 'max(0.78rem, 3.8cqi)')}
                    {this.renderStatus('max(0.72rem, 3.4cqi)')}
                    {GuestWlanComponent.renderHint('max(0.68rem, 3cqi)')}
                </Box>
            </>,
        );
    }

    /** 2x2: name, the code and below it network name and password */
    renderHuge(): JSX.Element {
        const pad = (theme: Theme): string => (isNeumorphicTheme(theme) ? 'max(14px, 4.5cqi)' : 'max(16px, 5cqi)');

        if (this.mode === 'tile') {
            return this.renderFrame(
                '2x2',
                theme => ({
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'max(6px, 2cqi)',
                    aspectRatio: '1',
                    padding: pad(theme),
                }),
                <>
                    <Box
                        sx={theme => ({
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            minWidth: 0,
                            pr: '26px',
                            mt: belowHostButtons(pad(theme)),
                        })}
                    >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            {this.renderName('max(0.95rem, 5cqi)', 'max(0.78rem, 3.8cqi)')}
                        </Box>
                        <Box sx={{ flexShrink: 0 }}>{this.renderStatus('max(0.72rem, 3cqi)')}</Box>
                    </Box>
                    <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>
                        {this.renderCode('column', 'max(0.8rem, 3.6cqi)')}
                    </Box>
                </>,
            );
        }

        return this.renderFrame(
            '2x2',
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                aspectRatio: '1',
                padding: pad(theme),
            }),
            <>
                <Box sx={theme => ({ display: 'flex', alignItems: 'flex-start', mt: belowHostButtons(pad(theme)) })}>
                    {this.renderIcon('max(56px, 22cqi)')}
                </Box>
                <Box
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '1 1 auto',
                        color: alpha(theme.palette.text.primary, 0.12),
                        fontSize: 'max(64px, 30cqi)',
                        '& .MuiSvgIcon-root': { fontSize: 'inherit' },
                    })}
                >
                    <QrIcon />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    {this.renderName('max(1rem, 5.5cqi)', 'max(0.8rem, 4cqi)')}
                    {this.renderStatus('max(0.78rem, 3.4cqi)')}
                    {GuestWlanComponent.renderHint('max(0.72rem, 3cqi)')}
                </Box>
            </>,
        );
    }
}

export default GuestWlanComponent;
