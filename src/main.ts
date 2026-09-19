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
import type { LoginError } from './lib/tr064';
import { CallbackTimers, macsOverlap, normalizedName } from './lib/utils';
import { buildMeshTopology, findAccessPoint } from './lib/mesh';
import type { MeshList } from './lib/mesh';
import {
    CHANNEL_CALLLISTS,
    CHANNEL_CALLMONITOR,
    CHANNEL_DEVICELOG,
    CHANNEL_DEVICES,
    CHANNEL_PHONEBOOK,
    CHANNEL_STATES,
    PB_STATES,
    STATES,
} from './lib/states';
import type { DeviceConfigEntry, DeviceLogEvent, DiscoveredDevice, HostEntry, MeshResponse } from './lib/types';

/** Default secret of `system.config` if the host has none */
const DEFAULT_SECRET = 'Zgfr56gFe87jJOM';

/** Milliseconds between two attempts to connect to the Fritz!Box */
const RECONNECT_INTERVAL = 30_000;

/** Milliseconds within which the connection (device and service descriptions) has to be set up */
const INIT_TIMEOUT = 60_000;

/**
 * Minimum milliseconds between two refreshes of the call lists and the answering machine messages
 * by the poll cycle. The call monitor refreshes right after every call; the poll cycle is the
 * fallback for an instance without call monitor or with a call monitor connection which was lost,
 * and it notices messages which were listened to in the meantime.
 */
const CALLS_REFRESH_INTERVAL = 60_000;

/** Milliseconds between two readings of the mesh topology and of the event log of the box */
const SLOW_REFRESH_INTERVAL = 60_000;

/** Number of events of the event log which are kept in `deviceLog.json` */
const DEVICE_LOG_ENTRIES = 50;

/** Method of `TR064Client` which is called when a state below `states` is written */
type StateFunction = (val: ioBroker.StateValue, callback?: () => void) => boolean | void;

/** One entry of the list which `updateAll()` reads from the box */
interface PollEntry {
    func: string;
    state: string;
    result: string;
    format: (val: string) => ioBroker.StateValue;
    /** Further states which are written from the same answer */
    more?: { state: string; result: string; format: (val: string) => ioBroker.StateValue }[];
}

const toBoolean = (val: string): boolean => !!~~Number(val);
const toNumber = (val: string): number => Number(val) || 0;

