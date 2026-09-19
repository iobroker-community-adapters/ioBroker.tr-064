// SIMULATION ONLY (`npm start`) - not part of the federation build (that starts at Components.tsx).
//
// Renders the tile in all sizes with mocked states and a mocked `sendTo('tr-064.0', 'mesh')`, in a
// grid like the one of ioBroker.devices (columns of at least 135 px, 12 px gap, the 2x1 wrapper of
// `WidgetPlugin`). URL parameters:
//   ?theme=light|dark|neumorphic   ?lang=de   ?view=tiles|dialog   ?scenario=full|ringing|minimal|offline
//   ?width=<px of the grid>        ?live=1 (changing rates)
// `#dialog=<id>` in the URL keeps an open dialog over a reload, like ioBroker.devices does.

import React, { useEffect, useMemo, useState } from 'react';
import { Box, CssBaseline, ThemeProvider, createTheme, type Theme, type ThemeOptions } from '@mui/material';
import { I18n, type Connection, type ThemeType } from '@iobroker/gui-components';
import type { IStateContext, ObjectChangeListener, StateChangeListener } from '@iobroker/dm-widgets';

import FritzBoxComponent from './FritzBoxComponent';
import translations from './translations';
import { meshMock, mockStates, SCENARIOS, type Scenario } from './mockData';

const params = new URLSearchParams(window.location.search);
const THEME = params.get('theme') || 'dark';
const LANG = (params.get('lang') || 'en') as ioBroker.Languages;
const VIEW = params.get('view') || 'tiles';
const GRID_WIDTH = Number(params.get('width')) || 0;
const LIVE = params.get('live') === '1';
const INSTANCE = 'tr-064.0';

// ioBroker.devices loads `./translations` of the plugin and merges it before the components
I18n.extendTranslations(translations);
I18n.setLanguage(LANG);

/** The theme presets of ioBroker.devices (CategoryList.tsx) which are simulated here */
const PRESETS: Record<string, { options: ThemeOptions; wmPreset: string }> = {
    dark: {
        wmPreset: 'dark',
        options: {
            palette: {
                mode: 'dark',
                primary: { main: '#90caf9' },
                secondary: { main: '#ce93d8' },
                background: { default: '#000000', paper: '#1e1e1e' },
                text: { primary: '#ffffff', secondary: 'rgba(255,255,255,0.7)', disabled: 'rgba(255,255,255,0.5)' },
            },
        },
    },
    light: {
        wmPreset: 'light',
        options: {
            palette: {
                mode: 'light',
                primary: { main: '#1976d2' },
                secondary: { main: '#9c27b0' },
                background: { default: '#ffffff', paper: '#ffffff' },
                text: { primary: '#000000', secondary: 'rgba(0,0,0,0.6)', disabled: 'rgba(0,0,0,0.38)' },
            },
        },
    },
    neumorphic: {
        wmPreset: 'styling-grey',
        options: {
            palette: {
                mode: 'dark',
                primary: { main: '#a0a0a0' },
                secondary: { main: '#78909c' },
                background: { default: '#000000', paper: '#1c1c1e' },
                text: {
                    primary: '#e8e8e8',
                    secondary: 'rgba(232,232,232,0.55)',
                    disabled: 'rgba(232,232,232,0.35)',
                },
            },
            components: {
                MuiDialog: {
                    styleOverrides: {
                        paper: {
                            borderRadius: '28px',
                            background: 'linear-gradient(145deg, #222224, #1a1a1c)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            boxShadow: '0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
                        },
                    },
                },
            },
        },
    },
};

