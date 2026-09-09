/**
 * Shapes of the data which the Fritz!Box delivers.
 *
 * The box answers SOAP calls with flat string records ("out" arguments, all prefixed with `New`)
 * and delivers call list, phone book and deflections as XML which is converted to JSON by
 * `xml2js` (`explicitArray: false`, `normalizeTags: true`) - therefore every value is a string
 * and every list may be a single object instead of an array.
 */

/** One device of the Fritz!Box home network (`GetGenericHostEntry`/`GetSpecificHostEntry`) */
export interface HostEntry {
    NewHostName: string;
    NewIPAddress: string;
    NewMACAddress: string;
    /** `'0'` or `'1'`, the adapter converts it with `~~` */
    NewActive: string | number;
    NewInterfaceType?: string;
    NewAddressSource?: string;
    NewLeaseTimeRemaining?: string;
    [key: string]: unknown;
}

/** Device as it is delivered to the admin by the `discovery` message */
export interface DiscoveredDevice {
    name: string;
    ip: string;
    mac: string;
    active: boolean;
}

/** One device of the configuration (tab "Devices") */
export interface DeviceConfigEntry {
    name: string;
    ip: string;
    mac: string;
    /**
     * Last host entry which the box delivered for this device. It is reused when the box
     * answers with error 500 because the device is not in the host list any more.
     */
    lastResult?: HostEntry;
}

/** Configuration of one call list (all, inbound, missed, outbound) */
export interface CallListTypeConfig {
    generateJson?: boolean;
    generateHtml?: boolean;
    /** Spelling of adapter versions before 4.x - `normalizeConfig()` converts it */
    generateJSON?: boolean;
    /** Spelling of adapter versions before 4.x - `normalizeConfig()` converts it */
    generateHTML?: boolean;
    maxEntries: number;
}

/** `native.calllists` of the configuration */
export interface CallListsConfig {
    all: CallListTypeConfig;
    inbound: CallListTypeConfig;
    missed: CallListTypeConfig;
    outbound: CallListTypeConfig;
    /** Set by `normalizeConfig()`: true if at least one list is generated */
    use?: boolean;
}

/** Name of one call list */
export type CallListName = 'all' | 'inbound' | 'missed' | 'outbound';

/** One entry of the call list XML (`root.call`) */
export interface CallEntry {
    id: number;
    /** 1 = inbound, 2 = missed, 3 = outbound, 9/10/11 = still running */
    type: number | string;
    caller?: string;
    called?: string;
    callednumber?: string;
    name?: string;
    numbertype?: string;
    device?: string;
    port?: string;
    date?: string;
    duration?: string;
    count?: string;
    path?: string;
    /** Added by the adapter: `>`, `x` or `<` */
    sym?: string;
    /** Added by the adapter: the external number of this call */
    external?: string;
    [key: string]: unknown;
}

/** Call list XML converted to JSON */
export interface CallListXml {
    root?: {
        timestamp?: string;
        call?: CallEntry | CallEntry[];
    };
}

/** One entry of the phone book */
export interface PhonebookEntry {
    name: string;
    normalizedName: string;
    number: string;
    id: string;
    phonebookId: string;
    imageurl?: string;
}

/** Phone book XML converted to JSON */
export interface PhonebookXml {
    phonebooks?: {
        phonebook?: {
            contact?: PhonebookContact[];
        };
    };
}

export interface PhonebookContact {
    uniqueid: string;
    person: {
        realname: string;
        imageurl?: string;
    };
    telephony: {
        number: string | string[];
    };
}

/** One call forwarding (`GetDeflections`) */
export interface DeflectionEntry {
    deflectionid: string;
    type: string;
    number: string;
    deflectiontonumber: string;
    /** `'0'` or `'1'` */
    enable: string;
    [key: string]: unknown;
}

/** One VoIP account (`X_AVM-DE_GetVoIPAccount`) */
export interface VoIPAccount {
    NewVoIPNumber?: string;
    /** Added by the adapter from the list of numbers */
    name?: string;
    [key: string]: unknown;
}

/** One number of `X_AVM-DE_GetNumbers` */
export interface VoIPNumber {
    number: string;
    name: string;
    [key: string]: unknown;
}

/** Data of a call which the call monitor reports */
export interface CallMonitorMessage {
    id: number;
    timestamp: string;
    caller?: string;
    callee?: string;
    extension?: number;
    duration?: number;
    /** `missed`, `disconnect` or `unreached`, set when the call is finished */
    type?: string;
    /** Internal: name of the state channel this call was written to last */
    _type?: string;
    callerName?: string;
    calleeName?: string;
    imageurlcaller?: string;
    imageurlcallee?: string;
    [key: string]: unknown;
}
