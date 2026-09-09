/**
 * The `meta` object of the adapter (`tr-064.<instance>`).
 *
 * It stores the call lists between two starts of the adapter. The object is written with
 * `setObject()`, therefore everything which must not end up in the database is a `#` field.
 */
import { CallLists, S_HTML_TEMPLATE } from './calllist';
import type { Tr064Adapter } from '../main';

export interface SystemDataNative {
    /** Marks that the object was written by this adapter at least once */
    loaded?: boolean;
    callLists?: CallLists;
}

export class SystemData {
    public type: ioBroker.ObjectType = 'meta';
    public common: { name: string } = { name: 'tr-064' };
    public native: SystemDataNative = {};

    readonly #adapter: Tr064Adapter;

    public constructor(adapter: Tr064Adapter) {
        this.#adapter = adapter;
    }

    /** Reads the stored object and creates the call lists out of it */
    public async load(): Promise<void> {
        if (this.native.loaded) {
            return;
        }

        try {
            const obj = await this.#adapter.getObjectAsync(this.#adapter.namespace);
            if (obj?.native.loaded) {
                delete (obj as Partial<ioBroker.Object>).acl;
                Object.assign(this, obj);
            }
        } catch {
            // ignore - the object is created below
        }

        if (this.#adapter.config.calllists.use) {
            // the stored lists are plain JSON, the methods have to be added again
            this.native.callLists = new CallLists(this.#adapter, this.native.callLists);

            let htmlTemplate: ioBroker.StateValue = null;
            try {
                const htmlTemplateState = await this.#adapter.getStateAsync(S_HTML_TEMPLATE);
                if (htmlTemplateState) {
                    htmlTemplate = htmlTemplateState.val;
                }
            } catch (err) {
                this.#adapter.log.info(`Error when initializing html Template: ${(err as Error).message}`);
            }
            this.native.callLists.htmlTemplate = htmlTemplate;
        }

        if (!this.native.loaded) {
            this.native.loaded = true;
            this.save();
        }
    }

    /** Writes the object back into the database */
    public save(): void {
        void this.#adapter.setObject(this.#adapter.namespace, this as unknown as ioBroker.SettableObject);
    }
}
