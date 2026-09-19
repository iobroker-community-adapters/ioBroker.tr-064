// this file is used only for the simulation (npm start) and not in the build of the component
import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { Box, Button, CssBaseline } from '@mui/material';

import { I18n, Theme, type IobTheme, type ThemeName } from '@iobroker/gui-components';
import type { ConfigGenericProps } from '@iobroker/json-config';

import MeshTopology from './MeshTopology';
import { bigMeshMock, meshMock } from './mockData';

import { meshTranslations } from './shared/i18n';

I18n.setTranslations(meshTranslations);

const params = new URLSearchParams(window.location.search);
// `?view=table&disconnected=true&configured=true` preset the settings which the component remembers
try {
    if (params.get('view') || params.get('disconnected') || params.get('configured')) {
        window.localStorage.setItem(
            'tr064.meshTopology',
            JSON.stringify({
                viewMode: params.get('view') || 'graph',
                showDisconnected: params.get('disconnected') === 'true',
                onlyConfigured: params.get('configured') === 'true',
            }),
        );
    }
} catch {
    // ignore
}
I18n.setLanguage(
    (params.get('lang') || navigator.language || 'en').substring(0, 2).toLowerCase() as ioBroker.Languages,
);

/**
 * Answers like the adapter: `?clients=100` for one box with many clients, `?error=not connected`, `?alive=false`.
 * `?width=320` limits the width of the component (phone), `?theme=dark`, `?lang=de`.
 */
const mockSocket = {
    getState: (): Promise<ioBroker.State> =>
        Promise.resolve({ val: params.get('alive') !== 'false' } as ioBroker.State),
    sendTo: (_instance: string, _command: string, _data: unknown): Promise<unknown> =>
        new Promise(resolve =>
            setTimeout(() => {
                if (params.get('error')) {
                    resolve({ error: params.get('error'), nodes: [], links: [] });
                } else if (params.get('clients')) {
                    resolve(bigMeshMock(parseInt(params.get('clients')!, 10) || 100));
                } else {
                    resolve(meshMock());
                }
            }, 300),
        ),
};

export default function App(): React.JSX.Element {
    const [themeName, setThemeName] = React.useState<ThemeName>((params.get('theme') as ThemeName) || 'light');
    const theme: IobTheme = React.useMemo(() => Theme(themeName), [themeName]);

    const oContext = {
        adapterName: 'tr-064',
        instance: 0,
        socket: mockSocket,
        themeType: theme.palette.mode,
        theme,
        _themeName: themeName,
        isFloatComma: true,
        dateFormat: 'DD.MM.YYYY',
        forceUpdate: () => {},
        systemConfig: {} as ioBroker.SystemConfigCommon,
        onCommandRunning: (): void => {},
    } as unknown as ConfigGenericProps['oContext'];

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Box
                    sx={{
                        p: params.get('width') ? 1 : 2,
                        minHeight: '100vh',
                        maxWidth: params.get('width') ? `${parseInt(params.get('width')!, 10)}px` : undefined,
                        backgroundColor: theme.palette.background.default,
                    }}
                >
                    <Button
                        sx={{ mb: 2 }}
                        variant="outlined"
                        onClick={() => setThemeName(themeName === 'dark' ? 'light' : 'dark')}
                    >
                        {themeName === 'dark' ? 'light' : 'dark'}
                    </Button>
                    <MeshTopology
                        key={themeName}
                        oContext={oContext}
                        alive
                        changed={false}
                        themeName={themeName}
                        common={{}}
                        attr="_mesh"
                        data={{}}
                        originalData={{}}
                        onError={() => {}}
                        onChange={() => {}}
                        schema={{
                            type: 'custom',
                            url: '',
                            i18n: true,
                            name: 'ConfigCustomTr064Set/Components/MeshTopology',
                        }}
                    />
                </Box>
            </ThemeProvider>
        </StyledEngineProvider>
    );
}
