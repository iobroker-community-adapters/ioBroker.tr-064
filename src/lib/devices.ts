/**
 * Object and state cache of the adapter.
 *
 * `Devices` keeps a copy of all objects and values of the own namespace so that only really
 * changed values are written. `CDevice` collects new objects in a list; `update()` creates the
 * missing objects and writes the changed values.
 */
import { dcs, forEachObjSync, fullExtend, hasProp, normalizedName, valType } from './utils';
import type { Tr064Adapter } from '../main';

/** Object as it is kept in the cache: an ioBroker object plus its last known value */
export interface DeviceObject {
    _id?: string;
    type?: ioBroker.ObjectType;
    common?: Record<string, any>;
    native?: Record<string, any>;
    val?: ioBroker.StateValue;
}

/** Value or complete object, as it can be passed to `CDevice.set()` */
export type ValueOrObject = DeviceObject | ioBroker.StateValue | undefined;

/** Sets `common.name` of an object without losing the rest of `common` */
function setObjectName(obj: DeviceObject, name: string): void {
    if (obj.common === undefined) {
        obj.common = { name };
    } else {
        obj.common.name = name;
    }
}

/** Converts a value into an object with `val`, or takes over the given object */
function val2obj(valOrObj: ValueOrObject, showName?: string): DeviceObject {
    let obj: DeviceObject;

    if (typeof valOrObj === 'object' && valOrObj !== null) {
        obj = valOrObj;
    } else {
        obj = {};
        if (valOrObj !== undefined) {
            obj.val = valType(valOrObj);
        }
    }

    if (showName && !hasProp(obj, 'common.name')) {
        setObjectName(obj, showName);
    }

    return obj;
}

export class Devices {
    /** Objects which are waiting to be written by `update()` */
    public list: DeviceObject[] = [];
    /** The root device - everything without an own device name is created below it */
    public readonly root: CDevice;

    private readonly adapter: Tr064Adapter;
    private readonly objects: Record<string, DeviceObject> = {};

    /** Namespace of the adapter, e.g. `tr-064.0` */
    public get namespace(): string {
        return this.adapter.namespace;
    }

    public constructor(adapter: Tr064Adapter, onReady?: (result?: unknown) => void) {
        this.adapter = adapter;
        this.root = new CDevice(this, '');
        this.readAllExistingObjects(onReady);
    }

    public has(id: string, prop?: string): boolean {
        const b = Object.prototype.hasOwnProperty.call(this.objects, id);
        if (prop === undefined) {
            return b;
        }
        return b && this.objects[id] !== null && Object.prototype.hasOwnProperty.call(this.objects[id], prop);
    }

    public get(id: string): DeviceObject | undefined {
        return this.objects[id];
    }

    public remove(id: string): void {
        delete this.objects[id];
    }

    public setraw(id: string, obj: DeviceObject): void {
        this.objects[id] = obj;
    }

    /** Like `get()`, but the ID may also contain the namespace */
    public getobjex(id: string): DeviceObject | undefined {
        const obj = this.get(id);
        if (obj || !this.adapter.namespace) {
            return obj;
        }
        return this.objects[id.substring(this.adapter.namespace.length + 1)];
    }

    public getval(id: string, defaultValue?: ioBroker.StateValue): ioBroker.StateValue | undefined {
        const o = this.get(id);
        if (o && o.val !== undefined) {
            return o.val;
        }
        return defaultValue;
    }

    public createObjectNotExists(id: string, obj: DeviceObject, callback?: (err?: Error | null) => void): void {
        let val: ioBroker.StateValue | undefined;
        const newobj: DeviceObject = {
            type: 'state',
            common: {
                name: id,
                type: 'string',
                role: obj.type || 'state',
            },
            native: {},
        };

        fullExtend(newobj, obj);

        if (obj.val !== undefined) {
            newobj.common!.type = typeof obj.val;
            val = obj.val;
            delete newobj.val;
        }

        void this.adapter.setObjectNotExists(id, newobj as ioBroker.SettableObject, err => {
            if (!err) {
                this.objects[newobj._id!] = newobj;
                if (val !== undefined) {
                    this.setState(newobj._id!, val, true);
                }
            }
            if (typeof callback === 'function') {
                callback(err);
            }
        });
    }

    public setState(id: string, val: ioBroker.StateValue | undefined, ack = true): void {
        const obj = this.objects[id];
        if (val !== undefined) {
            if (obj) {
                obj.val = val;
            }
        } else {
            val = obj?.val;
        }

        void this.adapter.setState(id, val as ioBroker.StateValue, ack);
    }

