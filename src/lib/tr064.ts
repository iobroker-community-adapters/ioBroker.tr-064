/**
 * Client for the TR-064 interface of the Fritz!Box.
 *
 * Which services and actions exist depends on model and firmware of the box, therefore every
 * action is fetched with `safeFunction()` and every call has to survive a missing action.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAbsoluteDefaultDataDir } from '@iobroker/adapter-core';
import { TR064 } from 'tr-O64';
import type { Action, ActionArguments, ActionResult, Device, Service, TR064Error } from 'tr-O64';

import { refresh, ROOT as CALLLIST_ROOT } from './calllist';
import { safeFunction } from './utils';
import { CHANNEL_STATES, STATES } from './states';
import type { HostEntry } from './types';
import type { Tr064Adapter } from '../main';

/** The actions of one WLAN configuration service */
interface WlanFunctions {
    setEnable?: Action;
    getInfo?: Action;
    getSecurityKeys?: Action;
    setSecurityKeys?: Action;
}

/** Name of a WLAN configuration - also the name of the attribute of this class */
type WlanKind = 'wlan24' | 'wlan50' | 'wlanGuest';

/** Content of the state `command` */
interface CommandRequest {
    service: string;
    action: string;
    params: ActionArguments;
}

export class TR064Client extends TR064 {
    public readonly ip: string;
    public readonly port: number;
    public readonly user: string;
    public readonly password: string;

    /** Index of the answering machine which the states `ab`/`abIndex` address */
    public abIndex: number | undefined = undefined;

    public sslDevice!: Device;

    public wlan24: WlanFunctions = {};
    /** Undefined if the box has no separate 5 GHz configuration */
    public wlan50: WlanFunctions | undefined = {};
    public wlanGuest: WlanFunctions = {};

    private readonly adapter: Tr064Adapter;

    private hosts: Service | undefined;
    private getWLANConfiguration: Service | undefined;
    private getWLANConfiguration2: Service | undefined;
    private getWLANConfiguration3: Service | undefined;
    private voip: Record<string, Action> | undefined;
    private stateVariables: Record<string, unknown> = {};
    private ringTimeout: ioBroker.Timeout | null = null;

    /** Actions of the box - they only exist after `init()` and only if the box offers them */
    private GetCallList!: Action;
    private getABInfo!: Action;
    private setEnableAB!: Action;
    private getSpecificHostEntry!: Action;
    private getGenericHostEntry!: Action;
    private GetSpecificHostEntryExt!: Action;
    private GetChangeCounter!: Action;
    private getConfigFile: Action | undefined;
    private getExternalIPAddress: Action | undefined;
    private getExternalIPv6Address: Action | undefined;
    private getExternalIPv6Prefix: Action | undefined;

    /**
     * `reboot` and `reconnectInternet` are named like the states in `STATES`, because
     * `onStateChange()` calls the method with the name from `native.func`.
     */
    public reboot: Action | undefined;
    public reconnectInternet: Action | undefined;

    public constructor(adapter: Tr064Adapter, user: string, password: string, ip: string, port?: number) {
        super();
        this.adapter = adapter;
        this.ip = ip;
        this.port = port || 49000;
        this.user = user;
        this.password = password;
    }

    /** Shortcut for `safeFunction()` with the logger of this adapter */
    private safe(root: unknown, path: string, log?: boolean): Action {
        return safeFunction(root, path, this.adapter.log, log);
    }

