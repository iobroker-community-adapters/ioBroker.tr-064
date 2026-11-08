/**
 * The base of the tr-064 web components: a React root in the shadow root, the styles and the words.
 *
 * The element fills the box of the host and lays itself out with container queries (`.mount` is the container);
 * it measures nothing. It is transparent and inherits `color` and `font` of the host; the theme of the host comes
 * as the CSS variables `--iob-*` of the base class.
 *
 * React is the one of the host page (`lib/esm/react-19.js`, see `vite.config.ts`).
 */
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { DIALOG_CLOSE_EVENT, type WebComponentSettings } from '@iobroker/web-components';
import { getThemeCssVariables, IobWebComponent } from '@iobroker/web-components/element';

import { BASE_CSS } from './styles';
import { translator, type Translate } from './words';

/** What an element dialog shows: drawn into a root of its own, again whenever the element draws */
export interface DialogContent {
    /** The content; `close(result)` closes the dialog */
    draw: (close: (result?: unknown) => void) => ReactNode;
    /** Styles of the content, besides the base styles */
    css?: string;
}

export abstract class Tr064Element<TSettings extends WebComponentSettings> extends IobWebComponent<TSettings> {
    readonly #mount: HTMLDivElement;

    #root: Root | null = null;

    /** The drawings of the open dialogs, run with every drawing of the element */
    readonly #dialogDrawings = new Set<() => void>();

    #drawRequested = false;

    protected constructor(css: string) {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `${BASE_CSS}\n${css}`;
        this.#mount = document.createElement('div');
        this.#mount.className = 'mount';
        shadow.append(style, this.#mount);
    }

    /** The words of the element in the language of the system */
    protected get t(): Translate {
        return translator(this.systemLang);
    }

    /** What the element shows - called with every drawing */
    protected abstract draw(): ReactNode;

    /** Called by the base class after every change; the element itself calls `requestDraw()` */
    protected render(): void {
        if (!this.isConnected) {
            return;
        }
        this.#mount.className = `mount ${this.theme.type}${this.editMode ? ' edit' : ''}`;
        this.#root ||= createRoot(this.#mount);
        this.#root.render(this.draw());
        this.#dialogDrawings.forEach(draw => draw());
    }

    /**
     * Draw again soon - after something the element reads itself (a loader, a clock) changed. Several requests in
     * one task draw once
     */
    protected requestDraw(): void {
        if (this.#drawRequested) {
            return;
        }
        this.#drawRequested = true;
        queueMicrotask(() => {
            this.#drawRequested = false;
            this.render();
        });
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        // a host that only moves the element connects it again in the same task: keep React then
        queueMicrotask(() => {
            if (!this.isConnected && this.#root) {
                this.#root.unmount();
                this.#root = null;
            }
        });
    }

    /**
     * Ask the base class again for the states and objects to subscribe - after something the element read itself
     * (the devices of an instance) changed what `getStateIds` returns
     */
    protected resubscribe(): void {
        // the setter of the base class subscribes what the settings name now and draws
        this.settings = { ...this.settings };
    }

    /**
     * Show React content in a dialog of the host (or of the browser). The content brings its own styles in a
     * shadow root and the theme as CSS variables: the host moves it out of this element
     *
     * @param title title of the dialog
     * @param width the width wanted, in px
     * @param content what to draw
     * @returns the result of `close(result)`, null if the user closed the dialog
     */
    protected async showElementDialog(title: string, width: number, content: DialogContent): Promise<unknown> {
        const element = document.createElement('div');
        for (const [name, value] of Object.entries(getThemeCssVariables(this.theme))) {
            element.style.setProperty(name, value);
        }
        const shadow = element.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `${BASE_CSS}\n${content.css || ''}`;
        const mount = document.createElement('div');
        mount.className = `dialog-content ${this.theme.type}`;
        shadow.append(style, mount);
        const root = createRoot(mount);
        const close = (result?: unknown): void => {
            mount.dispatchEvent(
                new CustomEvent(DIALOG_CLOSE_EVENT, { detail: result ?? null, bubbles: true, composed: true }),
            );
        };
        const draw = (): void => root.render(content.draw(close));
        this.#dialogDrawings.add(draw);
        draw();
        try {
            return await this.openDialog({ title, element, width });
        } finally {
            this.#dialogDrawings.delete(draw);
            root.unmount();
        }
    }
}
