/**
 * Small parts every component uses: the hint instead of the content, the spinner, the texts of the errors of the
 * adapter and the reading of state values.
 */
import type { JSX, ReactNode } from 'react';

import {
    MESH_ERROR_NOT_ALIVE,
    MESH_ERROR_NOT_CONNECTED,
    MESH_ERROR_NOT_SUPPORTED,
    MESH_ERROR_TIMEOUT,
} from '../../src-shared/meshApi';
import { Icon, type IconName } from './icons';
import type { Translate } from './words';

/**
 * A text in the middle of the element instead of its content: a missing setting, an error, no data
 *
 * @param props the text and an optional symbol above it
 * @param props.text the text
 * @param props.icon a symbol above it
 */
export function Hint(props: { text: ReactNode; icon?: IconName }): JSX.Element {
    return (
        <div
            className="hint"
            role="status"
        >
            {props.icon ? <Icon name={props.icon} /> : null}
            <div>{props.text}</div>
        </div>
    );
}

/** The spinner in the middle of the element while the first data is read */
export function Loading(): JSX.Element {
    return (
        <div className="hint">
            <div className="spinner" />
        </div>
    );
}

/**
 * The text of an error of `fetchMesh()`/`renameDevice()` and its severity
 *
 * @param error error code or text
 * @param t the words
 */
export function meshErrorText(error: string, t: Translate): { severity: 'info' | 'warning'; text: string } {
    switch (error) {
        case MESH_ERROR_NOT_ALIVE:
            return { severity: 'info', text: t('tr064_startInstance') };
        case MESH_ERROR_NOT_CONNECTED:
            return { severity: 'warning', text: t('tr064_notConnected') };
        case MESH_ERROR_NOT_SUPPORTED:
            return { severity: 'warning', text: t('tr064_notSupported') };
        case MESH_ERROR_TIMEOUT:
            return { severity: 'warning', text: t('tr064_timeout') };
        default:
            return { severity: 'warning', text: t('tr064_error', error) };
    }
}

/**
 * The value of a state the element subscribed, `undefined` while it has none
 *
 * @param states `this.states` of the element
 * @param id ID of the state
 */
export function valueOf(
    states: Record<string, ioBroker.State | null>,
    id: string | null | undefined,
): ioBroker.StateValue | undefined {
    const val = id ? states[id]?.val : undefined;
    return val === null ? undefined : val;
}

/**
 * A text of an object in the language of the system (`common.name`)
 *
 * @param name a string or `{ en, de, ... }`
 * @param lang the language
 */
export function nameText(name: ioBroker.StringOrTranslated | undefined | null, lang: string): string {
    if (!name) {
        return '';
    }
    if (typeof name === 'string') {
        return name;
    }
    const names = name as Record<string, string | undefined>;
    return names[lang] || names.en || Object.values(names).find(Boolean) || '';
}

/**
 * A whole number of a setting within limits
 *
 * @param value value of the setting
 * @param fallback without a valid value
 * @param min smallest value
 * @param max largest value
 */
export function intSetting(value: unknown, fallback: number, min: number, max: number): number {
    const num = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN;
    return Number.isFinite(num) ? Math.min(max, Math.max(min, Math.round(num))) : fallback;
}

/**
 * A text setting without the spaces around it
 *
 * @param value value of the setting
 */
export function textSetting(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