    /** Connects to the box and collects all actions which the adapter uses */
    public init(callback: (err?: TR064Error | string | null) => void): void {
        this.initTR064Device(this.ip, this.port, (err, device) => {
            if (err || !device) {
                callback(err || '!device');
                return;
            }

            device.login(this.user, this.password);
            this.sslDevice = device;

            this.hosts = device.services['urn:dslforum-org:service:Hosts:1'];
            this.getWLANConfiguration = device.services['urn:dslforum-org:service:WLANConfiguration:1'];
            this.getWLANConfiguration2 = device.services['urn:dslforum-org:service:WLANConfiguration:2'];
            this.getWLANConfiguration3 = device.services['urn:dslforum-org:service:WLANConfiguration:3'];
            this.reboot = device.services['urn:dslforum-org:service:DeviceConfig:1'].actions.Reboot;
            // in: NewX_AVM-DE_Password, NewX_AVM-DE_ConfigFileUrl
            this.getConfigFile =
                device.services['urn:dslforum-org:service:DeviceConfig:1'].actions['X_AVM-DE_GetConfigFile'];

            this.GetCallList = this.safe(
                device,
                'services.urn:dslforum-org:service:X_AVM-DE_OnTel:1.actions.GetCallList',
            );

            this.getABInfo = this.safe(device, 'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.GetInfo');
            this.setEnableAB = this.safe(device, 'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.SetEnable');

            this.wlan24 = {
                setEnable: this.getWLANConfiguration?.actions.SetEnable,
                getInfo: this.getWLANConfiguration?.actions.GetInfo,
                getSecurityKeys: this.getWLANConfiguration?.actions.GetSecurityKeys,
                setSecurityKeys: this.getWLANConfiguration?.actions.SetSecurityKeys,
            };
            this.wlan50 = {
                setEnable: this.getWLANConfiguration2?.actions.SetEnable,
                getInfo: this.getWLANConfiguration2?.actions.GetInfo,
                getSecurityKeys: this.getWLANConfiguration2?.actions.GetSecurityKeys,
                setSecurityKeys: this.getWLANConfiguration2?.actions.SetSecurityKeys,
            };
            this.wlanGuest = {
                setEnable: this.getWLANConfiguration3?.actions.SetEnable,
                getInfo: this.getWLANConfiguration3?.actions.GetInfo,
                getSecurityKeys: this.getWLANConfiguration3?.actions.GetSecurityKeys,
                setSecurityKeys: this.getWLANConfiguration3?.actions.SetSecurityKeys,
            };

            // A box without a third WLAN configuration uses the second one for the guest WLAN
            if (!this.getWLANConfiguration3 || !this.wlanGuest.getInfo || !this.wlanGuest.setEnable) {
                this.wlanGuest = { ...this.wlan50 };
                this.wlan50 = undefined;
            }

            this.voip = this.sslDevice.services['urn:dslforum-org:service:X_VoIP:1']?.actions;

            this.getSpecificHostEntry = this.safe(this, 'hosts.actions.GetSpecificHostEntry');
            this.getGenericHostEntry = this.safe(this, 'hosts.actions.GetGenericHostEntry');
            this.GetSpecificHostEntryExt = this.safe(this, 'hosts.actions.X_AVM-DE_GetSpecificHostEntryExt');
            this.GetChangeCounter = this.safe(this, 'hosts.actions.X_AVM-DE_GetChangeCounter');

            this.stateVariables = {};
            if (this.hosts?.stateVariables) {
                this.stateVariables.HostNumberOfEntries = this.hosts.stateVariables.HostNumberOfEntries;
                this.stateVariables.changeCounter = this.hosts.stateVariables['X_AVM-DE_ChangeCounter'];
            }

            this.initIGDDevice(this.ip, this.port, (err, device) => {
                if (err) {
                    this.adapter.log.error(`initIGDDevice:${err.message} - ${JSON.stringify(err)}`);
                    return;
                }
                if (!device) {
                    return;
                }

                const wanIp = device.services['urn:schemas-upnp-org:service:WANIPConnection:1'];
                this.getExternalIPAddress = wanIp.actions.GetExternalIPAddress;
                this.getExternalIPv6Address = wanIp.actions.X_AVM_DE_GetExternalIPv6Address;
                this.getExternalIPv6Prefix = wanIp.actions.X_AVM_DE_GetIPv6Prefix;
                this.reconnectInternet = wanIp.actions.ForceTermination;
            });

            this.getWLAN(this.adapter.callbackTimers.wrap(2000, callback));
        });
    }

    /** Reads the call list of the box and writes the states of the lists */
    public refreshCalllist(): void {
        if (!this.adapter.config.calllists.use) {
            return;
        }

        this.GetCallList((err, data) => {
            refresh(
                this.adapter,
                this.adapter.systemData,
                err,
                data,
                (list, n, html) => {
                    const id = `${CALLLIST_ROOT}.${n}`;
                    if (list.cfg?.generateJson) {
                        this.adapter.devices.root.set(`${id}.json`, JSON.stringify(list.array));
                    }
                    this.adapter.devices.root.set(`${id}.count`, list.count);
                    if (list.cfg?.generateHtml) {
                        this.adapter.devices.root.set(`${id}.html`, html);
                    }
                    this.adapter.log.debug(`Calllist ${n} regenerated`);
                },
                () => {
                    this.adapter.devices.root.update();
                    this.adapter.log.debug('Calllist states updated');
                },
            );
        });
    }

