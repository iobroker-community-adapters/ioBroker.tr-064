import React from 'react';

import { Dialog, DialogContent, DialogTitle, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Close as IconClose } from '@mui/icons-material';

import MeshView, { type MeshTranslate } from './shared/MeshView';
import { type MeshSocket, useMeshLoader } from './shared/meshApi';

interface MeshDialogProps {
    socket: MeshSocket;
    /** e.g. `tr-064.0` */
    instanceId: string;
    title: string;
    closeText: string;
    t: MeshTranslate;
    themeType: 'light' | 'dark';
    /** localStorage key of the view settings */
    storageKey: string;
    onClose: () => void;
}

/** The mesh view with its own loader - it only exists while the dialog is open */
function MeshContent(
    props: Omit<MeshDialogProps, 'title' | 'closeText' | 'onClose'> & { phone: boolean },
): React.JSX.Element {
    const { data, loading, error, refresh } = useMeshLoader(props.socket, props.instanceId, 30);
    return (
        <MeshView
            data={data}
            loading={loading}
            error={error}
            onRefresh={refresh}
            t={props.t}
            themeType={props.themeType}
            compact={props.phone}
            storageKey={props.storageKey}
        />
    );
}

/**
 * Mesh topology of the FRITZ!Box in a dialog: full screen on a phone (below 600 px), otherwise a
 * large dialog. Render it only while it is open - the topology is read only then.
 *
 * @param props properties
 */
export default function MeshDialog(props: MeshDialogProps): React.JSX.Element {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Dialog
            open
            fullScreen={phone}
            fullWidth
            maxWidth="lg"
            onClose={props.onClose}
            // React events bubble through the portal: without this, a click in the dialog (also the
            // close button and the backdrop) would reach the tile and open the dialog again
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            slotProps={{ paper: { sx: phone ? undefined : { borderRadius: '16px' } } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1, py: phone ? 1 : 1.5 }}>
                <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {props.title}
                </span>
                <IconButton
                    aria-label={props.closeText}
                    title={props.closeText}
                    onClick={props.onClose}
                >
                    <IconClose />
                </IconButton>
            </DialogTitle>
            <DialogContent
                dividers
                sx={{ px: phone ? 1 : 2, py: phone ? 1 : 2 }}
            >
                <MeshContent
                    socket={props.socket}
                    instanceId={props.instanceId}
                    t={props.t}
                    themeType={props.themeType}
                    storageKey={props.storageKey}
                    phone={phone}
                />
            </DialogContent>
        </Dialog>
    );
}
