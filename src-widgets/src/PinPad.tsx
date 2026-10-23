import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Box, Button, IconButton } from '@mui/material';
import { BackspaceOutlined as IconBackspace } from '@mui/icons-material';

import type { MeshTranslate } from './shared/MeshView';

/** Milliseconds in which the keys are locked after a wrong PIN, doubled with every further mistake */
const WRONG_DELAY = 800;
const MAX_WRONG_DELAY = 30_000;

interface PinPadProps {
    /** The PIN which unlocks */
    pin: string;
    t: MeshTranslate;
    onSuccess: () => void;
}

/**
 * Keypad for a PIN, without a dialog of its own.
 *
 * The PIN is compared as soon as as many characters as it has are entered. The keyboard works too
 * (digits, other characters of the PIN, Backspace, Delete clears). A wrong PIN locks the keys for a
 * moment, every further mistake twice as long - the PIN is part of the vis-2 project and only keeps
 * guests away from the code, it is no protection against somebody who can open the project.
 *
 * @param props properties
 */
export default function PinPad(props: PinPadProps): React.JSX.Element {
    const [entered, setEntered] = useState('');
    const [wrong, setWrong] = useState(false);
    const [locked, setLocked] = useState(false);
    const mistakes = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
        },
        [],
    );

    const { pin, onSuccess } = props;

    const add = useCallback(
        (char: string): void => {
            if (locked) {
                return;
            }
            setWrong(false);
            const next = `${entered}${char}`.slice(0, pin.length);
            setEntered(next);
            if (next.length < pin.length) {
                return;
            }
            if (next === pin) {
                mistakes.current = 0;
                onSuccess();
                return;
            }
            mistakes.current++;
            setWrong(true);
            setLocked(true);
            timer.current = setTimeout(
                () => {
                    timer.current = null;
                    setEntered('');
                    setLocked(false);
                },
                Math.min(MAX_WRONG_DELAY, WRONG_DELAY * 2 ** (mistakes.current - 1)),
            );
        },
        [entered, locked, pin, onSuccess],
    );

    const remove = useCallback((): void => {
        if (!locked) {
            setWrong(false);
            setEntered(value => value.slice(0, -1));
        }
    }, [locked]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Backspace') {
                e.preventDefault();
                remove();
            } else if (e.key === 'Delete') {
                e.preventDefault();
                if (!locked) {
                    setEntered('');
                }
            } else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // not the space: it presses the focused key of the keypad
                e.preventDefault();
                add(e.key);
            }
        };
        // capture: the dialog stops the propagation of its key events, they would not reach `window`
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [add, remove, locked]);

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const keySx = {
        minWidth: 0,
        width: '100%',
        aspectRatio: '1.35',
        borderRadius: '16px',
        fontSize: '1.4rem',
        fontWeight: 500,
    };

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                width: '100%',
                maxWidth: 280,
                mx: 'auto',
            }}
        >
            <Box
                aria-live="polite"
                sx={{
                    display: 'flex',
                    gap: 1.25,
                    justifyContent: 'center',
                    minHeight: 16,
                    '@keyframes tr064PinShake': {
                        '0%, 100%': { transform: 'translateX(0)' },
                        '20%, 60%': { transform: 'translateX(-8px)' },
                        '40%, 80%': { transform: 'translateX(8px)' },
                    },
                    animation: wrong ? 'tr064PinShake 0.4s' : undefined,
                }}
            >
                {Array.from({ length: pin.length }, (_, i) => (
                    <Box
                        key={i}
                        sx={theme => ({
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            border: `2px solid ${wrong ? theme.palette.error.main : theme.palette.text.primary}`,
                            backgroundColor:
                                i < entered.length
                                    ? wrong
                                        ? theme.palette.error.main
                                        : theme.palette.text.primary
                                    : 'transparent',
                            transition: 'background-color 0.1s',
                        })}
                    />
                ))}
            </Box>
            <Box
                sx={theme => ({
                    minHeight: 20,
                    fontSize: 14,
                    color: theme.palette.error.main,
                    visibility: wrong ? 'visible' : 'hidden',
                })}
            >
                {props.t('tr064_guestPinWrong')}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25, width: '100%' }}>
                {keys.map(key => (
                    <Button
                        key={key}
                        variant="outlined"
                        color="inherit"
                        disabled={locked}
                        onClick={() => add(key)}
                        sx={keySx}
                    >
                        {key}
                    </Button>
                ))}
                <Button
                    variant="text"
                    color="inherit"
                    disabled={locked || !entered}
                    onClick={() => setEntered('')}
                    sx={{ ...keySx, fontSize: '0.85rem' }}
                >
                    {props.t('tr064_guestPinClear')}
                </Button>
                <Button
                    variant="outlined"
                    color="inherit"
                    disabled={locked}
                    onClick={() => add('0')}
                    sx={keySx}
                >
                    0
                </Button>
                <IconButton
                    disabled={locked || !entered}
                    onClick={remove}
                    aria-label={props.t('tr064_guestPinDelete')}
                    title={props.t('tr064_guestPinDelete')}
                    sx={{ ...keySx, fontSize: '1.6rem' }}
                >
                    <IconBackspace fontSize="inherit" />
                </IconButton>
            </Box>
        </Box>
    );
}