    /** Reads the state of the answering machine with the index `val` */
    public setABIndex(val?: ioBroker.StateValue, cb?: () => void): void {
        if (val === undefined) {
            val = this.abIndex ?? null;
        }
        if (val === null || val === undefined) {
            val = this.adapter.devices.getval('states.abIdex', 0) ?? 0;
        }
        this.abIndex = ~~Number(val);

        this.getABInfo({ NewIndex: this.abIndex }, (err, data) => {
            if (err || !data) {
                return;
            }
            this.adapter.devStates.setAndUpdate('ab', !!data.NewEnable, cb);
        });
    }

    /** Switches the answering machine on or off. `val` may be `<index>,<state>` */
    public setAB(val: ioBroker.StateValue): void {
        let idx = this.abIndex;

        if (typeof val === 'string') {
            const ar = val.replace(/\s/g, '').split(',');
            if (ar.length > 1) {
                val = ar[1];
                idx = ~~Number(ar[0]);
            }
        }

        this.setEnableAB({ NewIndex: idx ?? 0, NewEnable: val ? 1 : 0 }, () => {});
    }

    /**
     * Lets a phone ring. `val` is `<number>[,<seconds>]` - with an internal number like `**610`
     * that phone rings, with an external one the box calls it.
     */
    public ring(val: ioBroker.StateValue): void {
        if (!val) {
            return;
        }

        const ar = val.toString().split(',');
        if (!ar.length || !this.voip) {
            return;
        }

        this.adapter.log.debug(`Ring : ${JSON.stringify(ar)}`);
        this.safe(
            this.voip,
            'X_AVM-DE_DialNumber',
            true,
        )({ 'NewX_AVM-DE_PhoneNumber': ar[0] }, err => {
            if (err) {
                this.adapter.log.warn(`Ring Error: ${err.message}`);
                return;
            }

            if (ar.length >= 2) {
                const duration = ~~Number(ar[1].trim());
                this.ringTimeout =
                    this.adapter.setTimeout(() => {
                        this.adapter.log.debug(`End Ring after ${duration}s`);
                        this.ringTimeout = null;
                        this.safe(this.voip, 'X_AVM-DE_DialHangup', true)({}, () => {});
                    }, duration * 1000) ?? null;
            }
        });
    }

    /** Stops a running ring timer - used on unload */
    public clearRingTimeout(): void {
        if (this.ringTimeout) {
            this.adapter.clearTimeout(this.ringTimeout);
            this.ringTimeout = null;
        }
    }

    /** Calls `callback` for every device which the box knows */
    public forEachHostEntry(
        callback: (err: TR064Error | null, device: HostEntry, cnt: number, all: number) => void,
    ): void {
        this.adapter.log.debug('forEachHostEntry');

        this.safe(
            this,
            'hosts.actions.GetHostNumberOfEntries',
        )((err, obj) => {
            if (err) {
                this.adapter.log.error(`GetHostNumberOfEntries:${err.message} - ${JSON.stringify(err)}`);
            }
            if (err || !obj) {
                return;
            }

            const all = ~~Number(obj.NewHostNumberOfEntries);
            this.adapter.log.debug(`forEachHostEntry: all=${all}`);
            let cnt = 0;

            const doIt = (): void => {
                if (cnt >= all) {
                    return;
                }

                this.safe(this, 'getGenericHostEntry')({ NewIndex: cnt }, (err, obj) => {
                    if (err) {
                        this.adapter.log.error(
                            `forEachHostEntry: in getGenericHostEntry ${cnt}:${err.message} - ${JSON.stringify(err)}`,
                        );
                    }
                    if (err || !obj) {
                        return;
                    }

                    const host = obj as unknown as HostEntry;
                    this.adapter.log.debug(`forEachHostEntry cnt=${cnt} ${host.NewHostName}`);
                    callback(err, host, cnt++, all);
                    this.adapter.setTimeout(doIt, 10);
                });
            };

            doIt();
        });
    }

