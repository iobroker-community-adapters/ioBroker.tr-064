import { alpha, type Theme } from '@mui/material';

import type { VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

// `shared/` is a copy of `src-shared` (`tsx ../tasks.ts --sync`, runs before build and start)
import { meshTranslate } from './shared/i18n';
import type { MeshTranslate } from './shared/MeshView';
import type { MeshSocket } from './shared/meshApi';

export const ADAPTER_NAME = 'tr-064';

/**
 * Color of secondary texts. Not `palette.text.secondary`: the dark theme of ioBroker sets it to white,
 * the same as the primary text, and the tiles would lose their hierarchy.
 *
 * @param theme MUI theme of vis-2
 */
export function muted(theme: Theme): string {
    return alpha(theme.palette.text.primary, 0.64);
}

/**
 * Color of switched off and unknown things, see `muted()`
 *
 * @param theme MUI theme of vis-2
 */
export function faint(theme: Theme): string {
    return alpha(theme.palette.text.primary, 0.38);
}

/** Value of a state, `undefined` while it was not read or if it does not exist */
export type StateValues = Record<string, ioBroker.StateValue | undefined>;

/** The part of the vis-2 socket (`Connection`) which `StateWatcher` uses */
export interface WatchSocket {
    subscribeState(ids: string[], cb: ioBroker.StateChangeHandler): Promise<void>;
    unsubscribeState(ids: string[], cb: ioBroker.StateChangeHandler): void;
}

/**
 * Subscribes a list of states and keeps their values.
 *
 * A state which does not exist never calls back, so its value stays `undefined` - the widgets show
 * only what is present (e.g. `states.wlan50` of a box without 5 GHz, `calllists.missed.count`
 * without call lists).
 */
export class StateWatcher {
    private ids: string[] = [];

    private readonly values: StateValues = {};

    private stopped = false;

    constructor(
        private readonly socket: WatchSocket,
        private readonly onChange: (values: StateValues) => void,
    ) {}

    /**
     * Subscribes exactly these IDs, the ones which are not in the list any more are unsubscribed
     *
     * @param ids full state IDs
     */
    watch(ids: string[]): void {
        const wanted = [...new Set(ids)];
        if (wanted.length === this.ids.length && wanted.every(id => this.ids.includes(id))) {
            return;
        }
        const removed = this.ids.filter(id => !wanted.includes(id));
        const added = wanted.filter(id => !this.ids.includes(id));
        this.ids = wanted;
        this.stopped = false;

        if (removed.length) {
            this.socket.unsubscribeState(removed, this.onState);
            removed.forEach(id => delete this.values[id]);
            this.onChange({ ...this.values });
        }
        if (added.length) {
            this.socket
                .subscribeState(added, this.onState)
                .catch((e: unknown) => console.warn(`Cannot subscribe the tr-064 states: ${String(e)}`));
        }
    }

    /** Unsubscribes everything, `onChange` is not called any more */
    stop(): void {
        this.stopped = true;
        if (this.ids.length) {
            this.socket.unsubscribeState(this.ids, this.onState);
            this.ids = [];
        }
    }

    private onState = (id: string, state: ioBroker.State | null | undefined): void => {
        if (this.stopped || !this.ids.includes(id)) {
            return;
        }
        const value = state && state.val !== null ? state.val : undefined;
        if (id in this.values && this.values[id] === value) {
            return;
        }
        this.values[id] = value;
        this.onChange({ ...this.values });
    };
}

/**
 * Base class of the tr-064 vis-2 widgets.
 *
 * `window.visRxWidget` is provided by the vis-2 runtime and must not be imported as a value:
 * a second copy of the base class would not be recognized by vis-2.
 */
export default class Generic<
    RxData extends Record<string, any>,
    State extends Partial<VisRxWidgetState> = VisRxWidgetState,
> extends (window.visRxWidget as typeof VisRxWidget)<RxData, State> {
    /** Prepended to every i18n key of this widget set, see `translations.ts` */
    static getI18nPrefix(): string {
        return 'tr064_vis_';
    }

    /**
     * `tr-064.<n>` of the attribute `instance`.
     *
     * The attribute holds `tr-064.0`; `0` (a short instance) and `system.adapter.tr-064.0` are
     * accepted too. Anything else is the first instance.
     */
    getInstanceId(): string {
        const raw = (this.state.rxData as { instance?: unknown }).instance;
        const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
        const match = value.match(/^(?:system\.adapter\.)?(?:tr-064\.)?(\d+)$/);
        return `${ADAPTER_NAME}.${match ? match[1] : '0'}`;
    }

    /** The socket of vis-2 has `getState` and `sendTo`, which is everything `fetchMesh()` needs */
    getMeshSocket(): MeshSocket {
        return this.props.context.socket as MeshSocket;
    }

    /** The socket of vis-2 for `StateWatcher` */
    getWatchSocket(): WatchSocket {
        return this.props.context.socket as WatchSocket;
    }

    /**
     * Key in the `localStorage` for the settings of a view of this widget. The widget IDs repeat in
     * every project, so the project is part of it.
     *
     * @param kind what is stored, e.g. `mesh`
     */
    getStorageKey(kind: string): string {
        return `tr064.vis2.${kind}.${this.props.context.projectName || 'main'}.${this.props.id}`;
    }

    /** `light` or `dark`, the theme of the vis-2 project */
    getThemeType(): 'light' | 'dark' {
        return this.props.context.themeType === 'dark' ? 'dark' : 'light';
    }

    /** Translation of the `tr064_*` keys of the mesh view, in the language of vis-2 */
    static meshT(): MeshTranslate {
        return meshTranslate(Generic.getLanguage());
    }
}
