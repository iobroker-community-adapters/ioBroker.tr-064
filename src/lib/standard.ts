/**
 * The commands of the shared catalog of ioBroker.assistant (HELP.md: presence.getPersons, network.getClients,
 * network.guestWifi, phone.call, phone.hangup) which tr-064 answers next to its own ones. Only the mapping of the
 * parameters and the answers is here, so that it can be tested without a box.
 */
import { findAccessPoint } from './mesh';
import { normalizeMac } from './utils';
import type { HostEntry, MeshResponse } from './types';

/** `reason` of a failed standard command (rule 4 of the catalog) */
export type StandardReason = 'NOT_CONNECTED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'NOT_SUPPORTED' | 'BAD_REQUEST' | 'TIMEOUT';

/** Answer of a failed standard command */
export interface StandardError {
    error: string;
    reason?: StandardReason;
    /** The names which fit (`AMBIGUOUS`) or which are known (`NOT_FOUND`) */
    candidates?: string[];
}

/** One device of `network.getClients` */
export interface NetworkClient {
    mac: string;
    name: string;
    ip?: string;
    online: boolean;
    /** LAN (`true`) or WLAN (`false`); left out when the box does not tell */
    wired?: boolean;
    /** The device is in the guest network */
    guest?: true;
    /** Name of the box or repeater the device is connected to (from the last reading of the mesh) */
    accessPoint?: string;
}

/** The error of a callback of the box as a standard answer */
export function standardError(err: unknown): StandardError {
    const text = err === 'timeout' ? 'no answer' : err instanceof Error ? err.message : String(err);
    if (text === 'not connected') {
        return { error: text, reason: 'NOT_CONNECTED' };
    }
    if (text === 'not supported') {
        return { error: text, reason: 'NOT_SUPPORTED' };
    }
    if (text === 'no answer') {
        return { error: 'the FritzBox did not answer', reason: 'TIMEOUT' };
    }
    return { error: text };
}

/** The message as an object - a missing or other message is an empty one */
export function messageObject(message: unknown): Record<string, unknown> {
    return typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : {};
}

/**
 * The devices of the host list for `network.getClients`.
 *
 * @param hosts the host list of the box
 * @param online true: only the online devices, false: only the offline ones, undefined: all
 * @param topology the last mesh topology, for the access point
 */
export function clientsOfHosts(
    hosts: HostEntry[],
    online: boolean | undefined,
    topology: MeshResponse | null,
): NetworkClient[] {
    const byMac = new Map<string, NetworkClient>();
    for (const host of hosts) {
        const mac = normalizeMac(String(host.NewMACAddress || ''));
        if (!mac) {
            continue;
        }
        const client: NetworkClient = { mac, name: String(host.NewHostName || ''), online: !!~~Number(host.NewActive) };
        const ip = String(host.NewIPAddress || '').trim();
        if (ip) {
            client.ip = ip;
        }
        const type = String(host.NewInterfaceType || '');
        if (type === 'Ethernet' || type === '802.11') {
            client.wired = type === 'Ethernet';
        }
        if (host['NewX_AVM-DE_Guest'] === '1') {
            client.guest = true;
        }
        const accessPoint = topology ? findAccessPoint(topology, { name: '', ip: '', mac })?.name : undefined;
        if (accessPoint) {
            client.accessPoint = accessPoint;
        }
        // a MAC address may be listed twice (e.g. LAN and WLAN) - the online entry wins
        const known = byMac.get(mac);
        if (!known || (!known.online && client.online)) {
            byMac.set(mac, client);
        }
    }
    return [...byMac.values()].filter(client => online === undefined || client.online === online);
}

/** `online` of `network.getClients`: a boolean, or undefined for all devices */
export function onlineFilter(message: unknown): boolean | undefined | StandardError {
    const online = messageObject(message).online;
    if (online === undefined || online === null) {
        return undefined;
    }
    if (typeof online === 'boolean') {
        return online;
    }
    if (online === 'true' || online === 'false') {
        return online === 'true';
    }
    return { error: 'online must be true or false', reason: 'BAD_REQUEST' };
}

/**
 * The parameters of `network.guestWifi`: `enabled` switches, without it the guest WLAN is only read. `minutes` is
 * refused: the adapter cannot let the box switch the guest WLAN off after a time.
 */
