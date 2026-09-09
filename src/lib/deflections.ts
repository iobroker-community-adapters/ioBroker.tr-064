/** Call forwardings ("Rufumleitungen") of the Fritz!Box */
import { Parser } from 'xml2js';
import type { Action, ActionResult, Device, TR064Error } from 'tr-O64';

import { CDevice, type Devices } from './devices';
import { getProp } from './utils';
import type { DeflectionEntry, VoIPAccount, VoIPNumber } from './types';
import type { Tr064Adapter } from '../main';

/** Channel below which the call forwardings are created */
export const CHANNEL_DEFLECTIONS = 'callForwarding';

const parser = new Parser({
    explicitArray: false,
    mergeAttrs: true,
    normalizeTags: true,
    ignoreAttrs: true,
});

/**
 * Callback of a wrapped action.
 *
 * The number of declared parameters decides how it is called: with one parameter only the data is
 * passed and errors are swallowed, with two parameters error and data are passed.
 */
type WrappedCallback = (...args: any[]) => void;

/** Action which unpacks a `<List><Item>` answer into an array before it calls the callback */
type WrappedAction = (...args: any[]) => void;

interface DeflectionList {
    list?: {
        item?: DeflectionEntry | DeflectionEntry[];
    };
}

interface ActionSet {
    [name: string]: WrappedAction | undefined;
    /** Actions whose name starts with `X_AVM-DE_`, without this prefix */
    avm?: any;
}

export interface GetFunctionsOptions {
    /** Only these functions are created */
    only?: string | string[];
    /** These functions must exist - missing ones become a function which does nothing */
    expected?: string | string[];
}

/**
 * Creates the wrapped actions of one service in `dest`.
 *
 * Some actions of the box answer with a single string which contains an XML list. Those are
 * converted into an array here, so that the caller always gets the same shape.
 */
function getFunctions(
    dest: ActionSet,
    source: Device | Record<string, unknown>,
    path: string,
    options?: GetFunctionsOptions | string | string[],
): boolean {
    let services: unknown = source;
    if (typeof (source as Device).services === 'object') {
        services = (source as Device).services;
    }

    const actions = getProp<Record<string, Action>>(services, path.endsWith('.actions') ? path : `${path}.actions`);

    if (!actions) {
        return false;
    }

    function getFunction(funcName: string): WrappedAction {
        const func = actions![funcName];

        return function (...args: any[]): void {
            const len = args.length - 1;
            const cb: WrappedCallback | undefined = len >= 0 ? args[len] : undefined;

            if (typeof cb === 'function') {
                args[len] = function (err: TR064Error | null, data: ActionResult): void {
                    if (err || !data) {
                        if (cb.length >= 2) {
                            cb(err, data);
                        }
                        return;
                    }

                    const keys = Object.keys(data);

                    if (keys.length === 1 && data[keys[0]].startsWith('<List><Item>')) {
                        parser.parseString(data[keys[0]], (err: Error | null, json: DeflectionList) => {
                            if (err || !json?.list?.item) {
                                return;
                            }

                            const ar = json.list.item as DeflectionEntry[] & { returnedName?: string };
                            ar.returnedName = keys[0];

                            if (cb.length >= 2) {
                                cb(err, ar);
                            } else {
                                cb(ar);
                            }
                        });
                        return;
                    }

                    if (cb.length >= 2) {
                        cb(err, data);
                    } else {
                        cb(data);
                    }
                };
            } else {
                args.push((): void => {});
            }

            (func as (...args: any[]) => void)(...args);
        };
    }

    let only: string[] | undefined;
    if (options && typeof options === 'object' && !Array.isArray(options) && options.only) {
        only = typeof options.only === 'string' ? options.only.split(',') : options.only;
    }

    Object.keys(actions).forEach(funcName => {
        if (only && !only.includes(funcName)) {
            return;
        }
        if (funcName.startsWith('X_AVM-DE_')) {
            dest.avm = dest.avm || {};
            dest.avm[funcName.substring(9)] = getFunction(funcName);
        } else {
            dest[funcName] = getFunction(funcName);
        }
    });

    if (!options) {
        return true;
    }

    let expected: string[] | undefined;
    if (typeof options === 'string') {
        expected = options.split(',');
    } else if (Array.isArray(options)) {
        expected = options;
    } else if (options.only) {
        expected = typeof options.only === 'string' ? options.only.split(',') : options.only;
    } else if (options.expected) {
        expected = typeof options.expected === 'string' ? options.expected.split(',') : options.expected;
    }

    if (expected) {
        const nop = (): void => {};
        expected.forEach(fn => (dest[fn] = dest[fn] || nop));
    }

    return true;
}

