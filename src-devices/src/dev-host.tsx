// SIMULATION ONLY (`npm start`) - not part of the federation build.
//
// A reduced copy of what ioBroker.devices provides to its plugins on `window.__iobrokerDmWidgets__`
// (src-admin/src/WidgetsManager/Widgets/Generic.tsx of ioBroker.devices): `WidgetGeneric` with the
// size dispatch in `render()`, the indicator cluster, the settings button, the frame styles and
// `getTileStyles()` (default, dark and the neumorphic "styling-grey" look). The packaged
// `@iobroker/dm-widgets` only has stubs that render nothing.

/* eslint-disable class-methods-use-this, react/no-unused-class-component-methods -- a mirror of the host class */
import React from 'react';
import { alpha, Box, Tooltip, type SxProps, type Theme } from '@mui/material';
import { LinkOff, Settings } from '@mui/icons-material';

import type { IndicatorValues, WidgetGenericProps, WidgetGenericState, WidgetSettingsBase } from '@iobroker/dm-widgets';

export function isNeumorphicTheme(theme: Theme): boolean {
    return (theme as Theme & { wmPreset?: string }).wmPreset === 'styling-grey';
}

export function getTileStyles(
    theme: Theme,
    isActive: boolean,
    accentColor?: string,
    interactive = true,
    inactiveColor?: string,
): Record<string, unknown> {
    const accent = accentColor || theme.palette.primary.main;
    const isDark = theme.palette.mode === 'dark';
    const white = theme.palette.common.white;
    const black = theme.palette.common.black;

    if (isNeumorphicTheme(theme)) {
        const grey = 'linear-gradient(to bottom right, #232326, #191a1c)';
        return {
            borderRadius: '24px',
            boxSizing: 'border-box',
            padding: theme.spacing(2),
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            background: isActive
                ? `linear-gradient(to bottom right, ${alpha(accent, 0.16)}, ${alpha(accent, 0.04)} 50%, transparent 70%), linear-gradient(to bottom right, transparent 45%, ${alpha(black, 0.35)}), ${grey}`
                : [
                      `linear-gradient(to bottom right, ${alpha(white, 0.14)}, ${alpha(white, 0.02)} 42%, transparent 62%)`,
                      `linear-gradient(to bottom right, ${alpha(inactiveColor || white, inactiveColor ? 0.22 : 0.12)}, transparent 50%)`,
                      `linear-gradient(to bottom right, transparent 45%, ${alpha(black, 0.4)})`,
                      grey,
                  ].join(', '),
            border: `1px solid ${isActive ? alpha(white, 0.09) : alpha(white, 0.055)}`,
            boxShadow: [
                `inset 0 1px 0 ${alpha(white, isActive ? 0.1 : 0.07)}`,
                `inset 0 -20px 34px -26px ${alpha(black, 0.75)}`,
                ...(isActive
                    ? [`inset 0 0 0 1px ${alpha(accent, 0.35)}`, `inset 0 24px 40px -30px ${alpha(accent, 0.9)}`]
                    : []),
                '6px 6px 16px rgba(0,0,0,0.5), -3px -3px 10px rgba(255,255,255,0.025)',
            ].join(', '),
            ...(interactive ? { '&:active': { transform: 'scale(0.97)' } } : {}),
        };
    }

    const bgInactive = inactiveColor ? alpha(inactiveColor, 0.12) : isDark ? alpha(white, 0.06) : alpha(black, 0.035);
    const borderInactive = inactiveColor ? alpha(inactiveColor, 0.3) : isDark ? alpha(white, 0.08) : alpha(black, 0.08);

    return {
        borderRadius: '16px',
        boxSizing: 'border-box',
        padding: theme.spacing(2),
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        backgroundColor: isActive ? alpha(accent, 0.12) : bgInactive,
        border: `1.5px solid ${isActive ? alpha(accent, 0.3) : borderInactive}`,
        ...(interactive ? { '&:active': { transform: 'scale(0.97)' } } : {}),
    };
}

const DEFAULT_INDICATORS: IndicatorValues = {
    working: null,
    unreach: null,
    lowbat: null,
    maintain: null,
    error: null,
    direction: null,
    connected: null,
    battery: null,
};

export class WidgetGeneric<
    TState extends WidgetGenericState = WidgetGenericState,
    TSettings extends WidgetSettingsBase = WidgetSettingsBase,
