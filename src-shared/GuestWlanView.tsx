/**
 * QR code of a WLAN (the guest WLAN or one band of the own WLAN) with network name and password.
 *
 * Host independent like `MeshView`: it does not fetch anything (see `guestWlanApi.ts`) and gets
 * its texts by `t`. The code is always black on white - most phone cameras do not read an
 * inverted code, so the dark theme gets a white card with the code.
 */
import React, { useMemo } from 'react';

import { alpha, Box, CircularProgress, useTheme } from '@mui/material';
import { WifiOff as IconWifiOff } from '@mui/icons-material';

import { qrPath, wifiQrText } from './guestWlanApi';
import {
    MESH_ERROR_NOT_ALIVE,
    MESH_ERROR_NOT_CONNECTED,
    MESH_ERROR_NOT_SUPPORTED,
    MESH_ERROR_TIMEOUT,
} from './meshApi';
import type { MeshTranslate } from './MeshView';
import type { GuestWlanResponse, WlanQrKind } from './types';

/** Light modules around the code (the standard asks for 4, the white card adds its own margin) */
const QUIET_ZONE = 2;

export interface GuestWlanViewProps {
    /** Answer of the adapter, `null` while nothing was read yet */
    data: GuestWlanResponse | null;
    /** A request is running */
    loading: boolean;
    /** Error code (`not alive`, `not connected`, `not supported`, `timeout`) or text */
    error: string | null;
    /** Translation of the `tr064_guest*` keys */
    t: MeshTranslate;
    /** The WLAN of the code, for the texts. Default: the guest WLAN */
    wlan?: WlanQrKind;
    /** The network name below/next to the code, default `true` */
    showSsid?: boolean;
    /** The password below/next to the code, default `true` */
    showPassword?: boolean;
    /** `column`: code above the texts (default), `row`: code left, texts right, `qr`: only the code */
    layout?: 'column' | 'row' | 'qr';
    /** Edge length of the code (CSS). Without it the code fills the free space of the view */
    qrSize?: string | number;
    /** Font size of the texts (CSS), default `inherit` */
    fontSize?: string | number;
}

/**
 * The text of an error code
 *
 * @param error error code or text of `fetchGuestWlan()`
 * @param t translation
 * @param wlan the WLAN of the code - the texts of the guest WLAN name it
 */
export function guestWlanErrorText(error: string, t: MeshTranslate, wlan: WlanQrKind = 'guest'): string {
    const guest = wlan === 'guest';
    switch (error) {
        case MESH_ERROR_NOT_ALIVE:
            return t(guest ? 'tr064_guestNotAlive' : 'tr064_wlanNotAlive');
        case MESH_ERROR_NOT_CONNECTED:
            return t('tr064_guestNotConnected');
        case MESH_ERROR_NOT_SUPPORTED:
            return t(guest ? 'tr064_guestNotSupported' : 'tr064_wlanNotSupported');
        case MESH_ERROR_TIMEOUT:
            return t('tr064_timeout');
        default:
            return t(guest ? 'tr064_guestError' : 'tr064_wlanError', error);
    }
}

/**
 * The QR code as SVG. It fills its box and stays square (`viewBox`), centered in the box.
 *
 * @param props properties
 * @param props.text content of the code, e.g. `wifiQrText()`
 * @param props.label accessible name of the image
 * @param props.style additional style of the `svg`
 */
export function QrCodeSvg(props: { text: string; label?: string; style?: React.CSSProperties }): React.JSX.Element {
    const qr = useMemo(() => qrPath(props.text), [props.text]);
    const total = qr.size + 2 * QUIET_ZONE;
    return (
        <svg
            viewBox={`0 0 ${total} ${total}`}
            role="img"
            aria-label={props.label}
            shapeRendering="crispEdges"
            style={{ display: 'block', width: '100%', height: '100%', ...props.style }}
        >
            <rect
                width={total}
                height={total}
                rx={total * 0.04}
                fill="#ffffff"
            />
            <path
                transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`}
                d={qr.d}
                fill="#000000"
            />
        </svg>
    );
}

/**
 * QR code and access data of the guest WLAN, or why there is none.
 *
 * Fills its parent (`height: 100%`) unless `qrSize` is given - then it takes its natural size.
 *
 * @param props properties
 */
export default function GuestWlanView(props: GuestWlanViewProps): React.JSX.Element {
    const theme = useTheme();
    const { data, t } = props;
    const layout = props.layout || 'column';
    const fill = props.qrSize === undefined;
    const muted = alpha(theme.palette.text.primary, 0.64);

    const center = (content: React.ReactNode): React.JSX.Element => (
        <Box
            sx={{
                height: fill ? '100%' : undefined,
                minHeight: fill ? 0 : 120,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                textAlign: 'center',
                color: muted,
                fontSize: props.fontSize ?? 'inherit',
                lineHeight: 1.35,
                p: 1,
                boxSizing: 'border-box',
            }}
        >
            {content}
        </Box>
    );

    if (!data) {
        if (props.loading || !props.error) {
            return center(<CircularProgress size={28} />);
        }
        return center(guestWlanErrorText(props.error, t, props.wlan));
    }

    if (data.enabled === false) {
        return center(
            <>
                <IconWifiOff sx={{ fontSize: '2.2em', opacity: 0.7 }} />
                <span>{t(!props.wlan || props.wlan === 'guest' ? 'tr064_guestOff' : 'tr064_wlanOff')}</span>
            </>,
        );
    }

    const showSsid = props.showSsid !== false;
    const showPassword = props.showPassword !== false;
    const open = data.security === 'nopass';
    const code = (
        <QrCodeSvg
            text={wifiQrText(data)}
            label={t('tr064_guestQrLabel', data.ssid || '')}
        />
    );

    const texts =
        layout !== 'qr' && (showSsid || showPassword) ? (
            <Box
                sx={{
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35em',
                    textAlign: layout === 'column' ? 'center' : 'left',
                    fontSize: props.fontSize ?? 'inherit',
                    lineHeight: 1.3,
                    '& .label': { color: muted, fontSize: '0.78em' },
                    '& .value': { fontWeight: 600, overflowWrap: 'anywhere' },
                }}
            >
                {showSsid ? (
                    <div>
                        <div className="label">{t('tr064_guestNetwork')}</div>
                        <div className="value">{data.ssid}</div>
                    </div>
                ) : null}
                {showPassword ? (
                    <div>
                        <div className="label">{t('tr064_guestPassword')}</div>
                        {open ? (
                            <div style={{ color: muted }}>{t('tr064_guestOpen')}</div>
                        ) : (
                            <Box
                                className="value"
                                sx={{
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                    userSelect: 'all',
                                }}
                            >
                                {data.password}
                            </Box>
                        )}
                    </div>
                ) : null}
            </Box>
        ) : null;

    if (!fill) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: layout === 'row' ? 'row' : 'column',
                    alignItems: 'center',
                    gap: 2,
                }}
            >
                <Box sx={{ width: props.qrSize, height: props.qrSize, flex: '0 0 auto' }}>{code}</Box>
                {texts}
            </Box>
        );
    }

    if (layout === 'row') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.9em', height: '100%', minWidth: 0 }}>
                <Box sx={{ height: '100%', aspectRatio: '1', maxWidth: '55%', flex: '0 0 auto' }}>{code}</Box>
                <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{texts}</Box>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '0.6em', height: '100%', minHeight: 0 }}>
            {/* the svg keeps its square in the middle of this box */}
            <Box sx={{ flex: '1 1 auto', minHeight: 0, minWidth: 0 }}>{code}</Box>
            {texts}
        </Box>
    );
}
