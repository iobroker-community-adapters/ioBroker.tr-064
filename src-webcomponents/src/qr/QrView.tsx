/**
 * QR code of a WLAN with network name and password, the PIN pad and the content of the dialog - the parts of
 * `src-shared/GuestWlanView.tsx` and `src-widgets/src/PinPad.tsx` without MUI.
 *
 * The code is always black on white: many phone cameras do not read an inverted code.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { qrPath, useGuestWlanLoader, wifiQrText } from '../../../src-shared/guestWlanApi';
import {
    MESH_ERROR_NOT_ALIVE,
    MESH_ERROR_NOT_CONNECTED,
    MESH_ERROR_NOT_SUPPORTED,
    MESH_ERROR_TIMEOUT,
    type MeshSocket,
} from '../../../src-shared/meshApi';
import type { GuestWlanResponse, WlanQrKind } from '../../../src-shared/types';
import { Icon } from '../icons';
import type { Translate } from '../words';

/** Light modules around the code (the white card adds its own margin) */
const QUIET_ZONE = 2;

/** Milliseconds in which the keys are locked after a wrong PIN, doubled with every further mistake */
const WRONG_DELAY = 800;
const MAX_WRONG_DELAY = 30_000;

export const QR_CSS = `
.qr-svg { display: block; width: 100%; height: 100%; }
.qr-state {
    height: 100%;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    text-align: center;
    line-height: 1.35;
}
.qr-state > .icon { font-size: 2.2em; opacity: 0.7; }
.qr-texts { min-width: 0; display: flex; flex-direction: column; gap: 0.35em; line-height: 1.3; }
.qr-texts .label { font-size: 0.78em; }
.qr-texts .value { font-weight: 600; overflow-wrap: anywhere; }
.qr-texts .password { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; user-select: all; }

.qr-dialog { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 8px 4px 16px; font-size: 16px; }
.qr-dialog .qr-box { width: min(68vw, 300px); height: min(68vw, 300px); }
.qr-dialog .qr-texts { text-align: center; }
.qr-dialog .scan { font-size: 13px; text-align: center; }

.pin { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; max-width: 280px; margin: 0 auto; padding-bottom: 8px; }
.pin-title { font-weight: 600; text-align: center; }
.pin-dots { display: flex; gap: 10px; justify-content: center; min-height: 16px; }
.pin-dots.wrong { animation: tr064-shake 0.4s; }
.pin-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; }
.pin-dot.filled { background: currentColor; }
.pin-dots.wrong .pin-dot { border-color: var(--iob-error); }
.pin-dots.wrong .pin-dot.filled { background: var(--iob-error); }
.pin-wrong { min-height: 1.3em; font-size: 13px; color: var(--iob-error); }
.pin-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: 100%; }
.pin-keys button {
    min-width: 0;
    width: 100%;
    aspect-ratio: 1.35;
    border: 0;
    border-radius: 16px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
}
.pin-keys button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 14%, transparent); }
.pin-keys button.small { font-size: 0.85rem; background: none; }
.pin-keys button:disabled { opacity: 0.5; cursor: default; }
@keyframes tr064-shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-8px); }
    40%, 80% { transform: translateX(8px); }
}
`;

/**
 * The text of an error of `fetchGuestWlan()`
 *
 * @param error error code or text
 * @param t the words
 * @param wlan the WLAN of the code - the texts of the guest WLAN name it
 */
