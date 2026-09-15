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
import { getXml, normalizeMac, parseXml, safeFunction } from './utils';
import { CHANNEL_STATES, STATES } from './states';
import type { DeviceConfigEntry, HostEntry, TamListXml, TamMessageListXml } from './types';
import type { Tr064Adapter } from '../main';

/** The actions of one WLAN configuration service */
interface WlanFunctions {
    setEnable?: Action;
    getInfo?: Action;
    getSecurityKeys?: Action;
    setSecurityKeys?: Action;
}

/** A WLAN band which not every box has - also the name of the attribute of this class */
type OptionalBand = 'wlan50' | 'wlan52' | 'wlan60';

/** Name of a WLAN configuration - also the name of the attribute of this class */
type WlanKind = 'wlan24' | OptionalBand | 'wlanGuest';

/** Readable names of the optional bands for log messages */
const BAND_NAMES: Record<OptionalBand, string> = {
    wlan50: '5 GHz',
    wlan52: 'second 5 GHz',
    wlan60: '6 GHz',
};

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
    /** Undefined if the box has no second 5 GHz configuration (5 GHz high, e.g. FRITZ!Box 4060) */
    public wlan52: WlanFunctions | undefined = undefined;
    /** Undefined if the box has no 6 GHz configuration */
    public wlan60: WlanFunctions | undefined = undefined;
    public wlanGuest: WlanFunctions = {};

    private readonly adapter: Tr064Adapter;

    private hosts: Service | undefined;
    private getWLANConfiguration: Service | undefined;
    private voip: Record<string, Action> | undefined;
    private stateVariables: Record<string, unknown> = {};
    private ringTimeout: ioBroker.Timeout | null = null;

    /** Actions of the box - they only exist after `init()` and only if the box offers them */
    private GetCallList!: Action;
    private getABInfo!: Action;
    private setEnableAB!: Action;
    private getTAMList!: Action;
    private getTAMMessageList!: Action;
    /** Set while `refreshTAMMessages()` runs, so that two refreshes do not overlap */
    private tamRefreshRunning = false;
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

    /**
     * Assigns the WLAN configurations of the box.
     *
     * AVM lists one service per physical access point and one more for the guest WLAN, which is
     * therefore always the last one: `1` is 2.4 GHz, `2` is 5 GHz, a third physical access point is
     * a second 5 GHz (5 GHz high) or a 6 GHz one. A box with one band has 1-2 (guest = 2), a 7590
     * has 1-3 (guest = 3), a 4060 and a 5690 Pro have 1-4 (guest = 4) - the 4060 with a second
     * 5 GHz band, the 5690 Pro with 6 GHz. `GetInfo` of the third access point tells which.
     *
     * `done` is called when the bands are known, because the WLAN states are created afterwards.
     */
    private initWLANs(device: Device, done: () => void): void {
        const configs: Service[] = [];
        for (let i = 1; device.services[`urn:dslforum-org:service:WLANConfiguration:${i}`]; i++) {
            configs.push(device.services[`urn:dslforum-org:service:WLANConfiguration:${i}`]);
        }
        // a configuration which cannot be read or switched is not used as the guest WLAN
        while (
            configs.length > 1 &&
            !(configs[configs.length - 1].actions?.GetInfo && configs[configs.length - 1].actions?.SetEnable)
        ) {
            configs.pop();
        }

        const functions = (service: Service | undefined): WlanFunctions => ({
            setEnable: service?.actions?.SetEnable,
            getInfo: service?.actions?.GetInfo,
            getSecurityKeys: service?.actions?.GetSecurityKeys,
            setSecurityKeys: service?.actions?.SetSecurityKeys,
        });
        const bands = configs.slice(1, -1);

        this.getWLANConfiguration = configs[0];
        this.wlan24 = functions(configs[0]);
        this.wlanGuest = functions(configs.length > 1 ? configs[configs.length - 1] : undefined);
        this.wlan50 = bands[0] ? functions(bands[0]) : undefined;
        this.wlan52 = undefined;
        this.wlan60 = undefined;

        const finish = (): void => {
            this.adapter.log.debug(
                `${configs.length} WLAN configurations: 5 GHz ${this.wlan50 ? 'yes' : 'no'}, ${
                    this.wlan52 ? 'second 5 GHz yes, ' : ''
                }6 GHz ${this.wlan60 ? 'yes' : 'no'}, guest = ${configs.length > 1 ? configs.length : 'none'}`,
            );
            done();
        };

        const third = bands[1];
        if (!third) {
            finish();
            return;
        }
        if (!third.actions?.GetInfo) {
            this.wlan52 = functions(third);
            finish();
            return;
        }

        third.actions.GetInfo(
            this.adapter.callbackTimers.wrap<ActionResult>(2000, (_err, info) => {
                // `5000`, a firmware which does not report the band yet, and no answer: second 5 GHz
                if (info?.['NewX_AVM-DE_FrequencyBand'] === '6000') {
                    this.wlan60 = functions(third);
                } else {
                    this.wlan52 = functions(third);
                }
                finish();
            }),
        );
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
            this.getTAMList = this.safe(device, 'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.GetList');
            this.getTAMMessageList = this.safe(
                device,
                'services.urn:dslforum-org:service:X_AVM-DE_TAM:1.actions.GetMessageList',
            );

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

            this.initWLANs(device, () => this.getWLAN(this.adapter.callbackTimers.wrap(2000, callback)));
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

    /**
     * Counts the new messages of all answering machines and writes `states.abNewMessages`.
     *
     * A message with `<New>1</New>` has not been listened to yet. The box clears the flag when the
     * message is played (e.g. on a FRITZ!Fon), so the number goes down again with the next refresh.
     * The AVM documentation describes `New` the other way round, which does not match the boxes.
     * The state is only written if at least one message list could be read.
     */
    public refreshTAMMessages(done?: () => void): void {
        if (this.tamRefreshRunning) {
            done?.();
            return;
        }
        this.tamRefreshRunning = true;

        this.getTAMList(
            this.adapter.callbackTimers.wrap<ActionResult>(3000, (err, data) => {
                this.getTAMIndexes(err ? undefined : data?.NewTAMList, indexes => {
                    let count = 0;
                    let readable = 0;

                    const next = (): void => {
                        const index = indexes.shift();
                        if (index === undefined) {
                            this.tamRefreshRunning = false;
                            if (!readable) {
                                done?.();
                                return;
                            }
                            this.adapter.devStates.setAndUpdate(STATES.abNewMessages.name, count, () => done?.());
                            return;
                        }

                        this.countNewTAMMessages(index, newMessages => {
                            if (newMessages !== undefined) {
                                readable++;
                                count += newMessages;
                            }
                            next();
                        });
                    };

                    next();
                });
            }),
        );
    }

    /** Indexes of the answering machines which are shown in the web interface, out of `GetList` */
    private getTAMIndexes(tamList: string | undefined, cb: (indexes: number[]) => void): void {
        if (!tamList) {
            // a firmware without `GetList` (added 2016) has only the first answering machine
            cb([0]);
            return;
        }

        parseXml<TamListXml>(tamList, (_err, json) => {
            const items = json?.list?.item;
            const list = Array.isArray(items) ? items : items ? [items] : [];
            cb(list.filter(item => item.display === '1').map(item => ~~Number(item.index)));
        });
    }

    /** Counts the new messages of one answering machine - `undefined` if its list cannot be read */
    private countNewTAMMessages(index: number, cb: (count: number | undefined) => void): void {
        this.getTAMMessageList(
            { NewIndex: index },
            this.adapter.callbackTimers.wrap<ActionResult>(3000, (err, data) => {
                const url = data?.NewURL;
                // like the call list, the message list is only read by http
                if (err || !url || url.startsWith('https:')) {
                    cb(undefined);
                    return;
                }

                getXml<TamMessageListXml>(url, (httpErr, json) => {
                    if (httpErr) {
                        this.adapter.log.debug(
                            `Cannot read the messages of answering machine ${index}: ${httpErr.message}`,
                        );
                        cb(undefined);
                        return;
                    }
                    const messages = json?.root?.message;
                    const list = Array.isArray(messages) ? messages : messages ? [messages] : [];
                    cb(list.filter(message => message.new === '1').length);
                });
            }),
        );
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

    /**
     * Calls `callback` for every device of the configuration which the box knows, at the end with `null`.
     *
     * The box answers every fault with HTTP 500 and the library drops the UPnP error code, so an
     * unknown MAC address cannot be told apart from a device which is offline. A device which was
     * seen before is then reported with its last entry as inactive; a device which was never seen
     * is logged once and reported by `onUnknown`. Every request has a timeout, otherwise one lost
     * answer would stop the presence detection and the poll cycle.
     */
    public forEachConfiguredDevice(
        callback: (device: HostEntry | null) => void,
        onUnknown?: (entry: DeviceConfigEntry) => void,
    ): void {
        let i = 0;
        this.adapter.log.debug('forEachConfiguredDevice');

        const doIt = (): void => {
            if (i >= this.adapter.config.devices.length) {
                callback(null);
                return;
            }

            const dev = this.adapter.config.devices[i++];
            // the box writes MAC addresses as `AA:BB:CC:DD:EE:FF`, the configuration may not
            const mac = normalizeMac(dev.mac || '');

            if (!mac) {
                setImmediate(doIt);
                return;
            }

            this.safe(this, 'getSpecificHostEntry')(
                { NewMACAddress: mac },
                this.adapter.callbackTimers.wrap<ActionResult>(3000, (err, result) => {
                    let device: HostEntry | null = result as unknown as HostEntry | null;

                    if (err === 'timeout') {
                        this.adapter.log.warn(`GetSpecificHostEntry: no answer for "${dev.name}" (${mac})`);
                        device = dev.lastResult ?? null;
                    } else if (err && typeof err === 'object' && err.code === 500) {
                        if (dev.lastResult) {
                            device = dev.lastResult;
                            device.NewActive = false as unknown as string;
                        } else {
                            if (!dev.notFoundLogged) {
                                dev.notFoundLogged = true;
                                this.adapter.log.info(
                                    `Device "${dev.name}" (${mac}) is unknown to the FRITZ!Box or offline since the adapter was started. If it is online, check its MAC address in the tab "Devices"`,
                                );
                            }
                            device = null;
                            onUnknown?.(dev);
                        }
                    } else if (err) {
                        this.adapter.log.warn(
                            `forEachConfiguredDevice: in GetSpecificHostEntry ${i - 1}(${dev.name}/${mac}):${typeof err === 'string' ? err : err.message} - ${JSON.stringify(err)}`,
                        );
                        device = null;
                    } else if (device) {
                        // store last result to reuse if device goes offline and error 500 is returned
                        dev.lastResult = device;
                        dev.notFoundLogged = false;
                    }

                    if (device) {
                        this.adapter.log.debug(
                            `forEachConfiguredDevice: i=${i - 1} ${device.NewHostName} active=${device.NewActive}`,
                        );
                        device.NewMACAddress = dev.mac;
                        callback(device);
                    }
                    setImmediate(doIt);
                }),
            );
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
        this.setWLANBand('wlan50', val);
    }

    public setWLAN52(val: ioBroker.StateValue): void {
        this.setWLANBand('wlan52', val);
    }

    public setWLAN60(val: ioBroker.StateValue): void {
        this.setWLANBand('wlan60', val);
    }

    /** Switches a WLAN band which not every box has */
    private setWLANBand(kind: OptionalBand, val: ioBroker.StateValue): void {
        const wlan = this[kind];
        if (!wlan?.setEnable) {
            return;
        }

        this.safe(
            wlan,
            'setEnable',
            true,
        )({ NewEnable: val ? 1 : 0 }, err => {
            if (err) {
                this.adapter.log.error(`${BAND_NAMES[kind]} WLAN: ${err.message} - ${JSON.stringify(err)}`);
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
                this.setWLAN52(val);
                this.setWLAN60(val);
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

    public setWLAN52Password(val: ioBroker.StateValue): boolean {
        this.setWLANPassword('wlan52', val);
        return true;
    }

    public setWLAN60Password(val: ioBroker.StateValue): boolean {
        this.setWLANPassword('wlan60', val);
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
        this.getWLANBand('wlan50', callback);
    }

    public getWLAN52(callback: (err: TR064Error | null, result: ActionResult) => void): void {
        this.getWLANBand('wlan52', callback);
    }

    public getWLAN6(callback: (err: TR064Error | null, result: ActionResult) => void): void {
        this.getWLANBand('wlan60', callback);
    }

    /** Reads a WLAN band which not every box has */
    private getWLANBand(kind: OptionalBand, callback: (err: TR064Error | null, result: ActionResult) => void): void {
        const wlan = this[kind];
        if (!wlan?.getInfo) {
            // the caller must be answered, otherwise it waits for its own timeout
            callback(new Error(`no ${BAND_NAMES[kind]} WLAN configuration`), {});
            return;
        }
        this.safe(wlan, 'getInfo', true)(callback);
    }

    public getWLANGuest(callback: (err: TR064Error | null, result: ActionResult) => void): void {
        this.safe(this.wlanGuest, 'getInfo', true)(callback);
    }
}