> extends React.Component<WidgetGenericProps<TSettings>, TState> {
    protected nameRef = React.createRef<HTMLSpanElement>();

    constructor(props: WidgetGenericProps<TSettings>) {
        super(props);
        this.state = {
            name: null,
            color: null,
            indicators: { ...DEFAULT_INDICATORS },
            chartSeries: [],
            chartDialogOpen: false,
            chartType: 'line',
            pinPadOpen: false,
            pinPadPin: '',
            confirmDialogOpen: false,
            confirmDialogMode: 'dialog',
            confirmDialogPin: '',
            confirmDialogText: '',
        } as unknown as TState;
    }

    componentDidMount(): void {
        const name = this.props.widget.name;
        this.setState({ name: typeof name === 'string' ? name : '' } as Partial<TState> as TState);
        this.adjustNameFontSize();
    }

    componentDidUpdate(_prevProps: Readonly<WidgetGenericProps<TSettings>>): void {
        this.adjustNameFontSize();
    }

    componentWillUnmount(): void {
        // nothing
    }

    static getDefaultSettings(): WidgetSettingsBase {
        return {
            size: '1x1',
            chartHours: 12,
            name: '',
            color: '',
            colorActive: '',
            favorite: false,
            icon: '',
            iconActive: '',
            text: '',
            textActive: '',
        };
    }

    static getConfigSchema(): unknown {
        return null;
    }

    protected adjustNameFontSize(): void {
        const el = this.nameRef.current;
        if (!el) {
            return;
        }
        el.style.fontSize = '';
        if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
            const current = parseFloat(getComputedStyle(el).fontSize);
            el.style.fontSize = `${Math.floor(current * (el.clientWidth / el.scrollWidth))}px`;
        }
    }

    protected getText(text: ioBroker.StringOrTranslated): string {
        return typeof text === 'string' ? text : text.en || '';
    }

    protected getWidgetClass(): string {
        return `widget-${this.props.widget.control?.type || 'unknown'}`;
    }

    protected getAccentColor(): string | undefined {
        return this.props.settings?.colorActive || this.state.color || undefined;
    }

    protected getInactiveColor(): string | undefined {
        return this.props.settings?.color || undefined;
    }

    protected isTileActive(): boolean {
        return false;
    }

    protected hasTileAction(): boolean {
        return false;
    }

    protected onTileClick(): void {
        // noop
    }

    protected renderTileIcon(): React.JSX.Element | null {
        return null;
    }

    protected renderChart(): React.JSX.Element | null {
        return null;
    }

    protected renderIndicators(
        settingsButton?: React.JSX.Element | null,
        extraStates?: React.JSX.Element | null,
    ): React.JSX.Element | null {
        const { indicators } = this.state;
        const items: React.JSX.Element[] = [];
        if (indicators?.connected === false) {
            items.push(
                <Tooltip
                    key="connected"
                    title="Disconnected"
                >
                    <LinkOff sx={{ fontSize: 16, color: 'error.main' }} />
                </Tooltip>,
            );
        }
        if (!items.length && !extraStates && !settingsButton) {
            return null;
        }
        return (
            <Box
                className="wm-tile-indicators"
                sx={{
                    position: 'absolute',
                    top: 'max(4px, 2cqi)',
                    right: 'max(4px, 2cqi)',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    flexWrap: 'wrap',
                }}
            >
                {items}
                {extraStates}
                {settingsButton}
            </Box>
        );
    }

    protected renderSettingsButton(): React.JSX.Element | null {
        if (!this.props.onOpenSettings) {
            return null;
        }
        return (
            <Box
                component="span"
                role="button"
                tabIndex={0}
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    this.props.onOpenSettings!(this.props.widget.id);
                }}
                sx={WidgetGeneric.getSettingButtonStyle()}
            >
                <Settings sx={{ fontSize: 16 }} />
            </Box>
        );
    }

    static getStyleCompact(theme: Theme): React.CSSProperties {
        return {
            position: 'relative',
            containerType: 'inline-size',
            overflow: 'hidden',
            borderRadius: isNeumorphicTheme(theme) ? '24px' : '16px',
        };
    }

    static getStyleWide(theme: Theme): React.CSSProperties {
        return { ...WidgetGeneric.getStyleCompact(theme), gridColumn: 'span 2' };
    }

    static getStyleWideTall(theme: Theme): React.CSSProperties {
        return WidgetGeneric.getStyleWide(theme);
    }

    static getStyleHuge(theme: Theme): React.CSSProperties {
        return { ...WidgetGeneric.getStyleCompact(theme), gridColumn: 'span 2', gridRow: 'span 2' };
    }

    static getSettingButtonStyle(): SxProps<Theme> {
        return (theme: Theme) => ({
            p: '3px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 2,
            color: theme.palette.primary.main,
            opacity: 0.6,
            '&:hover': { opacity: 1, backgroundColor: theme.palette.action.hover },
        });
    }

    renderCompact(): React.JSX.Element {
        return <div />;
    }

    renderWide(): React.JSX.Element {
        return this.renderCompact();
    }

    renderWideTall(): React.JSX.Element {
        return this.renderWide();
    }

    renderHuge(): React.JSX.Element {
        return this.renderWideTall();
    }

    render(): React.JSX.Element {
        const size = this.props.settings?.size || '1x1';
        if (size === '2x0.5') {
            return this.renderWide();
        }
        if (size === '2x1') {
            return this.renderWideTall();
        }
        if (size === '2x2') {
            return this.renderHuge();
        }
        return this.renderCompact();
    }
}

export default WidgetGeneric;

/** Not used by the tile - only so `@iobroker/dm-widgets` finds all names it re-exports */
export class StateContext {}