function buildTheme(name: string): Theme {
    const preset = PRESETS[name] || PRESETS.dark;
    const theme = createTheme({
        ...preset.options,
        typography: { fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif' },
    });
    (theme as Theme & { wmPreset?: string }).wmPreset = preset.wmPreset;
    return theme;
}

/** `IStateContext` of ioBroker.devices with the states of one scenario and a fake socket */
/* eslint-disable class-methods-use-this -- methods of the interface which the simulation does not need */
class MockStateContext implements IStateContext {
    private readonly handlers = new Map<string, Set<StateChangeListener>>();

    private readonly states: Record<string, ioBroker.State> = {};

    defaultHistory: string | null = null;
    instanceId = 'devices.0';
    admin = true;
    language: ioBroker.Languages = LANG;
    longitude: number | null = null;
    latitude: number | null = null;
    isFloatComma = LANG !== 'en';
    dateFormat = 'DD.MM.YYYY';
    imagePrefix = '../../files/';
    themeType: ThemeType;

    constructor(scenario: Scenario, themeType: ThemeType) {
        this.themeType = themeType;
        const values = mockStates(scenario);
        for (const [id, val] of Object.entries(values)) {
            this.states[`${INSTANCE}.${id}`] = { val, ack: true, ts: Date.now(), lc: Date.now(), from: 'sim', q: 0 };
        }
        this.states[`system.adapter.${INSTANCE}.alive`] = {
            // the instance runs - in the scenario `offline` only the box does not answer
            val: true,
            ack: true,
            ts: Date.now(),
            lc: Date.now(),
            from: 'sim',
            q: 0,
        };
    }

    /** Changes a state like the adapter would do it */
    setMockState(id: string, val: ioBroker.StateValue): void {
        const state: ioBroker.State = { val, ack: true, ts: Date.now(), lc: Date.now(), from: 'sim', q: 0 };
        this.states[id] = state;
        this.handlers.get(id)?.forEach(handler => handler(id, state));
    }

    getMockState(id: string): ioBroker.StateValue | undefined {
        return this.states[id]?.val;
    }

    getState(id: string, handler: StateChangeListener): void {
        let set = this.handlers.get(id);
        if (!set) {
            set = new Set();
            this.handlers.set(id, set);
        }
        set.add(handler);
        // like the host: batched, and a missing state is delivered with `val: null`
        setTimeout(() => {
            if (this.handlers.get(id)?.has(handler)) {
                handler(id, this.states[id] || ({ val: null, ack: true, ts: Date.now() } as ioBroker.State));
            }
        }, 50);
    }

    removeState(id: string, handler: StateChangeListener): void {
        this.handlers.get(id)?.delete(handler);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getObject<T>(_id: string): Promise<T | undefined> {
        return undefined;
    }

    getObjectProperty(_id: string, _property: string, _cb: ObjectChangeListener): void {
        // not used
    }

    async removeObject(_id: string, _cb: ObjectChangeListener): Promise<void> {
        // not used
    }

    getImagePath(fileName: string | null | undefined): string | null {
        return fileName || null;
    }

    setCoordinates(latitude: number | null, longitude: number | null): void {
        this.latitude = latitude;
        this.longitude = longitude;
    }

    getSocket(): Connection {
        const socket = {
            getState: async (id: string): Promise<ioBroker.State | null> => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return this.states[id] || null;
            },
            sendTo: async (instance: string, command: string): Promise<unknown> => {
                console.debug(`[sim] sendTo ${instance} ${command}`);
                await new Promise(resolve => setTimeout(resolve, 600));
                if (instance !== INSTANCE || command !== 'mesh') {
                    return null;
                }
                if (this.states[`${INSTANCE}.info.connection`]?.val === false) {
                    return { error: 'not connected', nodes: [], links: [] };
                }
                return meshMock();
            },
        };
        return socket as unknown as Connection;
    }

    destroy(): void {
        this.handlers.clear();
    }
}

const baseSettings = {
    type: 'plugin' as const,
    pluginAdapter: 'tr-064',
    pluginComponent: 'FritzBoxComponent',
    pluginUrl: 'customDevices.js',
    favorite: false,
    name: '',
    color: '',
    colorActive: '',
    chartHours: 0,
    icon: '',
    iconActive: '',
    text: '',
    textActive: '',
    instance: INSTANCE,
    showExternalIp: true,
};

type Size = '1x1' | '2x0.5' | '2x1' | '2x2';

function widgetInfo(id: string): never {
    return {
        type: 'widget',
        id,
        name: '',
        control: { states: [], type: 'info', storeId: '', parentId: '', deviceId: '', channelId: '' },
    } as never;
}

function readDialogFromHash(): string | null {
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('dialog');
}

/** The wrapper of `WidgetPlugin` of ioBroker.devices for 2x1 (sizer, the plugin fills it) */
function PluginFrame(props: { size: Size; children: React.ReactNode }): React.JSX.Element {
    if (props.size !== '2x1') {
        return <>{props.children}</>;
    }
    return (
        <Box sx={{ position: 'relative', gridColumn: 'span 2', overflow: 'hidden' }}>
            <Box sx={{ width: 'calc(50% - 6px)', aspectRatio: '1' }} />
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    '& > *': { width: '100%', height: '100%', gridColumn: 'unset', aspectRatio: 'unset' },
                    '& > * > *': { aspectRatio: 'unset', height: '100%' },
                }}
            >
                {props.children}
            </Box>
        </Box>
    );
}

/** The grid cell of ioBroker.devices (`getGridColumn` of Category.tsx) */
function gridSpan(size: Size): React.CSSProperties {
    if (size === '2x2') {
        return { gridColumn: 'span 2', gridRow: 'span 2' };
    }
    return size === '1x1' ? {} : { gridColumn: 'span 2' };
}

