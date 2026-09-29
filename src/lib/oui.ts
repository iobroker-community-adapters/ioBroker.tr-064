/**
 * Manufacturer of a device from its MAC address.
 *
 * The box does not deliver a manufacturer - neither in the host list nor in the mesh list - so the
 * first bytes of the MAC are looked up in `data/oui.txt`, the merged registries of the IEEE
 * (`npm run update-oui`, see `tasks-oui.ts`). The file is sorted by the prefix and is binary
 * searched: no map of 50.000 entries has to be built, and a lookup costs a handful of comparisons.
 *
 * The file is read on the first lookup, i.e. only in an instance which really shows the mesh.
 *
 * A locally administered address (bit 0x02 of the first byte) is not registered anywhere: that is
 * the randomized MAC which phones use for a WLAN they do not trust. It is reported as such instead
 * of as an unknown manufacturer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** What is known about the MAC address of a device */
export interface VendorInfo {
    /** Name of the manufacturer, missing if the prefix is not registered */
    vendor?: string;
    /** A randomized (locally administered) address, which has no manufacturer */
    random?: boolean;
}

/** Lengths of the prefixes in the file, longest first: MA-S (36 bit), MA-M (28 bit), MA-L (24 bit) */
const PREFIX_LENGTHS = [9, 7, 6];

/** `undefined` while not read, `null` if the file is missing */
let table: string | null | undefined;
/** Offset of the first entry, the file starts with a comment line */
let firstEntry = 0;
/** Prefix -> name of the already resolved devices */
const resolved = new Map<string, string | undefined>();

/** Reads `data/oui.txt` once; `null` if it is not there, the lookup is then simply without result */
function load(onError?: (error: string) => void): string | null {
    if (table === undefined) {
        // build/lib/oui.js -> <adapter>/data/oui.txt
        const file = join(__dirname, '..', '..', 'data', 'oui.txt');
        try {
            table = readFileSync(file, 'utf8');
            const start = table.indexOf('\n');
            firstEntry = start >= 0 ? start + 1 : 0;
        } catch (error: unknown) {
            table = null;
            onError?.(`Cannot read the manufacturer list ${file}: ${(error as Error).message}`);
        }
    }
    return table;
}

/** The key of the entry which starts at `start`, i.e. the text up to the tab */
function keyAt(text: string, start: number): string {
    const tab = text.indexOf('\t', start);
    return tab < 0 ? '' : text.slice(start, tab);
}

/**
 * Start of the entry which contains `position`.
 *
 * A line break at `position` ends the entry before it, therefore the search starts one character
 * earlier - otherwise the middle of the interval could jump behind its own end and the binary
 * search would not terminate.
 */
function lineStart(text: string, position: number): number {
    const previous = text.lastIndexOf('\n', Math.max(position - 1, 0));
    return previous < 0 ? firstEntry : Math.max(previous + 1, firstEntry);
}

/** Binary search for the entry `prefix` in the sorted file */
function find(text: string, prefix: string): string | undefined {
    let low = firstEntry;
    let high = text.length;

    while (low < high) {
        const start = lineStart(text, (low + high) >> 1);
        const key = keyAt(text, start);
        if (!key) {
            return undefined;
        }
        if (key === prefix) {
            const end = text.indexOf('\n', start);
            return text.slice(start + key.length + 1, end < 0 ? undefined : end);
        }
        if (key < prefix) {
            const next = text.indexOf('\n', start);
            if (next < 0) {
                return undefined;
            }
            low = next + 1;
        } else {
            high = start;
        }
    }
    return undefined;
}

/**
 * Manufacturer of a MAC address.
 *
 * @param mac the address in any notation, e.g. `AA:BB:CC:DD:EE:FF`
 * @param onError called once with the reason if the list cannot be read
 */
export function lookupVendor(mac: string, onError?: (error: string) => void): VendorInfo {
    const digits = (mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (digits.length < 6) {
        return {};
    }
    // bit 0x02 of the first byte: locally administered, i.e. a randomized address
    if (parseInt(digits.slice(0, 2), 16) & 0x02) {
        return { random: true };
    }

    const key = digits.slice(0, 9);
    if (resolved.has(key)) {
        const vendor = resolved.get(key);
        return vendor ? { vendor } : {};
    }

    const text = load(onError);
    let vendor: string | undefined;
    if (text) {
        for (const length of PREFIX_LENGTHS) {
            vendor = find(text, digits.slice(0, length));
            if (vendor) {
                break;
            }
        }
    }
    resolved.set(key, vendor);
    return vendor ? { vendor } : {};
}

/** Forgets the list and the resolved addresses (the tests and `unload`) */
export function resetVendors(): void {
    table = undefined;
    firstEntry = 0;
    resolved.clear();
}
