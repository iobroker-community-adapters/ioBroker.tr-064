/**
 * `<iob-tr064-guest-wlan>`: the QR code of a WLAN of the FRITZ!Box - the guest WLAN or one band of the own WLAN -
 * like the devices widget `GuestWlanComponent` and the vis-2 widget `Tr064GuestWlan`.
 *
 * Mode `tile` shows the code on the element, read again every 10 minutes and when the WLAN, its password or the
 * connection change. Modes `dialog` and `pin` show a button; the code is read only while the dialog shows it, after
 * the PIN in mode `pin`, and the dialog closes after `autoClose` seconds.
 */
import type { JSX, KeyboardEvent, ReactNode } from 'react';

import type { WebComponentSettings } from '@iobroker/web-components';
import { defineWebComponent } from '@iobroker/web-components/element';

import {
    GuestWlanLoader,
    GUEST_WLAN_REFRESH_INTERVAL,
    wifiQrText,
    WLAN_QR_STATES,
    wlanQrKind,
    type GuestWlanState,
} from '../../src-shared/guestWlanApi';
import type { WlanQrKind } from '../../src-shared/types';
import { toBool } from '../../src-widgets/src/format';
import { Tr064Element } from './base';
import { COMPONENTS, instanceIdOf } from './constants';
import { Icon } from './icons';
import { QR_CSS, QrCodeSvg, QrDialog, QrState, QrTexts } from './qr/QrView';
import { Hint, intSetting, textSetting, valueOf } from './ui';

interface GuestWlanSettings extends WebComponentSettings {
    instance?: string;
    wlan?: string;
    mode?: string;
    pin?: string;
    autoClose?: number;
    title?: string;
    showSsid?: boolean;
    showPassword?: boolean;
}

type ShowMode = 'tile' | 'dialog' | 'pin';

/** A new password is written a moment before the box uses it */
const PASSWORD_DELAY = 3000;

/** The names of the WLANs, named here so that the build puts them into the module (see `wlanTitleKey()`) */
const WLAN_TITLES: Record<WlanQrKind, string> = {
    guest: 'tr064_guestWlan',
    wlan24: 'tr064_wlan24',
    wlan50: 'tr064_wlan50',
    wlan52: 'tr064_wlan52',
    wlan60: 'tr064_wlan60',
};

const CSS = `
${QR_CSS}
.gw {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: clamp(4px, 3cqmin, 12px);
    border-radius: calc(2 * var(--iob-border-radius, 4px));
    outline: none;
}
.gw:focus-visible { box-shadow: inset 0 0 0 2px var(--iob-primary); }
.gw-title { flex: 0 0 auto; font-weight: 600; line-height: 1.3; }

/* mode tile: the code, the texts below it - or next to it in a wide element, or only the code in a small one */
.code .gw-title { display: none; font-size: 15px; }
.code-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 0.6em; font-size: clamp(12px, 6.5cqi, 15px); }
.code-body .qr-box { flex: 1 1 auto; min-height: 0; min-width: 0; }
.code-body .qr-texts { text-align: center; }
.code-body .qr-state { min-height: 0; }
@container (max-width: 149.98px), (max-height: 189.98px) {
    .code-body .qr-texts { display: none; }
}
@container (min-width: 150px) and (min-height: 220px) {
    .code .gw-title { display: block; }
}
@container (min-width: 240px) and (min-aspect-ratio: 3 / 2) {
    .code .gw-title { display: none; }
    .code-body { flex-direction: row; align-items: center; gap: 0.9em; font-size: clamp(12px, 6cqh, 16px); }
    .code-body .qr-box { flex: 0 0 auto; height: 100%; aspect-ratio: 1; max-width: 55%; }
    .code-body .qr-texts { display: flex; flex: 1 1 auto; text-align: left; }
}
@container (min-width: 240px) and (min-aspect-ratio: 3 / 2) and (min-height: 120px) {
    .code .gw-title { display: block; }
}

/* modes dialog and pin: a button */
.button { gap: 4px; }
.qr-icon {
    position: relative;
    flex: 0 0 auto;
    width: clamp(36px, 26cqi, 56px);
    aspect-ratio: 1;
    border-radius: 28%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--iob-primary) 12%, transparent);
    color: var(--iob-primary);
}
.dark .qr-icon {
    background: color-mix(in srgb, var(--iob-primary) 20%, transparent);
    color: color-mix(in srgb, var(--iob-primary) 70%, white);
}
.qr-icon.off { opacity: 0.55; }
.qr-icon > .icon { width: 64%; height: 64%; }
.qr-icon .lock {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 42%;
    height: 42%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--iob-paper);
    color: color-mix(in srgb, var(--iob-text) 64%, transparent);
}
.qr-icon .lock .icon { width: 70%; height: 70%; }
.button .spacer { flex: 1 1 auto; min-height: 6px; }
.button .gw-title { font-size: 16px; }
.button-texts { min-width: 0; }
.button .state { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; }
.button .state .dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: color-mix(in srgb, currentColor 38%, transparent); }
.button .state .dot.on { background: var(--iob-success); }
.button .tap { display: none; font-size: 12px; line-height: 1.3; }
@container (min-height: 150px) {
    .button .tap { display: block; }
}
@container (max-width: 119.98px), (max-height: 79.98px) {
    .button { align-items: center; justify-content: center; }
    .button .spacer, .button .button-texts { display: none; }
}
@container (max-height: 109.98px) and (min-width: 180px) {
    .button { flex-direction: row; align-items: center; justify-content: flex-start; gap: 12px; }
    .button .qr-icon { width: clamp(34px, 45cqh, 48px); }
    .button .spacer, .button .tap { display: none; }
    .button .button-texts { display: block; flex: 1 1 auto; }
    .button .gw-title { font-size: 15px; }
}
`;

