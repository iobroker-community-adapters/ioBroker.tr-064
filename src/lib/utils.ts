/** Helper functions which were spread over `main.js`, `lib/devices.js` and `lib/deflections.js` */
import type { Action, ActionCallback, TR064Error } from 'tr-O64';

/** Result of `getLastValidPropEx()` */
export interface InvalidPropInfo {
    obj: Record<string, unknown>;
    invalidName: string;
    errPath: string;
}

/** Extracts an attribute from an object by a path like `attr1.attr2.subAttr3` */
export function getProp<T = unknown>(obj: unknown, propString: string): T | undefined {
    if (!obj) {
        return undefined;
    }
    let current: unknown = obj;
    const ar = propString.split('.');

    for (let i = 0; i < ar.length; i++) {
        current = (current as Record<string, unknown>)[ar[i]];
        if (current === undefined) {
            return undefined;
        }
    }

    return current as T;
}

/** Checks if an object has the attribute with the path `attr1.attr2.subAttr3` */
export function hasProp(obj: unknown, propString: string): boolean {
    return getProp(obj, propString) !== undefined;
}

/** Determines which part of the path `propString` does not exist in `obj` */
export function getLastValidPropEx(obj: unknown, propString: string): InvalidPropInfo {
    const empty: InvalidPropInfo = { obj: {}, invalidName: '', errPath: '' };
    if (!obj) {
        return empty;
    }
    let current = obj as Record<string, unknown>;
    const ar = propString.split('.');

    for (let i = 0; i < ar.length; i++) {
        if (current[ar[i]] === undefined) {
            return { obj: current, invalidName: ar[i], errPath: ar.slice(i).join('.') };
        }
        current = current[ar[i]] as Record<string, unknown>;
    }

    return empty;
}

/**
 * Returns the function `root.<path>` if it exists.
 *
 * The services of a Fritz!Box depend on model and firmware, so every action has to be treated as
 * optional. If it does not exist, a function is returned which only calls the callback - this way
 * the calling code does not need a check around every single action.
 */
export function safeFunction(
    root: unknown,
    path: string,
    logger: ioBroker.Logger,
    log?: boolean | ((message: string) => void),
): Action {
    const cb = getProp(root, path);
    if (typeof cb === 'function') {
        return cb as Action;
    }

    if (log) {
        const err = getLastValidPropEx(root, path);
        const logFunction = typeof log === 'function' ? log : logger.debug.bind(logger);
        logFunction(`${err.errPath} is not a function (${path})`);
    }

    return function (params: unknown, callback?: unknown): void {
        const cb = typeof params === 'function' ? params : callback;

        if (typeof cb === 'function') {
            (cb as ActionCallback)(null, {});
        } else {
            logger.error(`${path} is not a function`);
        }
    };
}

/**
 * Collection of the timers which `wrap()` created.
 *
 * The wrapped callback is called either by the answer of the Fritz!Box or by the timeout,
 * whatever comes first. Without it a lost SOAP answer would stop the polling forever.
 */
export class CallbackTimers {
    private timers: Record<string, NodeJS.Timeout> = {};

    /**
     * Wraps `callback` so that it is called with the error `timeout` if the answer does not
     * arrive within `timeout` milliseconds.
     */
    public wrap<T>(
        timeout: number,
        callback: (err: TR064Error | string | null, data: T | null) => void,
    ): (err: TR064Error | string | null, data: T) => void {
        const id = `${Date.now()}_${Math.round(Math.random() * 10000)}`;
        let cb: ((err: TR064Error | string | null, data: T | null) => void) | null = callback;

        this.timers[id] = setTimeout(() => {
            delete this.timers[id];
            const timeoutCb = cb;
            cb = null;
            timeoutCb?.('timeout', null);
        }, timeout);

        return (err: TR064Error | string | null, data: T): void => {
            if (this.timers[id]) {
                clearTimeout(this.timers[id]);
                delete this.timers[id];
            }
            cb?.(err, data);
        };
    }

