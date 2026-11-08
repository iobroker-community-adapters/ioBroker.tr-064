/**
 * `<iob-tr064-mesh>`: the mesh topology of the FRITZ!Box - mesh master, repeaters and the devices connected to
 * them - as graph or table, like the vis-2 widget `Tr064Mesh`. A device can be renamed in the box.
 */
import type { ReactNode } from 'react';

import type { WebComponentSettings } from '@iobroker/web-components';
import { defineWebComponent } from '@iobroker/web-components/element';

import type { MeshNodeInfo } from '../../src-shared/types';
import { Tr064Element } from './base';
import { COMPONENTS, instanceIdOf } from './constants';
import { MESH_CSS } from './mesh/meshCss';
import { MeshPanel, type MeshViewOptions } from './mesh/MeshPanel';
import { Hint, intSetting, textSetting } from './ui';

interface MeshSettings extends WebComponentSettings {
    instance?: string;
    title?: string;
    interval?: number;
    view?: string;
    onlyConfigured?: boolean;
    showDisconnected?: boolean;
    showVendor?: boolean;
}

const CSS = `
${MESH_CSS}
.mount { padding: clamp(4px, 2cqmin, 10px); }
`;

class Tr064Mesh extends Tr064Element<MeshSettings> {
    /** The refresh pauses while the page is hidden */
    #hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

    #options: MeshViewOptions | null = null;

    readonly #onVisibility = (): void => {
        const hidden = document.visibilityState === 'hidden';
        if (hidden !== this.#hidden) {
            this.#hidden = hidden;
            this.requestDraw();
        }
    };

    constructor() {
        super(CSS);
    }

    override connectedCallback(): void {
        super.connectedCallback();
        document.addEventListener('visibilitychange', this.#onVisibility);
    }

    override disconnectedCallback(): void {
        document.removeEventListener('visibilitychange', this.#onVisibility);
        super.disconnectedCallback();
    }

    /** The same object as long as the settings do not change: `MeshPanel` takes new values as a reset */
    #viewOptions(): MeshViewOptions {
        const settings = this.settings;
        const options: MeshViewOptions = {
            view: settings.view === 'table' ? 'table' : 'graph',
            onlyConfigured: settings.onlyConfigured === true,
            showDisconnected: settings.showDisconnected === true,
            showVendor: settings.showVendor !== false,
        };
        const old = this.#options;
        if (
            !old ||
            old.view !== options.view ||
            old.onlyConfigured !== options.onlyConfigured ||
            old.showDisconnected !== options.showDisconnected ||
            old.showVendor !== options.showVendor
        ) {
            this.#options = options;
        }
        return this.#options!;
    }

    /** Asks for the new name in a form of the host; a failure asks again with the reason */
    #rename = async (
        node: MeshNodeInfo,
        rename: (mac: string, name: string) => Promise<string | undefined>,
    ): Promise<void> => {
        const t = this.t;
        let name = node.name || '';
        let failure = '';
        for (;;) {
            const result = await this.openDialog({
                title: t('tr064_renameTitle'),
                width: 420,
                form: {
                    type: 'panel',
                    items: {
                        name: { type: 'text', label: t('tr064_newName') },
                        hint: { type: 'staticText', text: t('tr064_renameHint') },
                        ...(failure ? { failure: { type: 'staticText', text: t('tr064_renameFailed', failure) } } : {}),
                    },
                },
                data: { name },
                ok: t('tr064_rename'),
                cancel: t('tr064_cancel'),
            });
            // the box takes 63 characters at most (`MAX_HOST_NAME` of the adapter)
            name = textSetting(result?.name).substring(0, 63);
            if (!result || !name || name === node.name) {
                return;
            }
            failure = (await rename(node.mac, name)) || '';
            if (!failure) {
                return;
            }
        }
    };

    protected draw(): ReactNode {
        const instanceId = instanceIdOf(this.settings.instance);
        if (!instanceId) {
            return (
                <Hint
                    icon="AccountTree"
                    text={this.t('wc_chooseInstance')}
                />
            );
        }
        return (
            <MeshPanel
                socket={this.#hidden ? null : this.socket}
                instanceId={instanceId}
                // the editor reads once
                interval={this.editMode ? 0 : intSetting(this.settings.interval, 30, 10, 3600)}
                t={this.t}
                disabled={this.editMode}
                initial={this.#viewOptions()}
                title={textSetting(this.settings.title)}
                onRename={(node, rename) => void this.#rename(node, rename)}
            />
        );
    }
}

defineWebComponent(COMPONENTS.mesh.tag, Tr064Mesh);