    /** Creates the object if it does not exist yet, otherwise writes the value if it changed */
    public setStateEx(id: string, newObj: ValueOrObject, ack = true, callback?: (result?: unknown) => void): void {
        const obj: DeviceObject = typeof newObj === 'object' && newObj !== null ? newObj : { val: newObj };

        if (!this.has(id)) {
            this.createObjectNotExists(id, obj, err => {
                if (typeof callback === 'function') {
                    callback(err || 0);
                }
            });
        } else {
            if (this.objects[id].val !== obj.val) {
                this.setState(id, obj.val, ack);
            }
            if (typeof callback === 'function') {
                callback(0);
            }
        }
    }

    /** Writes all collected objects and values. Without `list` the own list is used and cleared */
    public update(list?: DeviceObject[] | ((result?: unknown) => void), callback?: (result?: unknown) => void): void {
        if (typeof list === 'function') {
            callback = list;
            list = undefined;
        }

        if (!list || this.list === list) {
            list = this.list.slice();
            this.list.length = 0;
        }

        if (!list.length) {
            if (typeof callback === 'function') {
                callback(-1);
            }
            return;
        }

        forEachObjSync(list, (obj, doit) => this.setStateEx(obj._id!, obj, true, doit), callback);
    }

    /** Reads all existing objects and states of the own namespace into the cache */
    public readAllExistingObjects(callback?: (result?: unknown) => void): void {
        this.adapter.getForeignStates(`${this.adapter.namespace}.*`, (err, states) => {
            if (err || !states) {
                if (typeof callback === 'function') {
                    callback(-1);
                }
                return;
            }

            const namespaceLength = this.adapter.namespace.length + 1;

            for (const fullId in states) {
                const id = fullId.substring(namespaceLength);
                const as = id.split('.');
                let s = as[0];

                for (let i = 1; i < as.length; i++) {
                    if (!this.has(s)) {
                        this.setraw(s, {});
                    }
                    s += `.${as[i]}`;
                }

                this.setraw(id, { val: states[fullId] ? states[fullId].val : null });
            }

            const takeOver = (list: ioBroker.Object[] | undefined): void => {
                if (!list) {
                    return;
                }
                for (let i = 0; i < list.length; i++) {
                    const id = list[i]._id.substring(namespaceLength);
                    const o: DeviceObject = { common: { name: list[i].common.name } };
                    if (!this.objects[id]) {
                        this.objects[id] = {};
                    }
                    if (list[i].native) {
                        o.native = list[i].native;
                    }
                    fullExtend(this.objects[id], o);
                }
            };

            this.adapter.getDevices((err, devices) => {
                if (err || !devices) {
                    if (typeof callback === 'function') {
                        callback(-1);
                    }
                    return;
                }
                takeOver(devices);

                this.adapter.getChannels('', (err, channels) => {
                    if (err || !channels) {
                        if (typeof callback === 'function') {
                            callback(-1);
                        }
                        return;
                    }
                    takeOver(channels);
                    if (typeof callback === 'function') {
                        callback(0);
                    }
                });
            });
        });
    }
}

/**
 * Cursor on one device/channel of the cache.
 *
 * `setDevice()` and `setChannel()` set the position, `set()` writes a state below it. The objects
 * are only collected in `list` until `update()` is called.
 */
export class CDevice {
    public list: DeviceObject[];

    private readonly devices: Devices;
    private deviceName = '';
    private channelName = '';

    public constructor(devices: Devices, name: string, showName?: string | DeviceObject, list?: DeviceObject[]) {
        this.devices = devices;
        this.list = list === undefined ? devices.list : list;

        this.setDevice(
            name,
            typeof showName === 'string' ? (showName ? { common: { name: showName } } : undefined) : showName,
        );
    }