    /** Calls `callback` for every device of the configuration, at the end with `null` */
    public forEachConfiguredDevice(callback: (device: HostEntry | null) => void): void {
        let i = 0;
        this.adapter.log.debug('forEachConfiguredDevice');

        const doIt = (): void => {
            if (i >= this.adapter.config.devices.length) {
                callback(null);
                return;
            }

            const dev = this.adapter.config.devices[i++];

            if (!dev.mac || dev.mac === '') {
                setImmediate(doIt);
                return;
            }

            this.safe(this, 'getSpecificHostEntry')({ NewMACAddress: dev.mac }, (err, result) => {
                let device: HostEntry | null = result as unknown as HostEntry;

                if (err && err.code === 500) {
                    if (dev.lastResult) {
                        device = dev.lastResult;
                        device.NewActive = false as unknown as string;
                    } else {
                        this.adapter.log.info(
                            `forEachConfiguredDevice: in GetSpecificHostEntry ${i - 1}(${dev.name}/${dev.mac}) device seems offline but we never saw it since adapter was started:${err.message} - ${JSON.stringify(err)}`,
                        );
                        device = null;
                    }
                } else if (err) {
                    this.adapter.log.warn(
                        `forEachConfiguredDevice: in GetSpecificHostEntry ${i - 1}(${dev.name}/${dev.mac}):${err.message} - ${JSON.stringify(err)}`,
                    );
                    device = null;
                } else {
                    // store last result to reuse if device goes offline and error 500 is returned
                    dev.lastResult = device;
                }

                if (device) {
                    this.adapter.log.debug(
                        `forEachConfiguredDevice: i=${i - 1} ${device.NewHostName} active=${device.NewActive}`,
                    );
                    device.NewMACAddress = dev.mac;
                    callback(device);
                }
                setImmediate(doIt);
            });
        };

        doIt();
    }

    /** Writes all services and actions of the box into `commandResult` and optionally into a file */
    private dumpServices(ar: string[]): void {
        let toFile = false;
        let doLog = false;

        if (ar?.length) {
            switch (ar[1]) {
                case 'log':
                    doLog = true;
                    break;

                case 'fs':
                    toFile = true;
                    break;
            }
        }

        const services: Record<string, { actions: Record<string, unknown> }> = {};

        for (const service in this.sslDevice.services) {
            services[service] = { actions: {} };
            const oService = this.sslDevice.services[service];
            if (oService.actions) {
                for (const action in oService.actions) {
                    const v: unknown = oService.actions[action];
                    services[service].actions[action] = typeof v === 'function' ? 'fn' : v;
                    if (doLog) {
                        this.adapter.log.debug(`${service}.actions.${action}`);
                    }
                }
            }
        }

        const dump = JSON.stringify(services);

        this.adapter.devStates.setAndUpdate(STATES.commandResult.name, dump);

        if (toFile) {
            // `getAbsoluteDefaultDataDir()` is `<iobroker>/iobroker-data`, the log is next to it
            const logName = join(getAbsoluteDefaultDataDir(), '..', 'log', 'tr-64-services.json');

            try {
                writeFileSync(logName, dump);
            } catch {
                this.adapter.log.error(`Cannot write file: ${logName}`);
            }
        }
    }

    /** Executes any TR-064 command out of the state `command` */
    public command(command: ioBroker.StateValue, callback?: () => void): void {
        if (typeof command === 'string' && command.toLowerCase().startsWith('dumpservices')) {
            this.dumpServices(command.toLowerCase().split('.'));
            return;
        }

        let o: CommandRequest;
        try {
            o = JSON.parse(command as string);
        } catch {
            return;
        }

        if (!o || typeof o.params !== 'object' || o.params === null) {
            return;
        }

        this.safe(this.sslDevice.services, `${o.service}.actions.${o.action}`)(o.params, (err, res) => {
            if (err || !res) {
                void this.adapter.setState(
                    `${CHANNEL_STATES}.${STATES.commandResult.name}`,
                    JSON.stringify(err || {}),
                    true,
                    callback,
                );
                return;
            }
            this.adapter.log.info(JSON.stringify(res));
            void this.adapter.setState(
                `${CHANNEL_STATES}.${STATES.commandResult.name}`,
                JSON.stringify(res),
                true,
                callback,
            );
        });
    }