export function guestWlanErrorText(error: string, t: Translate, wlan: WlanQrKind): string {
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

/** The QR code as SVG: it fills its box and stays square in the middle of it */
export function QrCodeSvg(props: { text: string; label: string }): JSX.Element {
    const qr = useMemo(() => qrPath(props.text), [props.text]);
    const total = qr.size + 2 * QUIET_ZONE;
    return (
        <svg
            className="qr-svg"
            viewBox={`0 0 ${total} ${total}`}
            role="img"
            aria-label={props.label}
            shapeRendering="crispEdges"
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

export interface QrContentProps {
    data: GuestWlanResponse | null;
    loading: boolean;
    error: string | null;
    t: Translate;
    wlan: WlanQrKind;
    showSsid: boolean;
    showPassword: boolean;
}

/** Network name and password next to or below the code */
export function QrTexts(props: QrContentProps & { data: GuestWlanResponse }): JSX.Element | null {
    const { data, t } = props;
    if (!props.showSsid && !props.showPassword) {
        return null;
    }
    return (
        <div className="qr-texts">
            {props.showSsid ? (
                <div>
                    <div className="label muted">{t('tr064_guestNetwork')}</div>
                    <div className="value">{data.ssid}</div>
                </div>
            ) : null}
            {props.showPassword ? (
                <div>
                    <div className="label muted">{t('tr064_guestPassword')}</div>
                    {data.security === 'nopass' ? (
                        <div className="muted">{t('tr064_guestOpen')}</div>
                    ) : (
                        <div className="value password">{data.password}</div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Instead of the code: the spinner, the error or that the WLAN is off. `null` when there is a code to show
 *
 * @param props the state of the loader
 */
export function QrState(props: QrContentProps): JSX.Element | null {
    const { data, t } = props;
    if (!data) {
        return (
            <div className="qr-state muted">
                {props.loading || !props.error ? (
                    <div className="spinner" />
                ) : (
                    guestWlanErrorText(props.error, t, props.wlan)
                )}
            </div>
        );
    }
    if (data.enabled === false) {
        return (
            <div className="qr-state muted">
                <Icon name="WifiOff" />
                <span>{t(props.wlan === 'guest' ? 'tr064_guestOff' : 'tr064_wlanOff')}</span>
            </div>
        );
    }
    return null;
}

/**
 * Keypad for a PIN. The PIN is compared as soon as as many characters as it has are entered; the keyboard works too.
 * A wrong PIN locks the keys for a moment, every further mistake twice as long - the PIN only keeps guests away from
 * the code, it is part of the settings of the page.
 */
function PinPad(props: { pin: string; t: Translate; onSuccess: () => void }): JSX.Element {
    const { pin, onSuccess, t } = props;
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
        // capture: a dialog of the host may stop the propagation of its key events
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [add, remove, locked]);

    return (
        <div className="pin">
            <div className="pin-title">{t('tr064_guestPinTitle')}</div>
            <div
                className={`pin-dots${wrong ? ' wrong' : ''}`}
                aria-live="polite"
            >
                {Array.from({ length: pin.length }, (_, i) => (
                    <span
                        key={i}
                        className={`pin-dot${i < entered.length ? ' filled' : ''}`}
                    />
                ))}
            </div>
            <div className="pin-wrong">{wrong ? t('tr064_guestPinWrong') : ''}</div>
            <div className="pin-keys">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key => (
                    <button
                        key={key}
                        type="button"
                        disabled={locked}
                        onClick={() => add(key)}
                    >
                        {key}
                    </button>
                ))}
                <button
                    type="button"
                    className="small"
                    disabled={locked || !entered}
                    onClick={() => setEntered('')}
                >
                    {t('tr064_guestPinClear')}
                </button>
                <button
                    type="button"
                    disabled={locked}
                    onClick={() => add('0')}
                >
                    0
                </button>
                <button
                    type="button"
                    className="small"
                    title={t('tr064_guestPinDelete')}
                    aria-label={t('tr064_guestPinDelete')}
                    disabled={locked || !entered}
                    onClick={remove}
                >
                    <Icon name="BackspaceOutlined" />
                </button>
            </div>
        </div>
    );
}

/** The code with its own loader: the password is read only while the dialog shows it */
function QrDialogCode(
    props: Omit<QrContentProps, 'data' | 'loading' | 'error'> & { socket: MeshSocket; instanceId: string },
): JSX.Element {
    const state = useGuestWlanLoader(props.socket, props.instanceId, props.wlan);
    const content = { ...props, ...state };
    const placeholder = QrState(content);
    if (placeholder || !state.data) {
        return <div className="qr-dialog">{placeholder}</div>;
    }
    return (
        <div className="qr-dialog">
            <div className="qr-box">
                <QrCodeSvg
                    text={wifiQrText(state.data)}
                    label={props.t('tr064_guestQrLabel', state.data.ssid || '')}
                />
            </div>
            <QrTexts
                {...content}
                data={state.data}
            />
            <div className="scan muted">{props.t(props.wlan === 'guest' ? 'tr064_guestScan' : 'tr064_wlanScan')}</div>
        </div>
    );
}

export interface QrDialogProps {
    socket: MeshSocket;
    instanceId: string;
    wlan: WlanQrKind;
    /** Asked before the code is shown; empty = no PIN */
    pin: string;
    showSsid: boolean;
    showPassword: boolean;
    /** Seconds after which the dialog closes by itself, 0 = never */
    autoClose: number;
    t: Translate;
    close: () => void;
}

/**
 * The content of the dialog: the PIN pad if there is a PIN, then the code. It closes itself after `autoClose`
 * seconds - the code must not stay on a wall tablet
 *
 * @param props properties
 */
export function QrDialog(props: QrDialogProps): JSX.Element {
    const [unlocked, setUnlocked] = useState(!props.pin);
    const { autoClose, close } = props;
    useEffect(() => {
        if (!unlocked || !autoClose || autoClose <= 0) {
            return undefined;
        }
        const timer = setTimeout(close, autoClose * 1000);
        return () => clearTimeout(timer);
    }, [unlocked, autoClose, close]);
    const onSuccess = useCallback(() => setUnlocked(true), []);

    if (!unlocked) {
        return (
            <PinPad
                pin={props.pin}
                t={props.t}
                onSuccess={onSuccess}
            />
        );
    }
    return (
        <QrDialogCode
            socket={props.socket}
            instanceId={props.instanceId}
            wlan={props.wlan}
            showSsid={props.showSsid}
            showPassword={props.showPassword}
            t={props.t}
        />
    );
}