/** Text of an error of a callback, including the `timeout` of `CallbackTimers` */
function errorText(err: unknown): string {
    if (err === 'timeout') {
        return 'no answer';
    }
    return err instanceof Error ? err.message : String(err);
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
    private mdns: ReturnType<typeof MulticastDns> | null = null;

    /** Result of the last discovery for the admin */
    private allDevices: DiscoveredDevice[] = [];
    private allDevicesOnlyActive: boolean | undefined = undefined;
    /** Last known state per IP address - used by the mDNS detection */
    private readonly ipActive: Record<string, boolean> = {};

    private initError: TR064Error | string | null | undefined = null;
    /** Last value written into `info.connection` - `connected` is taken by the base class */
    private boxConnected: boolean | undefined = undefined;
    /** Number of connection attempts which failed in a row */
    private connectAttempts = 0;
    private connectTimer: ioBroker.Timeout | null = null;
    private pollingTimer: ioBroker.Timeout | null = null;
    private refreshCalllistTimeout: ioBroker.Timeout | null = null;
    /** `Date.now()` of the last refresh of the call lists and messages */
    private lastCallsRefresh = 0;
    private lastSlowRefresh = 0;
    /** Last mesh topology which was read, for the admin (issue #383) */
    private meshTopology: MeshResponse | null = null;
    /** Reading the mesh list failed - it is logged once */
    private meshErrorLogged = false;
    /** Reading the event log failed - it is logged once */
    private deviceLogErrorLogged = false;
    /** Keys of the events of the last reading of the event log, and the time of its newest event */
    private deviceLogKeys: Set<string> | null = null;
    private deviceLogNewest = '';

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
            if (this.connectTimer) {
                this.clearTimeout(this.connectTimer);
                this.connectTimer = null;
            }
            this.tr064Client?.clearRingTimeout();
            this.callbackTimers.clearAll();
            this.callMonitor?.close();
            this.callMonitor = null;
            this.mdns?.close();
            this.mdns = null;
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
            this.log.warn('tr-064 adapter is not connected to a FritzBox, the command is ignored');
            return;
        }

        // the value may be a password, a phone number or a name - it is only logged with level silly
        this.log.debug(`State changed: ${id} (ack=${state.ack})`);
        this.log.silly(`State changed: ${id} = ${JSON.stringify(state)}`);

        if (!state.ack) {
            this.onCommandState(id, state);
        } else if (id.includes('callmonitor.lastCall.timestamp')) {
            // If multiple updates come we wait for 100ms stability
            if (this.refreshCalllistTimeout) {
                this.clearTimeout(this.refreshCalllistTimeout);
            }
            this.refreshCalllistTimeout =
                this.setTimeout(() => {
                    this.refreshCalllistTimeout = null;
                    this.refreshCalls();
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

        this.log.debug(`onMessage: ${obj.command} from ${obj.from}`);
        this.log.silly(`onMessage: ${JSON.stringify(obj)}`);

        switch (obj.command) {
            case 'mesh': {
                // the mesh topology for the admin component (issue #383)
                if (!obj.callback) {
                    return;
                }
                const answer = (response: MeshResponse): void => {
                    this.sendTo(obj.from, obj.command, response, obj.callback);
                };
                if (!this.boxConnected || !this.tr064Client) {
                    answer({ error: 'not connected', nodes: [], links: [] });
                    return;
                }
                this.tr064Client.getMeshList(
                    this.callbackTimers.wrap<MeshList | undefined>(15_000, (err, list) => {
                        if (err || !list) {
                            const error = errorText(err);
                            answer({
                                error: error === 'not supported' ? error : error || 'no mesh list',
                                nodes: [],
                                links: [],
                            });
                            return;
                        }
                        this.meshTopology = buildMeshTopology(list, this.config.devices);
                        answer(this.meshTopology);
                    }),
                );
                return;
            }

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
                    this.log.debug(`Discovery result: ${this.allDevices.length} devices`);
                    this.log.silly(`Discovery result: ${JSON.stringify(this.allDevices)}`);
                    this.sendDiscoveryResult(obj, this.allDevices, asNative, configured);
                    return;
                }

                if (!this.boxConnected || !this.tr064Client) {
                    // the search is always answered, otherwise the admin shows a timeout
                    this.log.warn('Search for devices: the adapter is not connected to the FritzBox');
                    this.sendDiscoveryResult(obj, [], asNative, configured);
                    return;
                }

                this.tr064Client.getHostList((err, hosts) => {
                    if (err) {
                        this.log.warn(`Search for devices: ${err.message}`);
                    }
                    const found: DiscoveredDevice[] = hosts
                        .map(host => ({
                            name: host.NewHostName,
                            ip: host.NewIPAddress,
                            mac: host.NewMACAddress,
                            active: !!~~Number(host.NewActive),
                        }))
                        .filter(device => device.mac && (!onlyActive || device.active));

                    if (!err) {
                        this.allDevices = found;
                        this.allDevicesOnlyActive = onlyActive;
                    }
                    this.log.debug(`Discovery result: ${found.length} devices`);
                    this.log.silly(`Discovery result: ${JSON.stringify(found)}`);
                    this.sendDiscoveryResult(obj, found, asNative, configured);
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
            const known = devices.find(entry => macsOverlap(entry.mac || '', device.mac || ''));
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
            // the states of a band which the box does not have are not created
            if (
                (i.startsWith('wlan50') && !this.tr064Client.wlan50) ||
                (i.startsWith('wlan52') && !this.tr064Client.wlan52) ||
                (i.startsWith('wlan60') && !this.tr064Client.wlan60)
            ) {
                continue;
            }
            const st = { ...STATES[i] };
            this.devStates.createNew(st.name, st);
        }

        this.devices.update(cb);
    }

    /** The configured device with this MAC address (or one of these addresses) */
    private findDeviceByMac(mac: string): DeviceConfigEntry | undefined {
        return this.config.devices.find(entry => macsOverlap(entry.mac || '', mac));
    }

    /**
     * Name of the channel of a configured device below `devices`: the name of the configuration
     * with `useConfiguredNames`, otherwise (and for a device without name) the name in the box.
     *
     * @param entry the device of the configuration
     * @param hostName the name of the device in the box, by default the one of the last answer
     */
    private deviceChannelName(entry: DeviceConfigEntry, hostName = entry.lastResult?.NewHostName): string | undefined {
        return (this.config.useConfiguredNames && entry.channelName) || hostName || undefined;
    }

    /** Moves `dev` to the channel of a configured device, the channel is created if it is missing */
    private setDeviceChannel(dev: CDevice, entry: DeviceConfigEntry, device: HostEntry): void {
        const name = this.deviceChannelName(entry, device.NewHostName) || '';
        dev.setChannelEx(name, {
            common: { name: `${name} (${device.NewIPAddress})`, role: 'channel' },
            native: { mac: entry.mac },
        });
    }

    /**
     * Gives every configured device the name of its channel, if the objects are named after the
     * configuration. Characters which are not allowed in an object ID are replaced, a name which
     * occurs twice gets a number, so that two devices never write into the same channel.
     */
    private prepareDeviceNames(): void {
        if (!this.config.useConfiguredNames) {
            return;
        }
        const used = new Set<string>();
        const duplicates = new Set<string>();

        for (const entry of this.config.devices) {
            const name = (entry.name || '').trim().replace(this.FORBIDDEN_CHARS, '_');
            if (!name) {
                continue;
            }
            let channelName = name;
            for (let n = 2; used.has(normalizedName(channelName)); n++) {
                channelName = `${name}_${n}`;
                duplicates.add(entry.name);
            }
            used.add(normalizedName(channelName));
            entry.channelName = channelName;
        }

        if (duplicates.size) {
            this.log.warn(
                `Several devices in the tab "Devices" have the same name (${[...duplicates].join(', ')}), their objects get a number at the end. Give them different names`,
            );
        }
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

    /**
     * Removes the objects of devices which are not configured any more.
     *
     * With `useConfiguredNames` also the channel of a configured device which has another name -
     * the objects were created with the name in the box before, or the device was renamed.
     */
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
                const channel = o.id.substring(ch.length + 1);
                if (!native?.mac) {
                    // old device, without native.mac
                    if (!channel.includes('.')) {
                        toDelete.push(o.id);
                    }
                    return;
                }
                const entry = this.findDeviceByMac(native.mac);
                if (!entry) {
                    toDelete.push(o.id);
                } else if (
                    this.config.useConfiguredNames &&
                    entry.channelName &&
                    channel !== normalizedName(entry.channelName)
                ) {
                    this.log.info(
                        `Device "${entry.name}": the objects are created with the name of the tab "Devices" now, the old objects are deleted`,
                    );
                    this.log.silly(`Device "${entry.name}": ${o.id} is deleted`);
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

        if (this.config.jsonDeviceList && !this.config.devices.length) {
            this.log.info(
                '"Create JSON device list" is switched on, but no devices are configured in the tab "Devices" - the list stays empty',
            );
        }

        this.tr064Client.forEachConfiguredDevice(
            (device: HostEntry | null, entry?: DeviceConfigEntry) => {
                if (!device || !entry) {
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

                this.setDeviceChannel(dev, entry, device);
                this.setActive(dev, device.NewActive, device.NewIPAddress, device.NewMACAddress);
                arr.push({
                    active: !!~~Number(device.NewActive),
                    ip: device.NewIPAddress,
                    name: this.deviceChannelName(entry, device.NewHostName) || '',
                    mac: entry.mac,
                });
            },
            // a device which the box does not know is listed as inactive instead of being left out
            entry => arr.push({ active: false, ip: entry.ip, name: entry.name, mac: entry.mac }),
        );
    }

    /** Updates the presence states of all configured devices */
    private updateDevices(callback?: (result?: unknown) => void): void {
        this.log.debug('updateDevices');
        const dev = new CDevice(this.devices, CHANNEL_DEVICES, '');
        const arr: DiscoveredDevice[] = [];

        this.tr064Client.forEachConfiguredDevice(
            (device: HostEntry | null, entry?: DeviceConfigEntry) => {
                if (!device || !entry) {
                    if (this.config.jsonDeviceList) {
                        dev.setChannelEx();
                        dev.set('jsonDeviceList', JSON.stringify(arr));
                    }
                    this.devices.update(callback);
                    return;
                }

                this.log.silly(`forEachConfiguredDevice: ${JSON.stringify(device)}`);
                this.setDeviceChannel(dev, entry, device);
                this.setActive(dev, device.NewActive, device.NewIPAddress, device.NewMACAddress);

                if (this.config.jsonDeviceList) {
                    arr.push({
                        active: !!~~Number(device.NewActive),
                        ip: device.NewIPAddress,
                        name: this.deviceChannelName(entry, device.NewHostName) || '',
                        mac: entry.mac,
                    });
                }
            },
            entry => {
                if (this.config.jsonDeviceList) {
                    arr.push({ active: false, ip: entry.ip, name: entry.name, mac: entry.mac });
                }
            },
        );
    }

    private updateDeflections(callback: () => void): void {
        if (this.deflections) {
            this.deflections.get(callback);
        } else {
            callback();
        }
    }

    /** Reads the call lists and the number of new answering machine messages, and remembers when */
    private refreshCalls(): void {
        this.lastCallsRefresh = Date.now();
        this.tr064Client.refreshCalllist();
        this.tr064Client.refreshTAMMessages();
    }

    /** Reads the mesh topology and the event log of the box, and remembers when */
    private refreshSlow(): void {
        this.lastSlowRefresh = Date.now();
        if (this.config.useMesh && this.config.useDevices && this.config.devices.length) {
            this.refreshAccessPoints();
        }
        if (this.config.useDeviceLog) {
            this.refreshDeviceLog();
        }
    }

    /**
     * Writes `accessPoint` and `connection` of every configured device: the box or repeater it is
     * connected to and the band or LAN (issue #383).
     */
    private refreshAccessPoints(): void {
        this.tr064Client.getMeshList(
            this.callbackTimers.wrap<MeshList | undefined>(15_000, (err, list) => {
                if (err || !list) {
                    if (!this.meshErrorLogged) {
                        this.meshErrorLogged = true;
                        this.log.info(
                            `Cannot read the mesh topology of the FritzBox, the access points of the devices are not shown: ${errorText(err)}`,
                        );
                    }
                    return;
                }
                this.meshErrorLogged = false;
                const topology = buildMeshTopology(list, this.config.devices);
                this.meshTopology = topology;

                const dev = new CDevice(this.devices, CHANNEL_DEVICES, '');
                for (const entry of this.config.devices) {
                    // the channel of a device exists only when the box knows it
                    if (!entry.lastResult) {
                        continue;
                    }
                    const accessPoint = findAccessPoint(topology, entry);
                    this.setDeviceChannel(dev, entry, entry.lastResult);
                    dev.set('accessPoint', {
                        val: accessPoint?.name ?? '',
                        common: {
                            name: 'Access point (FRITZ!Box or repeater)',
                            type: 'string',
                            role: 'text',
                            write: false,
                        },
                    });
                    dev.set('connection', {
                        val: accessPoint?.connection ?? '',
                        common: {
                            name: 'Connection: 2.4 GHz, 5 GHz, 6 GHz or LAN',
                            type: 'string',
                            role: 'text',
                            write: false,
                        },
                    });
                }
                this.devices.update();
            }),
        );
    }

    /**
     * Reads the event log of the box into `deviceLog.json` and writes the events which came since
     * the last reading into `deviceLog.newEvents` (issue #444). After a start the events up to the
     * last run are known from `deviceLog.json`.
     */
    private refreshDeviceLog(): void {
        const key = (e: DeviceLogEvent): string => `${e.date}|${e.time}|${e.id}|${e.msg}`;
        // `dd.mm.yy` and `hh:mm:ss` as sortable text
        const time = (e: DeviceLogEvent): string => {
            const m = /^(\d\d)\.(\d\d)\.(\d\d)$/.exec(e.date);
            return m ? `${m[3]}${m[2]}${m[1]}${e.time}` : '';
        };
        const newest = (events: DeviceLogEvent[]): string =>
            events.reduce((max, e) => (time(e) > max ? time(e) : max), '');

        this.tr064Client.getDeviceLog(
            this.callbackTimers.wrap<DeviceLogEvent[] | undefined>(15_000, (err, events) => {
                if (err || !events) {
                    if (!this.deviceLogErrorLogged) {
                        this.deviceLogErrorLogged = true;
                        this.log.info(`Cannot read the event log of the FritzBox: ${errorText(err)}`);
                    }
                    return;
                }
                this.deviceLogErrorLogged = false;

                if (!this.deviceLogKeys) {
                    let stored: DeviceLogEvent[] = [];
                    try {
                        const val = this.devices.getval(`${CHANNEL_DEVICELOG}.json`);
                        stored = typeof val === 'string' && val ? (JSON.parse(val) as DeviceLogEvent[]) : [];
                    } catch {
                        // a broken value is replaced below
                    }
                    const known = Array.isArray(stored) && stored.length ? stored : events;
                    this.deviceLogKeys = new Set(known.map(key));
                    this.deviceLogNewest = newest(known);
                }
                const keys = this.deviceLogKeys;
                const fresh = events.filter(e => !keys.has(key(e)) && time(e) >= this.deviceLogNewest);
                this.deviceLogKeys = new Set(events.map(key));
                this.deviceLogNewest = newest(events) || this.deviceLogNewest;

                // the events contain addresses and names
                this.log.debug(`Event log: ${events.length} events, ${fresh.length} new`);
                this.log.silly(`Event log new: ${JSON.stringify(fresh)}`);

                const dev = new CDevice(this.devices, CHANNEL_DEVICELOG, 'Event log');
                dev.set('json', {
                    val: JSON.stringify(events.slice(0, DEVICE_LOG_ENTRIES)),
                    common: { name: 'Last events of the event log', type: 'string', role: 'json', write: false },
                });
                if (fresh.length || !this.devices.get(`${CHANNEL_DEVICELOG}.newEvents`)) {
                    dev.set('newEvents', {
                        val: JSON.stringify(fresh),
                        common: {
                            name: 'Events since the last reading',
                            type: 'string',
                            role: 'json',
                            write: false,
                        },
                    });
                }
                this.devices.update();
            }),
        );
    }

    /** Reads everything from the box which is polled cyclically */
    private updateAll(): void {
        this.log.debug('in updateAll');

        if (Date.now() - this.lastCallsRefresh >= CALLS_REFRESH_INTERVAL) {
            this.refreshCalls();
        }
        if (Date.now() - this.lastSlowRefresh >= SLOW_REFRESH_INTERVAL) {
            this.refreshSlow();
        }

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
            {
                func: 'getWLAN',
                state: STATES.wlan24.name,
                result: 'NewEnable',
                format: toBoolean,
                // the state of the WLAN button - older firmware does not report it
                more: [{ state: STATES.wlan.name, result: 'NewX_AVM-DE_WLANGlobalEnable', format: toBoolean }],
            },
            { func: 'getWLAN5', state: STATES.wlan50.name, result: 'NewEnable', format: toBoolean },
            { func: 'getWLAN52', state: STATES.wlan52.name, result: 'NewEnable', format: toBoolean },
            { func: 'getWLAN6', state: STATES.wlan60.name, result: 'NewEnable', format: toBoolean },
            { func: 'getWLANGuest', state: STATES.wlanGuest.name, result: 'NewEnable', format: toBoolean },
            {
                func: 'getWANLink',
                state: STATES.wanAccessType.name,
                result: 'NewWANAccessType',
                format: val => String(val).replace(/^X_AVM-DE_/, ''),
                more: [
                    { state: STATES.wanLinkStatus.name, result: 'NewPhysicalLinkStatus', format: val => val },
                    { state: STATES.wanProvider.name, result: 'NewX_AVM-DE_Provider', format: val => val },
                    {
                        state: STATES.wanDownstreamMax.name,
                        result: 'NewLayer1DownstreamMaxBitRate',
                        format: toNumber,
                    },
                    { state: STATES.wanUpstreamMax.name, result: 'NewLayer1UpstreamMaxBitRate', format: toNumber },
                ],
            },
            {
                func: 'getWANTraffic',
                state: STATES.wanBytesSent.name,
                result: 'sent',
                format: toNumber,
                more: [
                    { state: STATES.wanBytesReceived.name, result: 'received', format: toNumber },
                    { state: STATES.wanSendRate.name, result: 'sendRate', format: toNumber },
                    { state: STATES.wanReceiveRate.name, result: 'receiveRate', format: toNumber },
                ],
            },
        ];
        let i = 0;
        let anySuccess = false;

        const doIt = (): void => {
            if (i >= names.length) {
                // the box is only counted as connected while it really answers
                void this.setConnected(anySuccess);
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

            // the methods of the client use `this`, so they must not be called detached
            read.call(
                this.tr064Client,
                this.callbackTimers.wrap<ActionResult>(3000, (err, res) => {
                    if (!err && res) {
                        anySuccess = true;
                        // a value which the box does not report is not written
                        for (const out of [name, ...(name.more || [])]) {
                            if (res[out.result] !== undefined) {
                                this.devStates.set(out.state, out.format(res[out.result]));
                            }
                        }
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
        this.mdns = mdns;

        mdns.on('message', (message, rinfo) => {
            if (!message || !rinfo) {
                return;
            }
            if (this.ipActive[rinfo.address] !== false) {
                return;
            }
            this.ipActive[rinfo.address] = true;

            const d = this.config.devices.find(device => device.ip === rinfo.address);
            // the same channel as the poll, not one of its own
            const channelName = d && this.deviceChannelName(d);
            if (d && channelName) {
                dev.setChannelEx(channelName);
                this.setActive(dev, true);
                this.devices.update();
                this.log.debug('mDNS: a configured device is active again');
                this.log.silly(`mDNS: ${d.name} (${rinfo.address}) is active again`);
            }
        });

        // The library keeps its sockets open (`setOptions()` forces a timeout of 0 without
        // `find`), so they have to be closed in `onUnload()`.
        mdns.run();
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
        // older instances do not have the option: their objects keep the names of the box
        this.config.useConfiguredNames = !!this.config.useConfiguredNames;
        if (this.config.useMesh === undefined) {
            this.config.useMesh = true;
        }
        this.config.useDeviceLog = !!this.config.useDeviceLog;
        this.config.updateUnchanged = !!this.config.updateUnchanged;
        if (!Array.isArray(this.config.phonebooksByNumber)) {
            this.config.phonebooksByNumber = [];
        }
        if (!Array.isArray(this.config.devices)) {
            this.config.devices = [];
        }
        this.prepareDeviceNames();
    }

    private async main(): Promise<void> {
        this.devStates = new CDevice(this.devices, '', '');
        this.devStates.setDevice(CHANNEL_STATES, {
            common: { name: 'States and commands', role: 'device' },
            native: {},
        });

        this.normalizeConfigVars();
        this.devices.updateUnchanged = this.config.updateUnchanged;
        this.deleteUnusedDevices();
        this.phonebook = new Phonebook(this);
        await this.systemData.load();

        await this.setObjectNotExistsAsync('info.connection', {
            type: 'state',
            common: {
                name: 'Connected to the Fritz!Box',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await this.setConnected(false);

        this.tr064Client = new TR064Client(
            this,
            this.config.user,
            this.config.password,
            this.config.ip || this.config.iporhost,
            this.config.port,
        );

        this.connect();
    }

    /**
     * Connects to the Fritz!Box.
     *
     * A box which cannot be reached is not a reason to stop: it may be rebooting or the network
     * may not be up yet. The attempt is therefore repeated until it works; only then the objects
     * are created and the polling starts.
     */
    private connect(): void {
        // without a limit, a description which the box never delivers would stop the adapter silently
        const initialized = this.callbackTimers.wrap<null>(INIT_TIMEOUT, err => {
            const error =
                err === 'timeout' ? `no complete answer from the FritzBox within ${INIT_TIMEOUT / 1000} seconds` : err;
            this.initError = error;

            if (error) {
                this.onConnectionFailed(error);
                return;
            }

            void this.setConnected(true);
            this.connectAttempts = 0;

            // the objects first, so that the refresh writes into objects with their full definition
            this.createObjects();
            this.devStates.set(STATES.boxModel.name, this.tr064Client.boxInfo.model);
            this.devStates.set(STATES.boxFirmware.name, this.tr064Client.boxInfo.firmware);
            this.refreshCalls();

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

        this.tr064Client.init(err => initialized(err ?? null, null));
    }

    /** Logs a failed connection attempt and schedules the next one */
    private onConnectionFailed(err: TR064Error | string): void {
        void this.setConnected(false);

        if (!this.connectAttempts) {
            // explain the problem once, the repeated attempts must not fill up the log
            this.log.error(`${err as string} - ${JSON.stringify(err)}`);
            this.log.error('~');
            if (typeof err === 'object' && (err as LoginError).loginRejected) {
                // a restart of the box does not help here (issue #527)
                this.log.error('~~ The FritzBox refused the login.');
                this.log.error(
                    '~~ Check user and password in the tab "Options" and that the user has the right for the FritzBox settings.',
                );
                this.log.error('~~ After wrong logins the FritzBox blocks further logins for a while.');
            } else {
                this.log.error('~~ Cannot connect to your FritzBox.');
                this.log.error('~~ If configuration, network, IP address, etc. ok, try to restart your FritzBox');
            }
            this.log.error(`~~ The connection is retried every ${RECONNECT_INTERVAL / 1000} seconds`);
            this.log.error('~');
        } else {
            this.log.debug(`Attempt ${this.connectAttempts + 1} to connect to the FritzBox failed: ${err as string}`);
        }
        this.connectAttempts++;

        if (this.connectTimer) {
            this.clearTimeout(this.connectTimer);
        }
        this.connectTimer =
            this.setTimeout(() => {
                this.connectTimer = null;
                this.connect();
            }, RECONNECT_INTERVAL) ?? null;
    }

    /** Writes `info.connection` if the state changed */
    private async setConnected(connected: boolean): Promise<void> {
        if (this.boxConnected === connected) {
            return;
        }
        this.boxConnected = connected;
        await this.setState('info.connection', connected, true);
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
