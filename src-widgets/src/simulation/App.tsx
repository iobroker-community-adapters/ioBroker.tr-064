// Only for the simulation (npm start) - never part of the widget build.
//
// URL parameters:
//   ?theme=dark            dark theme of ioBroker (text.secondary is white there, like in vis-2)
//   ?lang=de               language
//   ?scene=tile|mesh|presence&w=150&h=150   one widget in this size (default: overview of all)
//   ?h=auto                no height in the style: the widget grows with its content
//   ?open=1                clicks the tile after the start (mesh dialog)
//   ?edit=1                edit mode (no dialog)
//   ?noCard=1 ?hideDetails=1 ?switchWlan=1 ?name=Office    attributes of the tile
//   ?view=table ?onlyConfigured=1 ?showDisconnected=1 ?title=Mesh   attributes of the mesh widget
//   ?box=offline|stopped|minimal ?ringing=1 ?live=1 ?meshError=timeout ?clients=100    data
import React from 'react';
import { createRoot } from 'react-dom/client';

import { Box, createTheme, CssBaseline, ThemeProvider } from '@mui/material';

import Tr064FritzBox from '../Tr064FritzBox';
import Tr064Mesh from '../Tr064Mesh';
import Tr064Presence from '../Tr064Presence';
import MockSocket from './mockSocket';
import type { MockWidgetProps } from './VisRxWidgetMock';

const params = new URLSearchParams(window.location.search);
const themeType = params.get('theme') === 'dark' ? 'dark' : 'light';

// the light and dark theme of ioBroker (`Theme()` of @iobroker/gui-components)
const theme =
    themeType === 'dark'
        ? createTheme({
              palette: {
                  mode: 'dark',
                  background: { paper: '#121212', default: '#121212' },
                  primary: { main: '#4dabf5' },
                  secondary: { main: '#436a93' },
                  text: { primary: '#ffffff', secondary: '#ffffff' },
              },
          })
        : createTheme({
              palette: {
                  mode: 'light',
                  primary: { main: '#3399CC' },
                  secondary: { main: '#164477' },
              },
          });

const socket = new MockSocket({
    box: params.get('box') || 'full',
    ringing: params.get('ringing') === '1',
    live: params.get('live') === '1',
    meshError: params.get('meshError') || '',
    clients: parseInt(params.get('clients') || '0', 10) || 0,
});

const context = {
    socket,
    themeType,
    theme,
    lang: params.get('lang') || 'en',
    setValue: (id: string, value: ioBroker.StateValue) => socket.setValue(id, value),
    views: {},
};

const editMode = params.get('edit') === '1';

type WidgetClass = React.ComponentType<MockWidgetProps>;

let counter = 0;

function Widget(props: {
    widget: unknown;
    data: Record<string, unknown>;
    width: number | string;
    height: number | string;
    label?: string;
}): React.JSX.Element {
    const [id] = React.useState(() => `w${String(++counter).padStart(6, '0')}`);
    const Component = props.widget as WidgetClass;
    const style: Record<string, string | number> = { width: props.width };
    if (props.height !== 'auto') {
        style.height = props.height;
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {props.label ? (
                <Box sx={{ fontSize: 11, opacity: 0.6, fontFamily: 'monospace', color: 'text.primary' }}>
                    {props.label}
                </Box>
            ) : null}
            <Component
                id={id}
                editMode={editMode}
                data={{ instance: 'tr-064.0', ...props.data }}
                style={style}
                context={context}
            />
        </Box>
    );
}

function size(name: string, fallback: number): number | string {
    const value = params.get(name);
    if (value === 'auto') {
        return 'auto';
    }
    return value ? parseInt(value, 10) || fallback : fallback;
}

function tileData(): Record<string, unknown> {
    return {
        boxName: params.get('name') || '',
        noCard: params.get('noCard') === '1',
        hideDetails: params.get('hideDetails') === '1',
        switchWlan: params.get('switchWlan') === '1',
        showIp: params.get('showIp') !== '0',
        showWlan: params.get('showWlan') !== '0',
        showMessages: params.get('showMessages') !== '0',
    };
}

