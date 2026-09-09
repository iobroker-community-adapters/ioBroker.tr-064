/*
 * ioBroker tr-064 adapter
 *
 * Reads the main information of an AVM Fritz!Box over the TR-064 interface: call lists,
 * answering machine, phone book, presence of devices and the call monitor.
 *
 * Copyright (c) 2015-2023 soef <soef@gmx.net>
 * Copyright (c) 2023-2026 iobroker-community-adapters <iobroker-community-adapters@gmx.de>
 *
 * MIT License, see LICENSE
 */
import * as utils from '@iobroker/adapter-core';
import MulticastDns from 'mdns-discovery';
import type { ActionResult, TR064Error } from 'tr-O64';

import { CDevice, Devices } from './lib/devices';
import { CallMonitor } from './lib/callmonitor';
import { normalizeConfig, ROOT as CALLLIST_ROOT, S_HTML_TEMPLATE } from './lib/calllist';
import { CHANNEL_DEFLECTIONS, Deflections } from './lib/deflections';
import { Phonebook } from './lib/phonebook';
import { SystemData } from './lib/systemdata';
import { TR064Client } from './lib/tr064';
import { CallbackTimers } from './lib/utils';
import {
    CHANNEL_CALLLISTS,
    CHANNEL_CALLMONITOR,
    CHANNEL_DEVICES,
    CHANNEL_PHONEBOOK,
    CHANNEL_STATES,
    PB_STATES,
    STATES,
} from './lib/states';
import type { DeviceConfigEntry, DiscoveredDevice, HostEntry } from './lib/types';

/** Default secret of `system.config` if the host has none */
const DEFAULT_SECRET = 'Zgfr56gFe87jJOM';

/** Method of `TR064Client` which is called when a state below `states` is written */
type StateFunction = (val: ioBroker.StateValue, callback?: () => void) => boolean | void;

/** One entry of the list which `updateAll()` reads from the box */
interface PollEntry {
    func: string;
    state: string;
    result: string;
    format: (val: string) => ioBroker.StateValue;
}

export class Tr064Adapter extends utils.Adapter {
    /** Object and state cache */
    public devices!: Devices;
    /** Cursor on the channel `states` */
    public devStates!: CDevice;
    /** The `meta` object with the stored call lists */
    public readonly systemData: SystemData;
    /** Timers which guard the answers of the box */
    public readonly callbackTimers = new CallbackTimers();

    private phonebook!: Phonebook;
    private tr064Client!: TR064Client;
    private deflections: Deflections | null = null;
    private callMonitor: CallMonitor | null = null;

    /** Result of the last discovery for the admin */
    private allDevices: DiscoveredDevice[] = [];
    private allDevicesOnlyActive: boolean | undefined = undefined;
    /** Last known state per IP address - used by the mDNS detection */
    private readonly ipActive: Record<string, boolean> = {};

