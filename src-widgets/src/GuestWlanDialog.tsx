import React, { useEffect, useState } from 'react';

import { Box, Dialog, DialogContent, DialogTitle, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Close as IconClose, QrCode2 as IconQr } from '@mui/icons-material';

import PinPad from './PinPad';
import GuestWlanView from './shared/GuestWlanView';
import { useGuestWlanLoader } from './shared/guestWlanApi';
import type { MeshSocket } from './shared/meshApi';
import type { MeshTranslate } from './shared/MeshView';

interface GuestWlanDialogProps {
    socket: MeshSocket;
    /** e.g. `tr-064.0` */
    instanceId: string;
    title: string;
    /** Asked before the code is shown; empty = no PIN */
    pin: string;
    showSsid: boolean;
    showPassword: boolean;
    /** Seconds after which the dialog closes by itself, 0 = never */
    autoClose: number;
    t: MeshTranslate;
    onClose: () => void;
}

/** The code with its own loader - it exists only while it is shown, the password is read only then */
function GuestWlanContent(
    props: Omit<GuestWlanDialogProps, 'title' | 'pin' | 'autoClose' | 'onClose'>,
): React.JSX.Element {
    const { data, loading, error } = useGuestWlanLoader(props.socket, props.instanceId);
    const showHint = !!data && !data.error && data.enabled !== false;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <GuestWlanView
                data={data}
                loading={loading}
                error={error}
                t={props.t}
                showSsid={props.showSsid}
                showPassword={props.showPassword}
                qrSize="min(68vw, 300px)"
                fontSize={16}
            />
            {showHint ? (
                <Box sx={theme => ({ fontSize: 13, textAlign: 'center', color: theme.palette.text.secondary })}>
                    {props.t('tr064_guestScan')}
                </Box>
            ) : null}
        </Box>
    );
}

/**
 * QR code of the guest WLAN in a dialog, after the PIN if one is given. Render it only while it is
 * open - the access data is read only then and forgotten when it closes.
 *
 * @param props properties
 */
export default function GuestWlanDialog(props: GuestWlanDialogProps): React.JSX.Element {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const [unlocked, setUnlocked] = useState(!props.pin);
    const { autoClose, onClose } = props;

    // the code must not stay on a wall tablet: close after `autoClose` seconds
    useEffect(() => {
        if (!unlocked || !autoClose || autoClose <= 0) {
            return undefined;
        }
        const timer = setTimeout(onClose, autoClose * 1000);
        return () => clearTimeout(timer);
    }, [unlocked, autoClose, onClose]);

    return (
        <Dialog
            open
            fullScreen={phone}
            fullWidth
            maxWidth="xs"
            onClose={props.onClose}
            // React events bubble through the portal: without this, a click in the dialog (also the
            // close button and the backdrop) would reach the tile and open the dialog again
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            slotProps={{ paper: { sx: phone ? undefined : { borderRadius: '16px' } } }}
        >
            <DialogTitle
                component="div"
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1, py: 1.5 }}
            >
                <IconQr sx={{ color: theme.palette.primary.main, flexShrink: 0 }} />
                <Box
                    component="h2"
                    sx={{
                        m: 0,
                        flexGrow: 1,
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {unlocked ? props.title : props.t('tr064_guestPinTitle')}
                </Box>
                <IconButton
                    aria-label={props.t('tr064_close')}
                    title={props.t('tr064_close')}
                    onClick={props.onClose}
                >
                    <IconClose />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pb: 3, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {unlocked ? (
                    <GuestWlanContent
                        socket={props.socket}
                        instanceId={props.instanceId}
                        showSsid={props.showSsid}
                        showPassword={props.showPassword}
                        t={props.t}
                    />
                ) : (
                    <PinPad
                        pin={props.pin}
                        t={props.t}
                        onSuccess={() => setUnlocked(true)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
