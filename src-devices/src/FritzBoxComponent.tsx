// FRITZ!Box tile for ioBroker.devices.
//
// Shows the state of the box and of the internet connection, the data rates, WLAN and telephony -
// the more room the tile has, the more. A click on the tile opens the mesh topology in a dialog,
// which is read by `sendTo('<instance>', 'mesh', {})` only while the dialog is open.
//
// Every state comes from the tr-064 instance of the settings (see `STATE_IDS` in utils.ts) and may
// be missing - then the part which shows it is left out.

import type { ComponentType, JSX, KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
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
    TooltipProps,
    TypographyProps,
} from '@mui/material';
// `WidgetGeneric.getConfigSchema()` declares its return with the types of dm-utils, the schema is
// written against the types of json-config (dm-utils uses the same ones).
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { I18n as I18nType } from '@iobroker/gui-components';

import MeshView from './shared/MeshView';
import { MeshLoader, type MeshLoaderState } from './shared/meshApi';
import {
    bool,
    firmwareLabel,
    formatRate,
    has,
    normalizeInstance,
    num,
    percent,
    STATE_IDS,
    STATE_KEYS,
    str,
    WLAN_BANDS,
    type Rate,
    type StateKey,
    type StateValues,
} from './utils';
import {
    ChevronIcon,
    CloseIcon,
    DownIcon,
    GlobeIcon,
    MeshIcon,
    MissedCallIcon,
    RingingIcon,
    RouterIcon,
    UpIcon,
    VoicemailIcon,
    WlanIcon,
    WlanOffIcon,
} from './icons';

// React and MUI of the host (see `@iobroker/dm-widgets`), not a second copy of our own
const Box: ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Tooltip: ComponentType<TooltipProps> = MuiMaterial?.Tooltip;
const Dialog: ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogTitle: ComponentType<DialogTitleProps> = MuiMaterial?.DialogTitle;
const DialogContent: ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const IconButton: ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const muiAlpha: (color: string, value: number) => string = MuiMaterial?.alpha;
const I18n = AdapterReact?.I18n as typeof I18nType;

type Size = '1x1' | '2x0.5' | '2x1' | '2x2';

/** How the internet connection is shown */
type Status = 'online' | 'noInternet' | 'connecting' | 'unreachable' | 'unknown';

const STATUS_TEXT: Record<Status, string> = {
    online: 'fritzdm_online',
    noInternet: 'fritzdm_noInternet',
    connecting: 'fritzdm_connecting',
    unreachable: 'fritzdm_unreachable',
    unknown: '',
};

/** Values of `wanLinkStatus` and `wanAccessType` with a translation - others are shown as they are */
const LINK_STATUS = ['Up', 'Down', 'Initializing', 'Unavailable'];
const ACCESS_TYPES = ['Fiber', 'Cable'];