export function guestWifiRequest(message: unknown): { enabled?: boolean } | StandardError {
    const { enabled, minutes } = messageObject(message);
    if (enabled === undefined || enabled === null) {
        return {};
    }
    let on: boolean;
    if (typeof enabled === 'boolean') {
        on = enabled;
    } else if (enabled === 'true' || enabled === 'false') {
        on = enabled === 'true';
    } else {
        return { error: 'enabled must be true or false', reason: 'BAD_REQUEST' };
    }
    if (on && minutes !== undefined && minutes !== null) {
        return {
            error: 'the guest WLAN cannot be switched on for a time here; leave out minutes and switch it off later',
            reason: 'NOT_SUPPORTED',
        };
    }
    return { enabled: on };
}

/** A contact of the phone book as `callRequest` needs it */
export interface CallContact {
    name: string;
    number: string;
}

/** Most names in `candidates` of a `phone.call` whose `to` is in no contact */
const MAX_CANDIDATES = 50;

/** The characters of a phone number without the separators people write */
const PHONE_NUMBER = /^[0-9*#+]+$/;

/** A name compared without case and spaces; the umlauts of `normalizeName` are not needed for that */
function nameKey(name: string): string {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The number of a contact of the phone book: an exact name (without case) wins over a part of a name. Several
 * contacts → `AMBIGUOUS` with their names; one contact with several numbers → `AMBIGUOUS` with the numbers.
 */
function resolveContact(
    to: string,
    contacts: readonly CallContact[],
): { number: string; name: string } | (StandardError & { candidates: string[] }) {
    const key = nameKey(to);
    const exact = contacts.filter(contact => nameKey(contact.name) === key);
    const found = exact.length ? exact : contacts.filter(contact => nameKey(contact.name).includes(key));
    const names = [...new Set(found.map(contact => contact.name))];
    if (!names.length) {
        const all = [...new Set(contacts.map(contact => contact.name))].sort((a, b) => a.localeCompare(b));
        return {
            error: contacts.length
                ? `"${to}" is in no contact of the phone book`
                : `"${to}" is no phone number, and the phone book is empty or switched off`,
            reason: 'NOT_FOUND',
            candidates: all.slice(0, MAX_CANDIDATES),
        };
    }
    if (names.length > 1) {
        return { error: `"${to}" fits several contacts`, reason: 'AMBIGUOUS', candidates: names };
    }
    const numbers = [...new Set(found.map(contact => contact.number))];
    if (numbers.length > 1) {
        return { error: `${names[0]} has several numbers`, reason: 'AMBIGUOUS', candidates: numbers };
    }
    return { number: numbers[0], name: names[0] };
}

/**
 * The parameters of `phone.call {to, from?, text?, seconds?}` as the value of the state `ring` (`<number>[,<seconds>]`).
 * `to` is a number or the name of a contact of the phone book. The box connects the call to the phone of its dialing
 * help, so `from` and `text` (a call that speaks) are refused.
 *
 * @param message the message of `call`
 * @param contacts the phone book, empty if it is switched off
 */
export function callRequest(
    message: unknown,
    contacts: readonly CallContact[],
): { ring: string; to: string; text: string } | StandardError {
    const { to, from, text, seconds } = messageObject(message);
    const wanted = typeof to === 'number' ? String(to) : typeof to === 'string' ? to.trim() : '';
    if (!wanted) {
        return { error: 'to is required: a phone number or the name of a contact', reason: 'BAD_REQUEST' };
    }
    if (from !== undefined && from !== null && from !== '') {
        return {
            error: 'the FritzBox connects the call to the phone of its dialing help, another phone cannot be chosen',
            reason: 'NOT_SUPPORTED',
        };
    }
    if (text !== undefined && text !== null && text !== '') {
        return { error: 'the FritzBox cannot speak a text in a call', reason: 'NOT_SUPPORTED' };
    }
    let duration = 0;
    if (seconds !== undefined && seconds !== null && seconds !== '') {
        duration = Math.round(Number(seconds));
        if (!Number.isFinite(duration) || duration < 1) {
            return { error: 'seconds must be a number of seconds', reason: 'BAD_REQUEST' };
        }
    }

    const written = wanted.replace(/[\s()/-]/g, '');
    let number = written;
    let label = written;
    if (!PHONE_NUMBER.test(written)) {
        const contact = resolveContact(wanted, contacts);
        if ('error' in contact) {
            return contact;
        }
        number = contact.number;
        label = `${contact.name} (${contact.number})`;
    }
    return {
        ring: duration ? `${number},${duration}` : number,
        to: number,
        text: `The FritzBox dials ${label} with its dialing help${duration ? `, for at most ${duration} s` : ''}`,
    };
}