function meshData(): Record<string, unknown> {
    return {
        view: params.get('view') === 'table' ? 'table' : 'graph',
        onlyConfigured: params.get('onlyConfigured') === '1',
        showDisconnected: params.get('showDisconnected') === '1',
        widgetTitle: params.get('title') || '',
        noCard: params.get('noCard') === '1',
    };
}

function Overview(): React.JSX.Element {
    const tiles: [number, number | string][] = [
        [150, 150],
        [200, 200],
        [260, 200],
        [360, 280],
        [420, 320],
        [380, 90],
    ];
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
                {tiles.map(([w, h]) => (
                    <Widget
                        key={`${w}x${h}`}
                        widget={Tr064FritzBox}
                        data={tileData()}
                        width={w}
                        height={h}
                        label={`${w}×${h}`}
                    />
                ))}
                <Widget
                    widget={Tr064FritzBox}
                    data={{ ...tileData(), noCard: true }}
                    width={260}
                    height={200}
                    label="noCard 260×200"
                />
                <Widget
                    widget={Tr064FritzBox}
                    data={{ ...tileData(), hideDetails: true }}
                    width={200}
                    height={200}
                    label="hideDetails 200×200"
                />
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
                <Widget
                    widget={Tr064Mesh}
                    data={meshData()}
                    width={760}
                    height={480}
                    label="Tr064Mesh 760×480"
                />
                <Widget
                    widget={Tr064Mesh}
                    data={meshData()}
                    width={360}
                    height={480}
                    label="Tr064Mesh 360×480"
                />
                <Widget
                    widget={Tr064Presence}
                    data={{}}
                    width={300}
                    height={360}
                    label="Tr064Presence 300×360"
                />
            </Box>
        </Box>
    );
}

function Scene(): React.JSX.Element {
    const scene = params.get('scene');
    if (scene === 'tile') {
        return (
            <Widget
                widget={Tr064FritzBox}
                data={tileData()}
                width={size('w', 360)}
                height={size('h', 280)}
            />
        );
    }
    if (scene === 'mesh') {
        return (
            <Widget
                widget={Tr064Mesh}
                data={meshData()}
                width={size('w', 760)}
                height={size('h', 480)}
            />
        );
    }
    if (scene === 'presence') {
        return (
            <Widget
                widget={Tr064Presence}
                data={{ onlyActive: params.get('onlyActive') === '1', widgetTitle: params.get('title') || '' }}
                width={size('w', 300)}
                height={size('h', 360)}
            />
        );
    }
    return <Overview />;
}

function App(): React.JSX.Element {
    React.useEffect(() => {
        if (params.get('selftest')) {
            void import('./selftest').then(module => module.runSelfTest(socket));
        }
        if (params.get('open') === '1') {
            const timer = setTimeout(() => {
                document.querySelector<HTMLElement>('.tr064-fritzbox [role="button"]')?.click();
            }, 400);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, []);

    return (
        <ThemeProvider theme={theme}>
            {/* `?bare=1`: only the widget on a transparent page, for the preview images */}
            {params.get('bare') ? null : <CssBaseline />}
            <Box
                sx={{
                    minHeight: '100vh',
                    p: params.get('bare') ? 0 : params.get('scene') ? 1 : 2,
                    backgroundColor: params.get('bare') ? 'transparent' : themeType === 'dark' ? '#121212' : '#eef1f4',
                }}
            >
                <Scene />
            </Box>
        </ThemeProvider>
    );
}

/**
 * `?frame=360&frameHeight=740`: the simulation in an iframe of exactly this size - a phone. Headless
 * Chrome does not make a window narrower than 500 px, and media queries need the real viewport.
 */
function Frame(): React.JSX.Element {
    const inner = new URLSearchParams(window.location.search);
    const width = parseInt(inner.get('frame') || '360', 10) || 360;
    const height = parseInt(inner.get('frameHeight') || '740', 10) || 740;
    inner.delete('frame');
    inner.delete('frameHeight');
    return (
        <iframe
            title="phone"
            src={`${window.location.pathname}?${inner.toString()}`}
            style={{ width, height, border: 0, display: 'block' }}
        />
    );
}

export function renderApp(): void {
    const container = document.getElementById('root');
    if (container) {
        document.body.style.margin = '0';
        createRoot(container).render(params.get('frame') ? <Frame /> : <App />);
    }
}
