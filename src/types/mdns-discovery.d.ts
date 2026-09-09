/**
 * Minimal typings for the untyped CommonJS package `mdns-discovery`.
 *
 * Only the `on('message')` / `run()` pair used by this adapter is declared.
 */
declare module 'mdns-discovery' {
    import type { RemoteInfo } from 'node:dgram';

    export interface MulticastDnsOptions {
        name?: string;
        port?: number;
        ip?: string;
        reuseAddr?: boolean;
        interfaces?: string[];
        type?: 'udp4' | 'udp6';
        /** Seconds until the sockets are closed again. `0` keeps them open */
        timeout?: number;
        broadcast?: boolean;
        multicast?: boolean;
        multicastTTL?: number;
        ttl?: number;
        noQuestions?: boolean;
        details?: boolean;
    }

    /** One entry as it is collected by the discovery */
    export interface MulticastDnsEntry {
        ip: string;
        name: string;
        [key: string]: unknown;
    }

    export interface MulticastDns {
        /**
         * `message` is called for every received mDNS packet, `entry` for every discovered device,
         * `packet` for the raw packet and `filter` to decide whether an entry is taken over.
         */
        on(name: 'message', fn: (message: Buffer | undefined, rinfo: RemoteInfo | undefined) => void): MulticastDns;
        on(name: 'entry', fn: (entry: MulticastDnsEntry) => void): MulticastDns;
        on(name: 'packet', fn: (packets: unknown, rinfo: RemoteInfo) => void): MulticastDns;
        on(name: 'filter', fn: (entry: MulticastDnsEntry) => boolean): MulticastDns;
        /** Starts the discovery. Without a timeout the one from the options (4 s) is used */
        run(timeout?: number, readyCallback?: (found: MulticastDnsEntry[]) => void): MulticastDns;
        run(readyCallback: (found: MulticastDnsEntry[]) => void): MulticastDns;
        /** Closes all sockets */
        close(): void;
    }

    /** The module exports a factory which also works without `new` */
    function MulticastDnsFactory(options?: MulticastDnsOptions): MulticastDns;

    export = MulticastDnsFactory;
}