/** The sizes of the host plus 2x2 (square, two columns and two rows) */
const sizeIcon = (width: number, height: number): string =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    )}`;
const SIZE_OPTIONS = [
    { value: '1x1', label: '1×1', icon: sizeIcon(18, 18) },
    { value: '2x1', label: '2×1', icon: sizeIcon(32, 18) },
    { value: '2x0.5', label: '2×½', icon: sizeIcon(32, 12) },
    { value: '2x2', label: '2×2', icon: sizeIcon(32, 32) },
];

/** Key of the view settings (graph/table, filters) of the mesh view in the `localStorage` */
const MESH_STORAGE_KEY = 'tr064.devices.meshTopology';

interface FritzBoxSettings extends CustomWidgetPlugin {
    /** tr-064 instance, e.g. `tr-064.0` */
    instance?: string;
    /** the external IP address is shown (default) - may be hidden on a public dashboard */
    showExternalIp?: boolean;
}

interface FritzBoxComponentState extends WidgetGenericState {
    /** latest value of every state, `null` if the state does not exist */
    values: StateValues;
    /** the mesh dialog is open */
    meshOpen: boolean;
    mesh: MeshLoaderState;
}

/** `alpha()` of MUI throws on colors it cannot parse (`red`, CSS variables) - a user color may be one */
function alpha(color: string, value: number): string {
    try {
        return muiAlpha(color, value);
    } catch {
        return `color-mix(in srgb, ${color} ${Math.round(value * 100)}%, transparent)`;
    }
}

function stop(e: SyntheticEvent): void {
    e.stopPropagation();
}

/** `t` of the mesh view: the `tr064_*` texts are merged into the dictionary of the host */
function meshT(key: string, ...args: (string | number)[]): string {
    return I18n.t(key, ...args);
}

export class FritzBoxComponent extends WidgetGeneric<FritzBoxComponentState, FritzBoxSettings> {
    private subscriptions: { id: string; handler: (id: string, state: ioBroker.State | null) => void }[] = [];

    private meshLoader: MeshLoader | null = null;

    constructor(props: WidgetGenericProps<FritzBoxSettings>) {
        super(props);
        this.state = {
            ...this.state,
            values: {},
            meshOpen: props.openDialogId === FritzBoxComponent.dialogIdOf(props),
            mesh: { data: null, loading: false, error: null },
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
                    default: '2x1',
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
                    label: 'fritzdm_name',
                    sm: 12,
                    md: 6,
                },
                showExternalIp: {
                    type: 'checkbox',
                    label: 'fritzdm_showExternalIp',
                    default: true,
                    sm: 12,
                },
            },
        };

        return { name: 'fritzdm_widgetName', schema };
    }

    /** ID of the dialog in the URL hash of ioBroker.devices, so an open dialog survives a reload */
    private static dialogIdOf(props: WidgetGenericProps<FritzBoxSettings>): string {
        return `${props.widget.id}_mesh`;
    }

    private get dialogId(): string {
        return FritzBoxComponent.dialogIdOf(this.props);
    }

    private get instance(): string {
        return normalizeInstance(this.props.settings.instance);
    }

    // ---- lifecycle ------------------------------------------------------------

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribe();
        if (this.state.meshOpen) {
            this.startMesh();
        }
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<FritzBoxSettings>>,
        prevState: Readonly<FritzBoxComponentState>,
        snapshot?: unknown,
    ): void {
        super.componentDidUpdate?.(prevProps, prevState, snapshot);

        if (normalizeInstance(prevProps.settings.instance) !== this.instance) {
            this.unsubscribe();
            this.setState({ values: {}, mesh: { data: null, loading: false, error: null } }, () => {
                this.subscribe();
                if (this.state.meshOpen) {
                    this.startMesh();
                }
            });
        }

        // the dialog in the URL hash changed: reload, back button of the browser
        if (prevProps.openDialogId !== this.props.openDialogId) {
            const shouldBeOpen = this.props.openDialogId === this.dialogId;
            if (shouldBeOpen && !this.state.meshOpen) {
                this.setState({ meshOpen: true }, () => this.startMesh());
            } else if (!shouldBeOpen && prevProps.openDialogId === this.dialogId && this.state.meshOpen) {
                this.stopMesh();
                this.setState({ meshOpen: false });
            }
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribe();
        this.stopMesh();
    }

    private subscribe(): void {
        const context = this.props.stateContext;
        for (const key of STATE_KEYS) {
            const id = `${this.instance}.${STATE_IDS[key]}`;
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
        this.setState(prev => {
            if (prev.values[key] === val) {
                return null;
            }
            return {
                values: { ...prev.values, [key]: val },
                // the "disconnected" symbol of the host, as for other devices
                indicators:
                    key === 'connection' && prev.indicators
                        ? { ...prev.indicators, connected: val === null ? null : !!val }
                        : prev.indicators,
            };
        });
    }

    // ---- mesh dialog ----------------------------------------------------------

    private startMesh(): void {
        this.stopMesh();
        const loader = new MeshLoader({
            socket: this.props.stateContext.getSocket(),
            instanceId: this.instance,
            onChange: mesh => {
                if (this.meshLoader === loader) {
                    this.setState({ mesh });
                }
            },
        });
        this.meshLoader = loader;
        loader.start();
    }

    private stopMesh(): void {
        this.meshLoader?.stop();
        this.meshLoader = null;
    }

    private openMesh = (): void => {
        if (this.state.meshOpen) {
            return;
        }
        this.props.onOpenWidgetDialog?.(this.dialogId);
        this.setState({ meshOpen: true }, () => this.startMesh());
    };

    private closeMesh = (): void => {
        this.stopMesh();
        this.setState({ meshOpen: false });
        this.props.onCloseWidgetDialog?.();
    };

    private onTileKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.openMesh();
        }
    };

    // ---- WidgetGeneric override points ------------------------------------------

    /** The tile lights up while a call comes in */
    protected isTileActive(): boolean {
        return bool(this.state.values, 'ringing');
    }

    // eslint-disable-next-line class-methods-use-this
    protected hasTileAction(): boolean {
        return true;
    }

    protected onTileClick(): void {
        this.openMesh();
    }

    protected renderTileIcon(): JSX.Element | null {
        return this.renderIcon('1em');
    }

    // ---- derived values ---------------------------------------------------------

    private get values(): StateValues {
        return this.state.values;
    }

    private get displayName(): string {
        return this.props.settings?.name || this.state.name || str(this.values, 'model') || 'FRITZ!Box';
    }

    private get floatComma(): boolean {
        return !!this.props.stateContext.isFloatComma;
    }

    private get status(): Status {
        const values = this.values;
        const connection = values.connection;
        if (connection === false || connection === 'false') {
            return 'unreachable';
        }
        const link = str(values, 'linkStatus');
        if (link === 'Up') {
            return 'online';
        }
        if (link === 'Initializing') {
            return 'connecting';
        }
        if (link === 'Down' || link === 'Unavailable') {
            return 'noInternet';
        }
        return bool(values, 'connection') ? 'online' : 'unknown';
    }

    private statusColor(theme: Theme): string {
        switch (this.status) {
            case 'online':
                return theme.palette.success.main;
            case 'connecting':
                return theme.palette.warning.main;
            case 'noInternet':
            case 'unreachable':
                return theme.palette.error.main;
            default:
                return theme.palette.text.disabled;
        }
    }

    private get statusText(): string {
        const key = STATUS_TEXT[this.status];
        return key ? I18n.t(key) : '…';
    }

    private get accessType(): string {
        const type = str(this.values, 'accessType');
        return ACCESS_TYPES.includes(type) ? I18n.t(`fritzdm_access_${type}`) : type;
    }

    private get linkStatus(): string {
        const link = str(this.values, 'linkStatus');
        return LINK_STATUS.includes(link) ? I18n.t(`fritzdm_link_${link}`) : link;
    }

    /** Model and firmware, e.g. `FRITZ!Box 7590 AX · FRITZ!OS 8.03` - the model only if it is not the name */
    private get modelLine(): string {
        const model = str(this.values, 'model');
        const firmware = str(this.values, 'firmware');
        return [model && model !== this.displayName ? model : '', firmware ? firmwareLabel(firmware) : '']
            .filter(Boolean)
            .join(' · ');
    }

    /** The accent: the color of the widget, otherwise the primary color of the theme */
    private accent(theme: Theme): string {
        return this.getAccentColor() || theme.palette.primary.main;
    }

    private rate(key: 'receiveRate' | 'sendRate'): Rate {
        // the box does not answer: the last rate is not the current one - `–` like the vis-2 tile
        if (this.status === 'unreachable' || !has(this.values, key)) {
            return { value: '–', unit: '' };
        }
        return formatRate(num(this.values, key) * 8, this.floatComma);
    }

    /** `48,2 Mbit/s` or `–` */
    private rateText(key: 'receiveRate' | 'sendRate'): string {
        const rate = this.rate(key);
        return rate.unit ? `${rate.value} ${rate.unit}` : rate.value;
    }

    private get hasRates(): boolean {
        return has(this.values, 'receiveRate') || has(this.values, 'sendRate');
    }

    /** The box does not answer: the values are old, they are shown faded */
    private get staleSx(): Record<string, unknown> {
        return this.status === 'unreachable' ? { opacity: 0.45 } : {};
    }

    private get showIp(): boolean {
        return this.props.settings.showExternalIp !== false && has(this.values, 'externalIP');
    }

    // ---- pieces -----------------------------------------------------------------

    /** Router symbol, a ringing phone while a call comes in */
    private renderIcon(fontSize: string): JSX.Element {
        const ringing = bool(this.values, 'ringing');
        const offline = this.status === 'unreachable';

        return (
            <Box
                component="span"
                sx={theme => ({
                    display: 'inline-flex',
                    flexShrink: 0,
                    fontSize,
                    lineHeight: 1,
                    color: ringing
                        ? theme.palette.warning.main
                        : offline
                          ? theme.palette.text.disabled
                          : this.accent(theme),
                    transition: 'color 0.25s ease',
                    '& .MuiSvgIcon-root': { fontSize: 'inherit' },
                    ...(ringing
                        ? {
                              animation: 'fritzdmRing 1.2s ease-in-out infinite',
                              '@keyframes fritzdmRing': {
                                  '0%, 50%, 100%': { transform: 'rotate(0deg)' },
                                  '10%, 30%': { transform: 'rotate(-12deg)' },
                                  '20%, 40%': { transform: 'rotate(12deg)' },
                              },
                          }
                        : {}),
                })}
            >
                {ringing ? <RingingIcon sx={{ fontSize: 'inherit' }} /> : <RouterIcon sx={{ fontSize: 'inherit' }} />}
            </Box>
        );
    }

    /** Colored dot and text of the connection state, e.g. `● Online · DSL` */
    private renderStatus(fontSize: string, withAccess: boolean): JSX.Element {
        const access = withAccess && this.status !== 'unreachable' ? this.accessType : '';

        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4em',
                    minWidth: 0,
                    fontSize,
                    lineHeight: 1.35,
                }}
            >
                <Box
                    component="span"
                    sx={theme => ({
                        width: '0.6em',
                        height: '0.6em',
                        flexShrink: 0,
                        borderRadius: '50%',
                        backgroundColor: this.statusColor(theme),
                        boxShadow: `0 0 0 0.18em ${alpha(this.statusColor(theme), 0.2)}`,
                    })}
                />
                <Box
                    component="span"
                    sx={{
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        fontWeight: 600,
                        color: 'text.secondary',
                    }}
                >
                    <Box
                        component="span"
                        sx={theme => ({ color: this.status === 'online' ? 'text.primary' : this.statusColor(theme) })}
                    >
                        {this.statusText}
                    </Box>
                    {access ? <Box component="span">{` · ${access}`}</Box> : null}
                </Box>
            </Box>
        );
    }

    /** `↓ 48,2 Mbit/s` - the unit smaller */
    private renderRateValue(
        key: 'receiveRate' | 'sendRate',
        fontSize: string,
        options?: { unit?: boolean; muted?: boolean },
    ): JSX.Element {
        const rate = this.rate(key);
        const Arrow = key === 'receiveRate' ? DownIcon : UpIcon;

        return (
            <Box
                component="span"
                sx={{
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: '0.2em',
                    fontSize,
                    lineHeight: 1.15,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                    color: options?.muted ? 'text.secondary' : 'text.primary',
                }}
            >
                <Arrow
                    sx={{
                        fontSize: '0.8em',
                        alignSelf: 'center',
                        color: options?.muted ? 'text.secondary' : 'text.disabled',
                    }}
                />
                <Box
                    component="span"
                    sx={{ fontWeight: 700 }}
                >
                    {rate.value}
                </Box>
                {options?.unit === false || !rate.unit ? null : (
                    <Box
                        component="span"
                        sx={{ fontSize: 'max(9px, 0.62em)', fontWeight: 500, color: 'text.secondary' }}
                    >
                        {rate.unit}
                    </Box>
                )}
            </Box>
        );
    }

    /** Thin bar: how much of the line is used */
    private renderUsageBar(key: 'receiveRate' | 'sendRate', maxKey: 'downstreamMax' | 'upstreamMax'): JSX.Element {
        const max = num(this.values, maxKey);
        const used = percent(num(this.values, key) * 8, max);
        const maxRate = max > 0 ? formatRate(max, this.floatComma, true) : null;

        return (
            <Box
                title={maxRate ? I18n.t('fritzdm_maxRate', `${maxRate.value} ${maxRate.unit}`) : undefined}
                sx={{
                    height: 4,
                    borderRadius: 2,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(127,127,127,0.22)',
                }}
            >
                <Box
                    sx={theme => ({
                        width: `${max > 0 ? Math.max(used, used > 0 ? 2 : 0) : 0}%`,
                        height: '100%',
                        borderRadius: 'inherit',
                        backgroundColor: key === 'receiveRate' ? this.accent(theme) : alpha(this.accent(theme), 0.6),
                        transition: 'width 0.6s ease',
                    })}
                />
            </Box>
        );
    }

    /** Download and upload side by side, each with the usage of the line */
    private renderRates(valueSize: string, withLabels: boolean): JSX.Element | null {
        if (!this.hasRates) {
            return null;
        }
        const column = (
            key: 'receiveRate' | 'sendRate',
            maxKey: 'downstreamMax' | 'upstreamMax',
            label: string,
        ): JSX.Element => {
            const max = num(this.values, maxKey);
            const maxRate = max > 0 ? formatRate(max, this.floatComma, true) : null;
            return (
                <Box sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {withLabels ? (
                        <Typography
                            variant="caption"
                            noWrap
                            sx={{ color: 'text.secondary', lineHeight: 1.2, fontSize: '0.7rem' }}
                        >
                            {label}
                        </Typography>
                    ) : null}
                    {this.renderRateValue(key, valueSize)}
                    {max > 0 ? this.renderUsageBar(key, maxKey) : null}
                    {withLabels && maxRate ? (
                        <Typography
                            variant="caption"
                            noWrap
                            sx={{ color: 'text.secondary', lineHeight: 1.2, fontSize: '0.65rem' }}
                        >
                            {I18n.t('fritzdm_maxRate', `${maxRate.value} ${maxRate.unit}`)}
                        </Typography>
                    ) : null}
                </Box>
            );
        };

        return (
            <Box sx={{ display: 'flex', gap: 'max(12px, 4cqi)', minWidth: 0, ...this.staleSx }}>
                {column('receiveRate', 'downstreamMax', I18n.t('fritzdm_download'))}
                {column('sendRate', 'upstreamMax', I18n.t('fritzdm_upload'))}
            </Box>
        );
    }

    /** A small rounded label */
    private static renderPill(
        key: string,
        content: ReactNode,
        options: { color?: (theme: Theme) => string; off?: boolean; title?: string; strong?: boolean },
    ): JSX.Element {
        const pill = (
            <Box
                key={key}
                component="span"
                sx={theme => {
                    const color = options.color?.(theme);
                    return {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        flexShrink: 0,
                        height: '1.7em',
                        px: '0.55em',
                        borderRadius: '0.85em',
                        fontSize: 'inherit',
                        fontWeight: options.strong ? 700 : 600,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        color: options.off ? theme.palette.text.disabled : color || theme.palette.text.secondary,
                        backgroundColor: options.off
                            ? 'transparent'
                            : color
                              ? alpha(color, theme.palette.mode === 'dark' ? 0.2 : 0.12)
                              : alpha(theme.palette.text.primary, 0.07),
                        border: options.off
                            ? `1px dashed ${alpha(theme.palette.text.primary, 0.22)}`
                            : '1px solid transparent',
                        textDecoration: options.off ? 'line-through' : 'none',
                        '& .MuiSvgIcon-root': { fontSize: '1.15em' },
                    };
                }}
            >
                {content}
            </Box>
        );

        return options.title ? (
            <Tooltip
                key={key}
                title={options.title}
                slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
            >
                {pill}
            </Tooltip>
        ) : (
            pill
        );
    }

    /** One pill per WLAN band of the box: on / off. `null` if the box reports none. */
    private renderWlan(fontSize: string, withLabel: boolean): JSX.Element | null {
        const values = this.values;
        const bands = WLAN_BANDS.filter(band => has(values, band.key));
        if (!bands.length && !has(values, 'wlan')) {
            return null;
        }
        const on = I18n.t('fritzdm_on');
        const off = I18n.t('fritzdm_off');
        const anyOn = bands.length ? bands.some(band => bool(values, band.key)) : bool(values, 'wlan');
        const success = (theme: Theme): string => theme.palette.success.main;

        const pills = bands.length
            ? bands.map(band => {
                  const enabled = bool(values, band.key);
                  const label = band.guest
                      ? I18n.t('fritzdm_guest')
                      : this.floatComma
                        ? band.label.replace('.', ',')
                        : band.label;
                  const title = band.guest ? I18n.t('fritzdm_guestWlan') : `${label} GHz`;
                  return FritzBoxComponent.renderPill(band.key, label, {
                      color: enabled ? success : undefined,
                      off: !enabled,
                      title: `${title}: ${enabled ? on : off}`,
                  });
              })
            : [
                  FritzBoxComponent.renderPill('wlan', `${I18n.t('fritzdm_wlan')}`, {
                      color: anyOn ? success : undefined,
                      off: !anyOn,
                      title: `${I18n.t('fritzdm_wlan')}: ${anyOn ? on : off}`,
                  }),
              ];

        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize,
                    minWidth: 0,
                    flexWrap: 'nowrap',
                    overflow: 'hidden',
                    ...this.staleSx,
                }}
            >
                <Box
                    component="span"
                    title={I18n.t('fritzdm_wlan')}
                    sx={{ display: 'inline-flex', color: anyOn ? 'text.secondary' : 'text.disabled', mr: '1px' }}
                >
                    {anyOn ? <WlanIcon sx={{ fontSize: '1.35em' }} /> : <WlanOffIcon sx={{ fontSize: '1.35em' }} />}
                </Box>
                {withLabel ? (
                    <Box
                        component="span"
                        sx={{ color: 'text.secondary', fontWeight: 600, mr: '2px' }}
                    >
                        {I18n.t('fritzdm_wlan')}
                    </Box>
                ) : null}
                {pills}
            </Box>
        );
    }

    /**
     * Ringing, new messages on the answering machine and missed calls.
     *
     * @param fontSize size of the pills
     * @param showZero also the counters which are 0 (only the 2x2 tile has room for them)
     * @param text `count`: symbol and number; `auto`: with the text if the tile is at least 400 px wide
     */
    private renderPhone(fontSize: string, showZero: boolean, text: 'count' | 'auto'): JSX.Element | null {
        const values = this.values;
        const pills: JSX.Element[] = [];
        const warning = (theme: Theme): string => theme.palette.warning.main;
        const error = (theme: Theme): string => theme.palette.error.main;
        /** the number, on a wide tile the whole text instead */
        const label = (count: number, full: string): JSX.Element =>
            text === 'auto' ? (
                <>
                    <Box
                        component="span"
                        sx={{ '@container (min-width: 400px)': { display: 'none' } }}
                    >
                        {count}
                    </Box>
                    <Box
                        component="span"
                        sx={{ display: 'none', '@container (min-width: 400px)': { display: 'inline' } }}
                    >
                        {full}
                    </Box>
                </>
            ) : (
                <>{count}</>
            );

        if (bool(values, 'ringing')) {
            pills.push(
                FritzBoxComponent.renderPill(
                    'ringing',
                    <>
                        <RingingIcon />
                        {text === 'auto' ? I18n.t('fritzdm_ringing') : null}
                    </>,
                    { color: warning, title: I18n.t('fritzdm_ringing'), strong: true },
                ),
            );
        }
        if (has(values, 'abNewMessages')) {
            const count = num(values, 'abNewMessages');
            if (count || showZero) {
                const full =
                    count === 1
                        ? I18n.t('fritzdm_oneNewMessage')
                        : count
                          ? I18n.t('fritzdm_newMessages', count)
                          : I18n.t('fritzdm_noNewMessages');
                pills.push(
                    FritzBoxComponent.renderPill(
                        'ab',
                        <>
                            <VoicemailIcon />
                            {label(count, full)}
                        </>,
                        { color: count ? warning : undefined, title: full },
                    ),
                );
            }
        }
        if (has(values, 'missedCalls')) {
            const count = num(values, 'missedCalls');
            if (count || showZero) {
                const full =
                    count === 1
                        ? I18n.t('fritzdm_oneMissedCall')
                        : count
                          ? I18n.t('fritzdm_missedCalls', count)
                          : I18n.t('fritzdm_noMissedCalls');
                pills.push(
                    FritzBoxComponent.renderPill(
                        'missed',
                        <>
                            <MissedCallIcon />
                            {label(count, full)}
                        </>,
                        { color: count ? error : undefined, title: full },
                    ),
                );
            }
        }
        if (!pills.length) {
            return null;
        }

        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize,
                    minWidth: 0,
                    flexWrap: 'nowrap',
                    overflow: 'hidden',
                    ...this.staleSx,
                }}
            >
                {pills}
            </Box>
        );
    }

    /** Globe and the external IPv4 address */
    private renderIp(fontSize: string): JSX.Element | null {
        if (!this.showIp) {
            return null;
        }

        return (
            <Box
                title={I18n.t('fritzdm_externalIp')}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3em',
                    minWidth: 0,
                    fontSize,
                    color: 'text.secondary',
                    ...this.staleSx,
                }}
            >
                <GlobeIcon sx={{ fontSize: '1.2em', flexShrink: 0 }} />
                <Box
                    component="span"
                    sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '0.01em',
                    }}
                >
                    {str(this.values, 'externalIP')}
                </Box>
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

        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => FritzBoxComponent.rootStyle(theme, size)}
            >
                {size === '2x1' ? (
                    // one column wide and square: the height of a 1x1 tile, as the host does it
                    <Box sx={{ width: 'calc(50% - 6px)', aspectRatio: '1' }} />
                ) : null}
                <Box
                    role="button"
                    tabIndex={0}
                    aria-label={`${this.displayName} - ${I18n.t('fritzdm_showMesh')}`}
                    onClick={this.openMesh}
                    onKeyDown={this.onTileKeyDown}
                    sx={theme => ({
                        boxSizing: 'border-box',
                        position: size === '2x1' ? 'absolute' : 'relative',
                        ...(size === '2x1' ? { inset: 0 } : {}),
                        width: '100%',
                        overflow: 'hidden',
                        userSelect: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: 'text.primary',
                        outline: 'none',
                        ...(getTileStyles(
                            theme,
                            active,
                            this.getAccentColor(),
                            true,
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
                {this.state.meshOpen ? (
                    <span
                        style={{ display: 'contents' }}
                        onClick={stop}
                        onPointerDown={stop}
                        onMouseDown={stop}
                        onTouchStart={stop}
                        onKeyDown={stop}
                    >
                        {this.renderMeshDialog()}
                    </span>
                ) : null}
            </Box>
        );
    }

    private static rootStyle(theme: Theme, size: Size): Record<string, unknown> {
        switch (size) {
            case '2x0.5':
                return WidgetGeneric.getStyleWide(theme) as Record<string, unknown>;
            case '2x1':
                return WidgetGeneric.getStyleWideTall(theme) as Record<string, unknown>;
            case '2x2': {
                const getStyleHuge = (
                    WidgetGeneric as unknown as { getStyleHuge?: (theme: Theme) => Record<string, unknown> }
                ).getStyleHuge;
                return getStyleHuge
                    ? getStyleHuge(theme)
                    : {
                          ...(WidgetGeneric.getStyleCompact(theme) as Record<string, unknown>),
                          gridColumn: 'span 2',
                          gridRow: 'span 2',
                      };
            }
            default:
                return WidgetGeneric.getStyleCompact(theme) as Record<string, unknown>;
        }
    }

    private renderMeshDialog(): JSX.Element {
        const { data, loading, error } = this.state.mesh;

        return (
            <Dialog
                open
                onClose={this.closeMesh}
                maxWidth={false}
                aria-labelledby={`${this.dialogId}-title`}
                slotProps={{
                    paper: {
                        sx: {
                            width: 'min(1200px, calc(100vw - 32px))',
                            // only a message (instance stopped, box not connected): no empty space below it
                            height: error && !data ? 'auto' : 'min(880px, calc(100dvh - 32px))',
                            maxWidth: 'none',
                            maxHeight: 'none',
                            m: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            // a phone: the whole screen
                            '@media (max-width: 599.95px)': {
                                width: '100%',
                                height: '100%',
                                m: 0,
                                borderRadius: 0,
                            },
                        },
                    },
                }}
            >
                <DialogTitle
                    id={`${this.dialogId}-title`}
                    component="div"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1, py: 1.5 }}
                >
                    <MeshIcon sx={theme => ({ color: this.accent(theme), fontSize: 28, flexShrink: 0 })} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            component="h2"
                            noWrap
                            sx={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.3 }}
                        >
                            {I18n.t('fritzdm_meshTitle')}
                        </Typography>
                        <Typography
                            component="div"
                            variant="caption"
                            noWrap
                            sx={{ color: 'text.secondary', display: 'block' }}
                        >
                            {[this.displayName, this.instance].join(' · ')}
                        </Typography>
                    </Box>
                    <IconButton
                        onClick={this.closeMesh}
                        title={I18n.t('fritzdm_close')}
                        aria-label={I18n.t('fritzdm_close')}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent
                    sx={{
                        flex: '1 1 auto',
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        pt: 0,
                        px: { xs: 1.5, sm: 3 },
                        pb: { xs: 1.5, sm: 2.5 },
                    }}
                >
                    <MeshView
                        data={data}
                        loading={loading}
                        error={error}
                        onRefresh={() => void this.meshLoader?.refresh()}
                        t={meshT}
                        height="100%"
                        storageKey={MESH_STORAGE_KEY}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    // ---- sizes --------------------------------------------------------------------

    /** 1x1: symbol, download rate, name and state of the connection */
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
                    {this.renderIcon('max(34px, 25cqi)')}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    {this.hasRates
                        ? this.renderRateValue('receiveRate', 'max(1rem, 11.5cqi)', { muted: this.status !== 'online' })
                        : null}
                    {this.renderName('max(0.8rem, 8.5cqi)', 'max(0.68rem, 6.8cqi)')}
                    {this.renderStatus('max(0.66rem, 6.6cqi)', true)}
                </Box>
            </>,
        );
    }

    /** 2x0.5: name, state and rates, WLAN, IP and telephony in three short lines */
    renderWide(): JSX.Element {
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
                {this.renderIcon('34px')}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <Box sx={{ pr: '26px', minWidth: 0 }}>{this.renderName('0.85rem', '0.72rem')}</Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{this.renderStatus('0.72rem', true)}</Box>
                        {this.hasRates ? (
                            <Box
                                title={`${I18n.t('fritzdm_download')}: ${this.rateText('receiveRate')}, ${I18n.t('fritzdm_upload')}: ${this.rateText('sendRate')}`}
                                sx={{ display: 'flex', gap: '8px', flexShrink: 0, ...this.staleSx }}
                            >
                                {this.renderRateValue('receiveRate', '0.8rem')}
                                {this.renderRateValue('sendRate', '0.8rem', { unit: false })}
                            </Box>
                        ) : null}
                    </Box>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            height: 18,
                        }}
                    >
                        {this.renderWlan('0.66rem', false)}
                        <Box
                            sx={{
                                flex: '1 1 auto',
                                minWidth: 0,
                                display: 'flex',
                                // not enough room: the IP goes first
                                '@container (max-width: 340px)': { display: 'none' },
                            }}
                        >
                            {this.renderIp('0.68rem')}
                        </Box>
                        <Box sx={{ ml: 'auto', flexShrink: 0 }}>{this.renderPhone('0.66rem', false, 'count')}</Box>
                    </Box>
                </Box>
            </>,
        );
    }

    /** 2x1: name, state and IP, rates with the usage of the line, WLAN and telephony */
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 'max(10px, 3cqi)', minWidth: 0 }}>
                    {this.renderIcon('max(30px, 9cqi)')}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ pr: '26px', minWidth: 0 }}>
                            {this.renderName('max(0.875rem, 4.4cqi)', 'max(0.72rem, 3.5cqi)')}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Box sx={{ flex: '0 0 auto', maxWidth: '100%', minWidth: 0 }}>
                                {this.renderStatus('max(0.7rem, 3.3cqi)', true)}
                            </Box>
                            <Box sx={{ flex: '0 1 auto', minWidth: 0, display: 'flex', ml: 'auto' }}>
                                {this.renderIp('max(0.68rem, 3.2cqi)')}
                            </Box>
                        </Box>
                    </Box>
                </Box>
                {this.renderRates('max(0.95rem, 5cqi)', false)}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex' }}>
                        {this.renderWlan('max(0.66rem, 3cqi)', false)}
                    </Box>
                    <Box sx={{ flexShrink: 0 }}>{this.renderPhone('max(0.66rem, 3cqi)', false, 'count')}</Box>
                </Box>
            </>,
        );
    }

    /** 2x2: everything - connection, rates with the line, IP, WLAN, telephony and the way to the mesh */
    renderHuge(): JSX.Element {
        const modelLine = this.modelLine;
        const status = this.status;
        const connection = [
            status !== 'unreachable' ? this.accessType : '',
            status !== 'unreachable' ? this.linkStatus : '',
            status !== 'unreachable' ? str(this.values, 'provider') : '',
        ]
            .filter(Boolean)
            .join(' · ');
        const label = (text: string): JSX.Element => (
            <Typography
                variant="caption"
                noWrap
                sx={{
                    color: 'text.secondary',
                    fontSize: 'max(0.68rem, 2.6cqi)',
                    lineHeight: 1.2,
                    width: '28%',
                    flexShrink: 0,
                }}
            >
                {text}
            </Typography>
        );
        const ip = this.renderIp('max(0.75rem, 2.9cqi)');
        const wlan = this.renderWlan('max(0.68rem, 2.7cqi)', false);
        const phone = this.renderPhone('max(0.68rem, 2.7cqi)', true, 'auto');
        const row = (key: string, text: string, content: JSX.Element | null): JSX.Element | null =>
            content ? (
                <Box
                    key={key}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, minHeight: '1.6em' }}
                >
                    {label(text)}
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex' }}>{content}</Box>
                </Box>
            ) : null;

        return this.renderFrame(
            '2x2',
            theme => ({
                display: 'flex',
                flexDirection: 'column',
                gap: 'max(8px, 2.8cqi)',
                aspectRatio: '1',
                padding: isNeumorphicTheme(theme) ? 'max(14px, 4.5cqi)' : 'max(16px, 5cqi)',
            }),
            <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 'max(10px, 3cqi)', minWidth: 0, pr: '26px' }}>
                    {this.renderIcon('max(36px, 11cqi)')}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {this.renderName('max(0.95rem, 5cqi)', 'max(0.78rem, 3.8cqi)')}
                        {modelLine ? (
                            <Typography
                                variant="caption"
                                noWrap
                                component="div"
                                sx={{ color: 'text.secondary', lineHeight: 1.3, fontSize: 'max(0.7rem, 3cqi)' }}
                            >
                                {modelLine}
                            </Typography>
                        ) : null}
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box sx={{ flexShrink: 0 }}>{this.renderStatus('max(0.78rem, 3.3cqi)', false)}</Box>
                    {connection ? (
                        <Typography
                            variant="caption"
                            noWrap
                            sx={{ color: 'text.secondary', fontSize: 'max(0.7rem, 2.9cqi)', minWidth: 0 }}
                        >
                            {connection}
                        </Typography>
                    ) : null}
                </Box>

                {this.renderRates('max(1.05rem, 5.6cqi)', true)}

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'max(4px, 1.4cqi)', minWidth: 0 }}>
                    {row('ip', I18n.t('fritzdm_externalIp'), ip)}
                    {row('wlan', I18n.t('fritzdm_wlan'), wlan)}
                    {row('phone', I18n.t('fritzdm_phone'), phone)}
                </Box>

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
                    <MeshIcon />
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
                        {I18n.t('tr064_meshTopology')}
                    </Box>
                    <ChevronIcon />
                </Box>
            </>,
        );
    }
}

export default FritzBoxComponent;