class Tr064GuestWlan extends Tr064Element<GuestWlanSettings> {
    /** Mode `tile`: reads the code; what it reads, and for which settings */
    #loader: GuestWlanLoader | null = null;

    #loaderKey = '';

    #guest: GuestWlanState = { data: null, loading: false, error: null };

    /** The values of the last drawing, to see what changed */
    #seen: Record<string, ioBroker.StateValue | undefined> = {};

    #passwordTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        super(CSS);
    }

    protected override getStateIds(settings: GuestWlanSettings): string[] {
        const instanceId = instanceIdOf(settings.instance);
        if (!instanceId) {
            return [];
        }
        const names = WLAN_QR_STATES[wlanQrKind(settings.wlan)];
        return [
            `system.adapter.${instanceId}.alive`,
            `${instanceId}.info.connection`,
            `${instanceId}.${names.on}`,
            `${instanceId}.${names.password}`,
        ];
    }

    override disconnectedCallback(): void {
        this.#stopLoader();
        super.disconnectedCallback();
    }

    get #wlan(): WlanQrKind {
        return wlanQrKind(this.settings.wlan);
    }

    get #mode(): ShowMode {
        const mode = this.settings.mode;
        if (mode === 'tile') {
            return 'tile';
        }
        // without a PIN there is nothing to ask
        return mode === 'pin' && this.#pin ? 'pin' : 'dialog';
    }

    get #pin(): string {
        return textSetting(this.settings.pin);
    }

    get #title(): string {
        return textSetting(this.settings.title) || this.t(WLAN_TITLES[this.#wlan]);
    }

    #stopLoader(): void {
        if (this.#passwordTimer) {
            clearTimeout(this.#passwordTimer);
            this.#passwordTimer = null;
        }
        this.#loader?.stop();
        this.#loader = null;
        this.#loaderKey = '';
    }

    /** Mode `tile`: starts the loader for the current settings, reads again when the WLAN changed */
    #updateLoader(instanceId: string): void {
        const socket = this.socket;
        if (this.#mode !== 'tile' || !socket) {
            this.#stopLoader();
            this.#guest = { data: null, loading: false, error: null };
            return;
        }
        const key = `${instanceId}|${this.#wlan}|${this.editMode}`;
        if (key !== this.#loaderKey || !this.#loader) {
            this.#stopLoader();
            this.#loaderKey = key;
            this.#guest = { data: null, loading: true, error: null };
            this.#loader = new GuestWlanLoader({
                socket,
                instanceId,
                wlan: this.#wlan,
                // the editor reads once
                interval: this.editMode ? 0 : GUEST_WLAN_REFRESH_INTERVAL,
                onChange: guest => {
                    this.#guest = guest;
                    this.requestDraw();
                },
            });
            this.#loader.start();
            this.#seen = {};
        }
        const names = WLAN_QR_STATES[this.#wlan];
        const ids = {
            on: `${instanceId}.${names.on}`,
            password: `${instanceId}.${names.password}`,
            connection: `${instanceId}.info.connection`,
        };
        const changed = (id: string): boolean => id in this.#seen && this.#seen[id] !== valueOf(this.states, id);
        if (changed(ids.password)) {
            if (this.#passwordTimer) {
                clearTimeout(this.#passwordTimer);
            }
            this.#passwordTimer = setTimeout(() => {
                this.#passwordTimer = null;
                void this.#loader?.refresh();
            }, PASSWORD_DELAY);
        } else if (changed(ids.on) || changed(ids.connection)) {
            void this.#loader.refresh();
        }
        for (const id of Object.values(ids)) {
            if (this.states[id] !== undefined) {
                this.#seen[id] = valueOf(this.states, id);
            }
        }
    }

    readonly #openDialog = (): void => {
        const instanceId = instanceIdOf(this.settings.instance);
        const socket = this.socket;
        if (this.editMode || this.#mode === 'tile' || !instanceId || !socket) {
            return;
        }
        const pin = this.#mode === 'pin' ? this.#pin : '';
        const wlan = this.#wlan;
        const showSsid = this.settings.showSsid !== false;
        const showPassword = this.settings.showPassword !== false;
        const autoClose = intSetting(this.settings.autoClose, 60, 0, 3600);
        void this.showElementDialog(this.#title, 380, {
            css: QR_CSS,
            draw: close => (
                <QrDialog
                    socket={socket}
                    instanceId={instanceId}
                    wlan={wlan}
                    pin={pin}
                    showSsid={showSsid}
                    showPassword={showPassword}
                    autoClose={autoClose}
                    t={this.t}
                    close={close}
                />
            ),
        });
    };

    readonly #onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.#openDialog();
        }
    };

    #drawCode(): JSX.Element {
        const props = {
            ...this.#guest,
            t: this.t,
            wlan: this.#wlan,
            showSsid: this.settings.showSsid !== false,
            showPassword: this.settings.showPassword !== false,
        };
        const placeholder = QrState(props);
        const data = props.data;
        return (
            <div className="gw code">
                <div className="gw-title ellipsis">{this.#title}</div>
                <div className="code-body">
                    {placeholder || !data ? (
                        placeholder
                    ) : (
                        <>
                            <div className="qr-box">
                                <QrCodeSvg
                                    text={wifiQrText(data)}
                                    label={this.t('tr064_guestQrLabel', data.ssid || '')}
                                />
                            </div>
                            <QrTexts
                                {...props}
                                data={data}
                            />
                        </>
                    )}
                </div>
            </div>
        );
    }

    #drawButton(instanceId: string): JSX.Element {
        const t = this.t;
        const on = toBool(valueOf(this.states, `${instanceId}.${WLAN_QR_STATES[this.#wlan].on}`));
        const alive = toBool(valueOf(this.states, `system.adapter.${instanceId}.alive`));
        const status = on === undefined || alive === false ? '' : on ? t('tr064_guestOn') : t('tr064_guestOffShort');
        const clickable = !this.editMode;
        return (
            <div
                className={`gw button${clickable ? ' clickable' : ''}`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `${this.#title} – QR` : undefined}
                onClick={clickable ? this.#openDialog : undefined}
                onKeyDown={clickable ? this.#onKeyDown : undefined}
            >
                <span className={`qr-icon${on === false ? ' off' : ''}`}>
                    <Icon name="QrCode2" />
                    {this.#mode === 'pin' ? (
                        <span className="lock">
                            <Icon name="Lock" />
                        </span>
                    ) : null}
                </span>
                <div className="spacer" />
                <div className="button-texts">
                    <div className="gw-title ellipsis">{this.#title}</div>
                    {status ? (
                        <div className="state muted">
                            <span className={`dot${on ? ' on' : ''}`} />
                            <span className="ellipsis">{status}</span>
                        </div>
                    ) : null}
                    <div className="tap faint ellipsis">{t('tr064_guestTapToShow')}</div>
                </div>
            </div>
        );
    }

    protected draw(): ReactNode {
        const instanceId = instanceIdOf(this.settings.instance);
        if (!instanceId) {
            this.#stopLoader();
            return (
                <Hint
                    icon="QrCode2"
                    text={this.t('wc_chooseInstance')}
                />
            );
        }
        this.#updateLoader(instanceId);
        return this.#mode === 'tile' ? this.#drawCode() : this.#drawButton(instanceId);
    }
}

defineWebComponent(COMPONENTS['guest-wlan'].tag, Tr064GuestWlan);