    private initError: TR064Error | string | null | undefined = null;
    private pollingTimer: ioBroker.Timeout | null = null;
    private refreshCalllistTimeout: ioBroker.Timeout | null = null;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'tr-064' });

        this.systemData = new SystemData(this);

        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('message', obj => this.onMessage(obj));
        this.on('unload', callback => this.onUnload(callback));
    }

    private onReady(): void {
        this.devices = new Devices(this);

        void this.getForeignObject('system.config', (_err, systemConfig) => {
            if (
                this.config.password &&
                (!this.supportsFeature || !this.supportsFeature('ADAPTER_AUTO_DECRYPT_NATIVE'))
            ) {
                this.config.password = this.decrypt(
                    systemConfig?.native?.secret || DEFAULT_SECRET,
                    this.config.password,
                );
            }

            // eslint-disable-next-line no-control-regex
            if (/[\x00-\x08\x0E-\x1F\x80-\xFF]/.test(this.config.password)) {
                this.log.error('Password error: Please re-enter the password in Admin. Stopping');
                return;
            }

            void this.main();
        });
    }

    private onUnload(callback: () => void): void {
        try {
            if (this.pollingTimer) {
                this.clearTimeout(this.pollingTimer);
                this.pollingTimer = null;
            }
            if (this.refreshCalllistTimeout) {
                this.clearTimeout(this.refreshCalllistTimeout);
                this.refreshCalllistTimeout = null;
            }
            this.tr064Client?.clearRingTimeout();
            this.callbackTimers.clearAll();
            this.callMonitor?.close();
            this.callMonitor = null;
            callback();
        } catch {
            callback();
        }
    }

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state || !id.startsWith(`${this.namespace}.`)) {
            return;
        }

        if (this.initError) {
            this.log.error('tr-064 adapter not connected to a FritzBox. Terminating');
            this.terminate('tr-064 adapter not connected to a FritzBox. Terminating', 1);
            return;
        }

        this.log.debug(`State changed: ${id} = ${JSON.stringify(state)}`);

        if (!state.ack) {
            this.onCommandState(id, state);
        } else if (this.config.calllists.use && id.includes('callmonitor.lastCall.timestamp')) {
            // If multiple updates come we wait for 100ms stability
            if (this.refreshCalllistTimeout) {
                this.clearTimeout(this.refreshCalllistTimeout);
            }
            this.refreshCalllistTimeout =
                this.setTimeout(() => {
                    this.refreshCalllistTimeout = null;
                    this.tr064Client.refreshCalllist();
                }, 100) ?? null;
        }
    }

    /** Handles a state which the user has written */
    private onCommandState(id: string, state: ioBroker.State): void {
        const as = id.split('.');
        if (as.length < 3) {
            return;
        }

        const cmd = as[3];

        switch (as[2]) {
            case CHANNEL_STATES: {
                const func = STATES[cmd]?.native?.func;
                const client = this.tr064Client as unknown as Record<string, StateFunction | undefined>;
                if (func && typeof client[func] === 'function' && state.val !== null && state.val !== undefined) {
                    const ret = client[func].call(this.tr064Client, state.val, () => {});
                    if (ret === true) {
                        this.devices.root.clear(id);
                    }
                }
                break;
            }

            case CHANNEL_CALLLISTS:
            case CALLLIST_ROOT:
                if (cmd === 'htmlTemplate') {
                    if (state.val && this.systemData.native.callLists) {
                        this.systemData.native.callLists.htmlTemplate = state.val.toString();
                    }
                } else if (as[4] === 'count' && this.systemData.native.callLists) {
                    const list = this.systemData.native.callLists[cmd as 'all'];
                    if (list) {
                        list.count = ~~Number(state.val);
                    }
                    // save system data in namespace
                    this.systemData.save();
                }
                return;

            case CHANNEL_PHONEBOOK:
                if (state.val) {
                    this.onPhonebook(cmd, state.val);
                }
                return;

            case CHANNEL_DEFLECTIONS:
                this.deflections?.onStateChange(cmd, as[4], state.val);
                break;

            default:
                return;
        }
    }

    private onMessage(obj: ioBroker.Message): void {
        if (!obj) {
            return;
        }

        this.log.debug(`onMessage: ${JSON.stringify(obj)}`);

        switch (obj.command) {
            case 'discovery': {
                let onlyActive: boolean | undefined;
                let reread: boolean | undefined;
                let asNative = false;
                let configured: DeviceConfigEntry[] | undefined;

                if (typeof obj.message === 'object' && obj.message !== null) {
                    const message = obj.message as {
                        onlyActive?: boolean;
                        reread?: boolean;
                        native?: boolean;
                        devices?: DeviceConfigEntry[];
                    };
                    onlyActive = message.onlyActive;
                    reread = message.reread;
                    asNative = !!message.native;
                    configured = message.devices;
                }

                if (!obj.callback) {
                    return;
                }

                if (!reread && this.allDevices.length > 0 && this.allDevicesOnlyActive === onlyActive) {
                    this.log.debug(`Discovery result: ${JSON.stringify(this.allDevices)}`);
                    this.sendDiscoveryResult(obj, this.allDevices, asNative, configured);
                    return;
                }

                const newAllDevices: DiscoveredDevice[] = [];
                let responseSent = false;

                this.tr064Client.forEachHostEntry((_err, device, cnt, all) => {
                    const active = !!~~Number(device.NewActive);

                    if (!onlyActive || active) {
                        newAllDevices.push({
                            name: device.NewHostName,
                            ip: device.NewIPAddress,
                            mac: device.NewMACAddress,
                            active,
                        });
                    }
                    this.log.debug(
                        `Discovery Add (${cnt}/${all}): ${device.NewHostName} ${device.NewIPAddress} ${device.NewMACAddress} ${device.NewActive}`,
                    );

                    if (cnt + 1 >= all && !responseSent) {
                        responseSent = true;
                        this.allDevices = newAllDevices;
                        this.allDevicesOnlyActive = onlyActive;
                        this.log.debug(`Discovery result: ${JSON.stringify(this.allDevices)}`);
                        this.sendDiscoveryResult(obj, newAllDevices, asNative, configured);
                    }
                });
                return;
            }

            default:
                this.log.warn(`Unknown command: ${obj.command}`);
                break;
        }

        if (obj.callback) {
            this.sendTo(obj.from, obj.command, obj.message, obj.callback);
        }
    }

    /**
     * Answers a `discovery` request.
     *
     * The admin asks with `native: true` and gets the device list of the configuration back,
     * completed by the found devices. Every other caller gets the found devices as a JSON string,
     * like all versions before.
     */
    private sendDiscoveryResult(
        obj: ioBroker.Message,
        found: DiscoveredDevice[],
        asNative: boolean,
        configured?: DeviceConfigEntry[],
    ): void {
        if (!asNative) {
            this.sendTo(obj.from, obj.command, JSON.stringify(found), obj.callback);
            return;
        }

        const devices: DeviceConfigEntry[] = (configured || []).filter(
            device => device.name || device.ip || device.mac,
        );

        found.forEach(device => {
            const known = devices.find(entry => (entry.mac || '').toUpperCase() === (device.mac || '').toUpperCase());
            if (!known) {
                devices.push({ name: device.name, ip: device.ip, mac: device.mac });
            }
        });

        this.sendTo(obj.from, obj.command, { native: { devices } }, obj.callback);
    }

    private setPhonebookStates(entry?: { number?: string; name?: string; imageurl?: string }): void {
        this.devices.root.set(`.${CHANNEL_PHONEBOOK}.number`, entry?.number ? entry.number : '');
        this.devices.root.set(`.${CHANNEL_PHONEBOOK}.name`, entry?.name ? entry.name : '');
        this.devices.root.set(`.${CHANNEL_PHONEBOOK}.image`, entry?.imageurl ? entry.imageurl : '');
        this.devices.update();
    }

    /** Resolves a number or a name in the phone book */
    private onPhonebook(cmd: string, val: ioBroker.StateValue): void {
        if (!this.config.usePhonebook) {
            return;
        }

        switch (cmd) {
            case 'number':
                this.setPhonebookStates(this.phonebook.byNumber(String(val)));
                break;

            case 'name':
                this.setPhonebookStates(this.phonebook.byName(String(val)));
                break;

            case 'command':
                break;
        }
    }

    /** Creates the channels and all states which do not depend on the box */
    private createObjects(cb?: (result?: unknown) => void): void {
        this.devStates.setDevice(CHANNEL_CALLLISTS, { common: { name: 'Call lists', role: 'device' }, native: {} });

        if (this.config.calllists.use) {
            const htmlTemplate = this.systemData.native.callLists?.htmlTemplate || '';
            this.log.debug(`Initialize HTML template: ${htmlTemplate}`);
            this.devices.root.createNew(S_HTML_TEMPLATE, htmlTemplate);
        }

        this.devStates.setDevice(CHANNEL_DEVICES, { common: { name: 'Devices', role: 'device' }, native: {} });
        this.devStates.setDevice(CHANNEL_CALLMONITOR, { common: { name: 'Call monitor', role: 'device' }, native: {} });
        this.devStates.setDevice(CHANNEL_PHONEBOOK, { common: { name: 'Phone book', role: 'device' }, native: {} });

        for (const i in PB_STATES) {
            const st = { ...PB_STATES[i] };
            this.devStates.createNew(st.name, st);
        }

        this.devStates.setDevice(CHANNEL_STATES, {
            common: { name: 'States and commands', role: 'device' },
            native: {},
        });

        for (const i in STATES) {
            if (i.startsWith('wlan50') && !this.tr064Client.wlan50 && this.tr064Client.wlanGuest) {
                continue;
            }
            const st = { ...STATES[i] };
            this.devStates.createNew(st.name, st);
        }

        this.devices.update(cb);
    }

    private isKnownMac(mac: string): boolean {
        return !!this.config.devices.find(v => v.mac === mac);
    }

    private deleteStates(list: string[], callback?: () => void): void {
        if (!list.length) {
            callback?.();
            return;
        }

        const id = list.shift()!;
        this.delForeignObject(id, () => setImmediate(() => this.deleteStates(list, callback)));
    }

    private deleteDevices(list: string[], callback?: () => void): void {
        if (!list.length) {
            callback?.();
            return;
        }

        const id = list.shift()!;
        this.getObjectView('system', 'state', { startkey: `${id}.`, endkey: `${id}.香` }, (_err, res) => {
            const ids = res ? res.rows.map(el => el.id) : [];
            this.deleteStates(ids, () =>
                this.delForeignObject(id, () => setImmediate(() => this.deleteDevices(list, callback))),
            );
        });
    }

    /** Removes the objects of devices which are not configured any more */
    private deleteUnusedDevices(callback?: (err?: Error | null) => void): void {
        const ch = `${this.namespace}.${CHANNEL_DEVICES}`;

        this.getObjectView('system', 'state', { startkey: `${ch}.`, endkey: `${ch}.香` }, (err, res) => {
            if (err || !res) {
                callback?.(err);
                return;
            }

            const toDelete: string[] = [];

            res.rows.forEach(o => {
                if (o.id.endsWith('.jsonDeviceList')) {
                    return;
                }
                const native = o.value?.native as { mac?: string } | undefined;
                // old device, without native.mac
                let doDelete = !native?.mac && !o.id.substring(ch.length + 1).includes('.');
                doDelete = doDelete || (!!native?.mac && !this.isKnownMac(native.mac));
                if (doDelete) {
                    toDelete.push(o.id);
                }
            });

            this.deleteDevices(toDelete, callback);
        });
    }

    /** Writes the presence states of one device */
    private setActive(dev: CDevice, val: string | number | boolean, ip?: string, mac?: string): void {
        const active = !!~~Number(val);

        if (ip !== undefined && this.ipActive[ip] !== active) {
            this.ipActive[ip] = active;
        }
        if (!dev.set('active', active)) {
            return; // state not changed
        }

        const dts = new Date();
        const sts = dts.toLocaleString();
        const ts = ~~(dts.getTime() / 1000);

        if (active) {
            dev.set('lastActive', sts);
            dev.set('lastActive-ts', ts);
            dev.set('lastIP', ip);
            dev.set('lastMAC-address', mac);
        } else {
            dev.set('lastInactive', sts);
            dev.set('lastInactive-ts', ts);
        }
        dev.set('', active);
    }

    /** Creates the objects of all configured devices */
    private createConfiguredDevices(callback?: (result?: unknown) => void): void {
        this.log.debug('createConfiguredDevices');
        const dev = new CDevice(this.devices, CHANNEL_DEVICES, '');
        const arr: DiscoveredDevice[] = [];

        this.tr064Client.forEachConfiguredDevice((device: HostEntry | null) => {
            if (!device) {
                if (this.config.jsonDeviceList) {
                    dev.setChannelEx();
                    dev.set('jsonDeviceList', {
                        common: { name: 'jsonDeviceList', type: 'json', role: 'state' },
                        val: JSON.stringify(arr),
                    });
                }
                this.devices.update(callback);
                return;
            }

            dev.setChannelEx(device.NewHostName, {
                common: { name: `${device.NewHostName} (${device.NewIPAddress})`, role: 'channel' },
                native: { mac: device.NewMACAddress },
            });
            this.setActive(dev, device.NewActive, device.NewIPAddress, device.NewMACAddress);
            arr.push({
                active: !!~~Number(device.NewActive),
                ip: device.NewIPAddress,
                name: device.NewHostName,
                mac: device.NewMACAddress,
            });
        });
    }

    /** Updates the presence states of all configured devices */
    private updateDevices(callback?: (result?: unknown) => void): void {
        this.log.debug('updateDevices');
        const dev = new CDevice(this.devices, CHANNEL_DEVICES, '');
        const arr: DiscoveredDevice[] = [];

        this.tr064Client.forEachConfiguredDevice((device: HostEntry | null) => {
            if (!device) {
                if (this.config.jsonDeviceList) {
                    dev.setChannelEx();
                    dev.set('jsonDeviceList', JSON.stringify(arr));
                }
                this.devices.update(callback);
                return;
            }

            this.log.debug(`forEachConfiguredDevice: ${JSON.stringify(device)}`);
            dev.setChannelEx(device.NewHostName);
            this.setActive(dev, device.NewActive, device.NewIPAddress, device.NewMACAddress);

            if (this.config.jsonDeviceList) {
                arr.push({
                    active: !!~~Number(device.NewActive),
                    ip: device.NewIPAddress,
                    name: device.NewHostName,
                    mac: device.NewMACAddress,
                });
            }
        });
    }

    private updateDeflections(callback: () => void): void {
        if (this.deflections) {
            this.deflections.get(callback);
        } else {
            callback();
        }
    }

    /** Reads everything from the box which is polled cyclically */
    private updateAll(): void {
        this.log.debug('in updateAll');

        const names: PollEntry[] = [
            {
                func: 'getExternalIPAddress',
                state: STATES.externalIP.name,
                result: 'NewExternalIPAddress',
                format: val => val,
            },
            {
                func: 'getExternalIPv6Address',
                state: STATES.externalIPv6.name,
                result: 'NewExternalIPv6Address',
                format: val => val,
            },
            {
                func: 'getExternalIPv6Prefix',
                state: STATES.externalIPv6Prefix.name,
                result: 'NewIPv6Prefix',
                format: val => val,
            },
            { func: 'getWLAN', state: STATES.wlan24.name, result: 'NewEnable', format: val => !!~~Number(val) },
            { func: 'getWLAN5', state: STATES.wlan50.name, result: 'NewEnable', format: val => !!~~Number(val) },
            { func: 'getWLANGuest', state: STATES.wlanGuest.name, result: 'NewEnable', format: val => !!~~Number(val) },
        ];
        let i = 0;

        const doIt = (): void => {
            if (i >= names.length) {
                this.devStates.set('reboot', false);
                this.devices.update(err => {
                    if (err && err !== -1) {
                        this.log.error(`updateAll: ${err as string}`);
                    }

                    // the timer starts the next poll even if the box never answers
                    const guarded = this.callbackTimers.wrap<null>(3000, () => {
                        if (this.config.pollingInterval) {
                            if (this.pollingTimer) {
                                this.clearTimeout(this.pollingTimer);
                            }
                            this.pollingTimer =
                                this.setTimeout(() => {
                                    this.pollingTimer = null;
                                    this.updateAll();
                                }, this.config.pollingInterval * 1000) ?? null;
                        }
                    });
                    this.updateDeflections(() => guarded(null, null));
                });
                return;
            }

            const name = names[i++];
            const client = this.tr064Client as unknown as Record<
                string,
                ((cb: (err: TR064Error | string | null, res: ActionResult) => void) => void) | undefined
            >;
            const read = client[name.func];

            if (typeof read !== 'function') {
                doIt();
                return;
            }

            read(
                this.callbackTimers.wrap<ActionResult>(3000, (err, res) => {
                    if (!err && res) {
                        this.devStates.set(name.state, name.format(res[name.result]));
                    }
                    this.setTimeout(doIt, 10);
                }),
            );
        };

        this.tr064Client.setABIndex();

        if (this.config.useDevices) {
            this.updateDevices(doIt);
        } else {
            doIt();
        }
    }

    /** Detects the presence of a device by its mDNS announcements */
    private runMDNS(): void {
        if (!this.config.useMDNS) {
            return;
        }

        const dev = new CDevice(this.devices, CHANNEL_DEVICES, '');
        const mdns = MulticastDns();

        mdns.on('message', (message, rinfo) => {
            if (!message || !rinfo) {
                return;
            }
            if (this.ipActive[rinfo.address] !== false) {
                return;
            }
            this.ipActive[rinfo.address] = true;

            const d = this.config.devices.find(device => device.ip === rinfo.address);
            if (d) {
                dev.setChannelEx(d.name);
                this.setActive(dev, true);
                this.devices.update();
                this.log.debug(`mDNS: ${rinfo.address} is active again`);
            }
        }).run();
    }

    /** Brings the configuration into the form which the adapter expects */
    private normalizeConfigVars(): void {
        if (!this.config.calllists) {
            this.config.calllists = this.ioPack.native.calllists;
        }
        normalizeConfig(this.config.calllists);
        this.log.debug(`Calllist Config after normalizing: ${JSON.stringify(this.config.calllists)}`);

        this.config.pollingInterval = ~~Number(this.config.pollingInterval);
        this.config.port = ~~Number(this.config.port);
        this.config.useCallMonitor = !!~~Number(this.config.useCallMonitor);
        this.config.useDevices = !!~~Number(this.config.useDevices);
        this.config.usePhonebook = !!~~Number(this.config.usePhonebook);

        if (this.config.useMDNS === undefined) {
            this.config.useMDNS = true;
        }
        if (this.config.useDeflectionOptions === undefined) {
            this.config.useDeflectionOptions = true;
        }
    }

    private async main(): Promise<void> {
        this.devStates = new CDevice(this.devices, '', '');
        this.devStates.setDevice(CHANNEL_STATES, {
            common: { name: 'States and commands', role: 'device' },
            native: {},
        });

        this.normalizeConfigVars();
        this.deleteUnusedDevices();
        this.phonebook = new Phonebook(this);
        await this.systemData.load();

        this.tr064Client = new TR064Client(
            this,
            this.config.user,
            this.config.password,
            this.config.ip || this.config.iporhost,
            this.config.port,
        );

        this.tr064Client.init(err => {
            this.initError = err;
            if (err) {
                this.log.error(`${err as string} - ${JSON.stringify(err)}`);
                this.log.error('~');
                this.log.error('~~ Fatal error. Can not connect to your FritzBox.');
                this.log.error('~~ If configuration, network, IP address, etc. ok, try to restart your FritzBox');
                this.log.error('~');
                this.terminate('Fatal error. Can not connect to your FritzBox.', 1);
                return;
            }

            this.tr064Client.refreshCalllist();
            this.createObjects();

            this.createConfiguredDevices(() => {
                this.phonebook.start(this.tr064Client.sslDevice, { return: !this.config.usePhonebook }, () => {
                    if (this.pollingTimer) {
                        this.clearTimeout(this.pollingTimer);
                    }
                    this.pollingTimer =
                        this.setTimeout(() => {
                            this.pollingTimer = null;
                            this.updateAll();
                        }, 2000) ?? null;

                    if (this.config.useCallMonitor) {
                        this.callMonitor = new CallMonitor(this, this.devices, this.phonebook);
                    }
                    this.runMDNS();

                    this.subscribeStates('*');
                });
            });

            if (this.config.useDeflectionOptions) {
                this.deflections = new Deflections(this.tr064Client.sslDevice, this, this.devices);
            }
        });
    }
}

// http://192.168.1.1:49000/tr64desc.xml

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Tr064Adapter(options);
} else {
    // otherwise start the instance directly
    (() => new Tr064Adapter())();
}