/** The tile class: the local one, or the one loaded through module federation (host-sim.tsx) */
export type TileClass = typeof FritzBoxComponent;

function Tiles(props: {
    component: TileClass;
    scenario: Scenario;
    context: MockStateContext;
    sizes: Size[];
    openDialogId: string | null;
    onOpen: (id: string) => void;
    onClose: () => void;
}): React.JSX.Element {
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
                gap: 1.5,
                alignItems: 'start',
                width: GRID_WIDTH ? `${GRID_WIDTH}px` : '100%',
            }}
        >
            {props.sizes.map(size => {
                const id = `fritz_${props.scenario}_${size.replace('.', '_')}`;
                return (
                    <div
                        key={id}
                        style={gridSpan(size)}
                    >
                        <PluginFrame size={size}>
                            <props.component
                                widget={widgetInfo(id)}
                                stateContext={props.context}
                                settings={{ ...baseSettings, id, size }}
                                onOpenSettings={() => console.log(`settings of ${id}`)}
                                openDialogId={props.openDialogId}
                                onOpenWidgetDialog={props.onOpen}
                                onCloseWidgetDialog={props.onClose}
                                onHide={() => {}}
                            />
                        </PluginFrame>
                    </div>
                );
            })}
        </Box>
    );
}

export default function App(props: { component?: TileClass; banner?: string }): React.JSX.Element {
    const theme = useMemo(() => buildTheme(THEME), []);
    const [openDialogId, setOpenDialogId] = useState<string | null>(() =>
        VIEW === 'dialog' ? `fritz_${params.get('scenario') || 'full'}_2x1_mesh` : readDialogFromHash(),
    );
    const contexts = useMemo(() => {
        const result = {} as Record<Scenario, MockStateContext>;
        for (const { id } of SCENARIOS) {
            result[id] = new MockStateContext(id, theme.palette.mode);
        }
        return result;
    }, [theme]);

    useEffect(() => {
        const onHash = (): void => setOpenDialogId(readDialogFromHash());
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    // changing rates, a call now and then
    useEffect(() => {
        if (!LIVE) {
            return undefined;
        }
        const timer = setInterval(() => {
            const context = contexts.full;
            const rx = 2_000_000 + Math.round(Math.random() * 20_000_000);
            context.setMockState(`${INSTANCE}.states.wanReceiveRate`, rx);
            context.setMockState(`${INSTANCE}.states.wanSendRate`, Math.round(rx / 8));
            context.setMockState(
                `${INSTANCE}.callmonitor.ringing`,
                !context.getMockState(`${INSTANCE}.callmonitor.ringing`),
            );
        }, 3000);
        return () => clearInterval(timer);
    }, [contexts]);

    const onOpen = (id: string): void => {
        setOpenDialogId(id);
        window.history.replaceState(null, '', `${window.location.search}#dialog=${encodeURIComponent(id)}`);
    };
    const onClose = (): void => {
        setOpenDialogId(null);
        window.history.replaceState(null, '', window.location.search || window.location.pathname);
    };

    const scenarios =
        VIEW === 'dialog' ? SCENARIOS.filter(item => item.id === (params.get('scenario') || 'full')) : SCENARIOS;
    const only = params.get('scenario');

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box
                sx={{
                    minHeight: '100vh',
                    p: { xs: 2, sm: 3 },
                    bgcolor: 'background.default',
                    color: 'text.primary',
                    fontFamily: theme.typography.fontFamily,
                }}
            >
                {props.banner ? (
                    <Box sx={{ mb: 2, fontSize: 13, color: 'success.main', fontWeight: 600 }}>{props.banner}</Box>
                ) : null}
                {scenarios
                    .filter(item => !only || item.id === only)
                    .map(item => (
                        <Box
                            key={item.id}
                            sx={{ mb: 3 }}
                        >
                            <Box sx={{ mb: 1, fontSize: 13, color: 'text.secondary', fontWeight: 600 }}>
                                {`${item.title} - ${THEME}, ${LANG}`}
                            </Box>
                            <Tiles
                                component={props.component || FritzBoxComponent}
                                scenario={item.id}
                                context={contexts[item.id]}
                                sizes={VIEW === 'dialog' ? ['2x1'] : ['1x1', '2x0.5', '2x1', '2x2']}
                                openDialogId={openDialogId}
                                onOpen={onOpen}
                                onClose={onClose}
                            />
                        </Box>
                    ))}
            </Box>
        </ThemeProvider>
    );
}