    public setWLAN24(
        val: ioBroker.StateValue,
        callback?: (err: TR064Error | null, result: ActionResult) => void,
    ): void {
        this.safe(this.wlan24, 'setEnable', true)({ NewEnable: val ? 1 : 0 }, (err, result) => callback?.(err, result));
    }

    public setWLAN50(val: ioBroker.StateValue): void {
        if (!this.wlan50?.setEnable) {
            return;
        }

        this.safe(
            this.wlan50,
            'setEnable',
            true,
        )({ NewEnable: val ? 1 : 0 }, err => {
            if (err) {
                this.adapter.log.error(`getWLANConfiguration2: ${err.message} - ${JSON.stringify(err)}`);
            }
        });
    }

    public setWLANGuest(
        val: ioBroker.StateValue,
        callback?: (err: TR064Error | null, result: ActionResult) => void,
    ): void {
        this.safe(
            this.wlanGuest,
            'setEnable',
            true,
        )({ NewEnable: val ? 1 : 0 }, (err, result) => callback?.(err, result));
    }

    /** Switches all WLANs of the box */
    public setWLAN(val: ioBroker.StateValue, callback: (err?: TR064Error | number | null) => void): void {
        this.setWLAN24(val, (err, result) => {
            if (err) {
                this.adapter.log.error(`setWLAN24: ${err.message} - ${JSON.stringify(err)}`);
            }
            if (err || !result) {
                callback(-1);
                return;
            }

            this.setWLANGuest(val, err => {
                if (err) {
                    this.adapter.log.error(`setWLANGuest: ${err.message} - ${JSON.stringify(err)}`);
                }
                this.setWLAN50(val);
                callback(null);
            });
        });
    }

    private setWLANPassword(kind: WlanKind, pw: ioBroker.StateValue): void {
        const wlan = this[kind];
        if (!wlan?.getSecurityKeys || !wlan.setSecurityKeys) {
            return;
        }

        wlan.getSecurityKeys((err, ret) => {
            if (err || !ret || ret.NewKeyPassphrase === pw) {
                return;
            }
            ret.NewKeyPassphrase = pw as string;

            wlan.setSecurityKeys!(ret, () => {});
        });
    }

    public setWLAN24Password(val: ioBroker.StateValue): boolean {
        this.setWLANPassword('wlan24', val);
        return true;
    }

    public setWLAN50Password(val: ioBroker.StateValue): boolean {
        this.setWLANPassword('wlan50', val);
        return true;
    }

    public setWLANGuestPassword(val: ioBroker.StateValue): boolean {
        this.setWLANPassword('wlanGuest', val);
        return true;
    }

    /** Starts or stops the WPS process */
    public setWPSMode(modeOrOnOff: ioBroker.StateValue): void {
        let mode = modeOrOnOff;
        if (typeof modeOrOnOff === 'boolean') {
            mode = modeOrOnOff ? 'pbc' : 'stop';
        }

        const actions = this.getWLANConfiguration?.actions;
        if (!actions?.['X_AVM-DE_SetWPSConfig'] || !actions['X_AVM-DE_GetWPSInfo']) {
            this.adapter.log.error('WPS control options not available');
            return;
        }

        actions['X_AVM-DE_SetWPSConfig'](
            {
                'NewX_AVM-DE_WPSMode': mode as string,
                'NewX_AVM-DE_WPSClientPIN': '',
            },
            () =>
                actions['X_AVM-DE_GetWPSInfo'](err => {
                    if (err) {
                        this.adapter.log.error(`X_AVM-DE_GetWPSInfo error: ${err.message}`);
                    }
                }),
        );
    }

    public getWLAN(callback: (err: TR064Error | null, result: ActionResult) => void): void {
        this.safe(this.wlan24, 'getInfo', true)(callback);
    }

    public getWLAN5(callback: (err: TR064Error | null, result: ActionResult) => void): void {
        if (!this.wlan50?.getInfo) {
            // the caller must be answered, otherwise it waits for its own timeout
            callback(new Error('no 5 GHz WLAN configuration'), {});
            return;
        }
        this.safe(this.wlan50, 'getInfo', true)(callback);
    }

    public getWLANGuest(callback: (err: TR064Error | null, result: ActionResult) => void): void {
        this.safe(this.wlanGuest, 'getInfo', true)(callback);
    }
}