    /** Adds the object to the list, or merges it into an entry which is already there */
    private push(obj: DeviceObject): DeviceObject {
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i]._id === obj._id) {
                return fullExtend(this.list[i], obj);
            }
        }
        this.list.push(obj);

        return obj;
    }

    public setDevice(name: string, options?: DeviceObject): DeviceObject | undefined {
        this.channelName = '';
        if (!name) {
            return undefined;
        }
        this.deviceName = normalizedName(name);
        const obj: DeviceObject = { type: 'device', _id: this.deviceName };
        if (options) {
            Object.assign(obj, options);
        }

        return this.push(obj);
    }

    public setChannel(name?: string, showNameOrObject?: string | DeviceObject): DeviceObject | undefined {
        if (name === undefined) {
            this.channelName = '';
            return undefined;
        }

        this.channelName = name;

        return this.pushChannel(name, showNameOrObject);
    }

    /** Like `setChannel()`, but the channel name is converted into a valid object ID */
    public setChannelEx(name?: string, showNameOrObject?: string | DeviceObject): DeviceObject | undefined {
        if (name === undefined) {
            this.channelName = '';
            return undefined;
        }

        this.channelName = normalizedName(name);

        return this.pushChannel(name, showNameOrObject);
    }

    private pushChannel(name: string, showNameOrObject?: string | DeviceObject): DeviceObject | undefined {
        const id = dcs(this.deviceName, this.channelName);
        if (this.devices.has(id)) {
            return undefined;
        }

        let obj: DeviceObject;
        if (typeof showNameOrObject === 'object' && showNameOrObject !== null) {
            obj = { type: 'channel', _id: id, common: { name } };
            if (showNameOrObject.common) {
                obj.common = showNameOrObject.common;
            }
            if (showNameOrObject.native) {
                obj.native = showNameOrObject.native;
            }
        } else {
            obj = { type: 'channel', _id: id, common: { name: showNameOrObject || name } };
        }

        return this.push(obj);
    }

    /** Splits an ID with dots into device, channel and state and adds the state */
    private split(id: string, valOrObj: ValueOrObject, showName?: string): DeviceObject | undefined {
        const ar = (id && id[0] === '.' ? id.substring(1) : dcs(this.deviceName, this.channelName, id)).split('.');
        const dName = this.deviceName;
        const cName = this.channelName;
        let ret: DeviceObject | undefined;

        switch (ar.length) {
            case 3:
                this.setDevice(ar.shift()!);
            // BF: Hope it is desired without break here
            // eslint-disable-next-line no-fallthrough
            case 2:
                this.setChannel(ar.shift());
            // BF: Hope it is desired without break here
            // eslint-disable-next-line no-fallthrough
            default:
                ret = this.add(ar[0], valOrObj, showName);
                this.deviceName = dName;
                this.channelName = cName;
                return ret;
        }
    }

    private add(name: string, valOrObj: ValueOrObject, showName?: string): DeviceObject | undefined {
        if (valOrObj === null) {
            return undefined;
        }

        if (name.includes('.')) {
            return this.split(name, valOrObj, showName);
        }

        const obj = val2obj(valOrObj, showName || name);
        obj._id = dcs(this.deviceName, this.channelName, name);
        obj.type = 'state';

        return this.push(obj);
    }

    /**
     * Writes a state below the current device/channel.
     *
     * Returns the created object if it did not exist yet, `true` if the value changed and
     * `false` if it was already there with this value.
     */
    public set(id: string, newObj: ValueOrObject, showName?: string): DeviceObject | boolean | undefined {
        if (newObj === undefined || newObj === null) {
            return undefined;
        }

        const _id = dcs(this.deviceName, this.channelName, id);
        const known = this.devices.get(_id);

        if (!known) {
            return this.add(id, newObj, showName);
        }

        const val =
            typeof newObj === 'object' && newObj !== null && newObj.val !== undefined
                ? newObj.val
                : (newObj as ioBroker.StateValue);

        if (known.val !== val) {
            this.devices.setState(_id, val, true);
            return true;
        }

        return false;
    }

    public getobjex(id: string): DeviceObject | undefined {
        return this.devices.getobjex(dcs(this.deviceName, this.channelName, id));
    }

    public setraw(id: string, val: ioBroker.StateValue): void {
        const obj = this.getobjex(id);
        if (obj) {
            obj.val = val;
        }
    }

    public get(channel: string, id?: string): DeviceObject | undefined {
        const _id =
            id === undefined ? dcs(this.deviceName, this.channelName, channel) : dcs(this.deviceName, channel, id);

        return this.devices.get(_id);
    }

    /** Only creates the state if it does not exist yet - an existing value is not overwritten */
    public createNew(id: string, newObj: ValueOrObject, showName?: string): void {
        if (this.get(id)) {
            return;
        }
        this.set(id, newObj, showName);
    }

    public setAndUpdate(id: string, newObj: ValueOrObject, cb?: (result?: unknown) => void): void {
        this.set(id, newObj);
        this.update(cb);
    }

    /** Resets a state to the empty value of its type - used for button-like states */
    public clear(id: string): void {
        const prefix = `${this.devices.namespace}.`;
        if (id.startsWith(prefix)) {
            id = id.substring(prefix.length);
        }
        const obj = this.devices.getobjex(id);
        if (obj === undefined) {
            return;
        }

        let value: ioBroker.StateValue;
        switch (typeof obj.val) {
            case 'string':
                value = '';
                break;
            case 'boolean':
                value = false;
                break;
            case 'number':
                value = 0;
                break;
            default:
                return;
        }

        this.setAndUpdate(id, value);
    }

    public update(callback?: (result?: unknown) => void): void {
        if (this.list.length > 0) {
            this.devices.update(this.list, callback);
        } else if (typeof callback === 'function') {
            callback();
        }
    }
}