    /** Stops all pending timers - used on unload */
    public clearAll(): void {
        Object.keys(this.timers).forEach(id => clearTimeout(this.timers[id]));
        this.timers = {};
    }
}

/**
 * Brings a phone number into the form in which it is stored in the phone book.
 *
 * This was a prototype extension of `String` in the JavaScript version.
 */
export function normalizeNumber(number: string): string {
    return number.replace(/\+/g, '00').replace(/[^0-9*]/g, '');
}

const UMLAUTS: Record<string, string> = {
    ä: 'ae',
    ü: 'ue',
    ö: 'oe',
    Ä: 'Ae',
    Ö: 'Oe',
    Ü: 'Ue',
    ß: 'ss',
    ' ': '_',
    '.': '_',
};

/** Makes an object ID out of a device name: umlauts are written out, space and dot become `_` */
export function normalizedName(name: string): string {
    return name.replace(/[äüöÄÖÜß .]/g, $0 => UMLAUTS[$0]);
}

/** Makes a name comparable for the phone book search: only lower case letters remain */
export function normalizeName(name: string): string {
    return name
        .replace(/[äüöÄÖÜß]/g, p => UMLAUTS[p])
        .toLowerCase()
        .replace(/[^a-z]/g, '');
}

/**
 * Converts a value into the type it looks like.
 *
 * The Fritz!Box delivers everything as a string, but the states of this adapter have always been
 * created with the "real" type. Leading zeros are kept as string, so that phone numbers do not
 * become numbers.
 */
export function valType(val: unknown): ioBroker.StateValue {
    switch (val) {
        // fastest way for most states
        case true:
        case 'true':
            return true;
        case false:
        case 'false':
            return false;
        case '0':
            return 0;
        case '1':
            return 1;
        case '2':
            return 2;
        case '3':
            return 3;
        case '4':
            return 4;
        case '5':
            return 5;
        case '6':
            return 6;
        case '7':
            return 7;
        case '8':
            return 8;
        case '9':
            return 9;
    }
    const sVal = String(val);
    if (sVal !== '0' && sVal.startsWith('0') && !sVal.startsWith('0.')) {
        return sVal;
    }

    const number = parseInt(sVal, 10);
    if (number.toString() === sVal) {
        return number;
    }

    const float = parseFloat(sVal);
    if (float.toString() === sVal) {
        return float;
    }

    return val as ioBroker.StateValue;
}

/** Copies all attributes of `from` into `dest`, sub-objects are copied recursively */
export function fullExtend<T extends Record<string, any>>(dest: T, from: Record<string, any>): T {
    Object.getOwnPropertyNames(from).forEach(name => {
        if (typeof from[name] === 'object' && from[name] !== null) {
            if (typeof dest[name] !== 'object' || dest[name] === null) {
                (dest as Record<string, any>)[name] = {};
            }
            fullExtend(dest[name], from[name]);
        } else {
            const destination = Object.getOwnPropertyDescriptor(from, name);
            if (destination) {
                Object.defineProperty(dest, name, destination);
            }
        }
    });

    return dest;
}

/** Builds the object ID `device.channel.state`. A leading dot makes the ID absolute */
export function dcs(deviceName: string, channelName: string, stateName?: string): string {
    if (stateName === undefined) {
        stateName = channelName;
        channelName = '';
    }
    if (stateName[0] === '.') {
        return stateName.substring(1);
    }

    return [deviceName, channelName, stateName].filter(t => t).join('.');
}

/**
 * Works through `objects` one after the other. The next entry is only started when the callback
 * of the previous one was called.
 */
export function forEachObjSync<T>(
    objects: T[],
    func: (obj: T, done: (ret?: unknown) => void) => void,
    readyCallback?: (ret?: unknown) => void,
): void {
    const objs = objects.slice();

    function doIt(ret?: unknown): void {
        if (objs.length <= 0) {
            if (typeof readyCallback === 'function') {
                readyCallback(ret);
            }
            return;
        }
        func(objs.shift() as T, doIt);
    }

    doIt(-1);
}