export class Deflections {
    private readonly adapter: Tr064Adapter;
    private readonly devices: Devices;
    private readonly OnTel: ActionSet = {};
    private readonly VoIP: ActionSet = {};

    public constructor(sslDevice: Device, adapter: Tr064Adapter, devices: Devices) {
        this.adapter = adapter;
        this.devices = devices;
        this.init(sslDevice);
    }

    private init(sslDevice: Device): void {
        const ret = getFunctions(this.OnTel, sslDevice, 'urn:dslforum-org:service:X_AVM-DE_OnTel:1', {
            only: ['GetDeflections', 'SetDeflectionEnable', 'GetDeflection'],
        });
        if (!ret) {
            return;
        }

        getFunctions(this.VoIP, sslDevice, 'urn:dslforum-org:service:X_VoIP:1', 'GetExistingVoIPNumbers');
        this.get(undefined, true);
    }

    /** Reads all call forwardings and the VoIP numbers belonging to them */
    public get(callback?: () => void, create?: boolean): void {
        const voips: Record<string, VoIPAccount> = {};

        if (!this.OnTel.GetDeflections || !this.VoIP.GetExistingVoIPNumbers || !this.VoIP.avm?.GetNumbers) {
            this.adapter.log.info('No Telephone Deflections available');
            callback?.();
            return;
        }

        this.OnTel.GetDeflections((deflections: DeflectionEntry[]) => {
            this.VoIP.GetExistingVoIPNumbers!((data: ActionResult) => {
                let i = ~~Number(data.NewExistingVoIPNumbers);

                this.VoIP.avm.GetNumbers((numbers: VoIPNumber[]) => {
                    const doIt = (): void => {
                        if (--i < 0) {
                            if (create) {
                                this.createStates(deflections, voips);
                            } else {
                                this.updateStates(deflections);
                            }
                            callback?.();
                            return;
                        }

                        this.VoIP.avm.GetVoIPAccount({ NewVoIPAccountIndex: i }, (account: VoIPAccount) => {
                            if (i < numbers.length && numbers[i]) {
                                const num = numbers[i];
                                account.name = num.name;
                                voips[num.number] = account;
                            }
                            doIt();
                        });
                    };

                    doIt();
                });
            });
        });
    }

    private createStates(deflections: DeflectionEntry[], voips: Record<string, VoIPAccount>): void {
        const dev = new CDevice(this.devices, CHANNEL_DEFLECTIONS, 'Call forwarding');

        for (let i = 0; i < deflections.length; i++) {
            const entry = deflections[i];
            let showName = '';

            if (entry.type === 'toVoIP' && voips[entry.number]) {
                const voip = voips[entry.number];
                showName = voip.name || voip.NewVoIPNumber || '';
                if (showName) {
                    showName = ` (${showName})`;
                }
            }

            const name = `${entry.type} ${entry.number}${showName} -> ${entry.deflectiontonumber}`;
            dev.set(entry.deflectionid, {
                val: entry.enable === '1',
                common: { name, type: 'boolean', role: 'state' },
            });
            this.adapter.log.debug(`setting ${entry.deflectionid} (${name}) enable=${entry.enable === '1'}`);
        }

        this.devices.update();
    }

    private updateStates(deflections: DeflectionEntry[]): void {
        const dev = new CDevice(this.devices, CHANNEL_DEFLECTIONS, 'Call forwarding');

        for (let i = 0; i < deflections.length; i++) {
            const entry = deflections[i];
            dev.set(entry.deflectionid, entry.enable === '1');
            this.adapter.log.debug(`setting ${entry.deflectionid} enable=${entry.enable === '1'}`);
        }

        this.devices.update();
    }

    private enable(id: string, val: ioBroker.StateValue): void {
        if (!this.OnTel.SetDeflectionEnable) {
            return;
        }
        this.OnTel.SetDeflectionEnable({ NewDeflectionId: id, NewEnable: ~~Number(val) });
    }

    public onStateChange(id: string, _cmd: string | undefined, val: ioBroker.StateValue): void {
        this.enable(id, val);
    }
}
