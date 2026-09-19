/**
 * Call monitor of the Fritz!Box.
 *
 * The box sends one line per call event on TCP port 1012. The port has to be opened once by
 * dialing `#96*5*` on a connected telephone.
 */
import { Socket } from 'node:net';

import { CDevice, type Devices } from './devices';
import type { CallMonitorMessage } from './types';
import type { Phonebook } from './phonebook';
import type { Tr064Adapter } from '../main';

const CALLMONITOR_NAME = 'callmonitor';
/** Idle milliseconds after which TCP keepalive probes check whether the box is still there */
const KEEPALIVE_DELAY = 60_000;
/** Milliseconds between two attempts while the box refuses port 1012 (port not opened, or restarting) */
const REFUSED_RETRY_INTERVAL = 60_000;
/** Milliseconds after which a received rest without line break is evaluated as a line of its own */
const LINE_FLUSH_DELAY = 1000;
/** A rest without line break which is longer than this is not a call event, it is thrown away */
const MAX_LINE_LENGTH = 1024;
const ENABLE_CONNECT_1012 = `--- To use the callmonitor, enable connects to port 1012 on FritzBox by dialing #96*5* with a directly connected phone (line/dect). The adapter retries every ${REFUSED_RETRY_INTERVAL / 1000} seconds`;

/** Value of `toPauseState` per call state */
const PAUSE_STATES: Record<string, string> = {
    inbound: 'ring',
    lastCall: 'end',
    connect: 'connect',
};

export class CallMonitor {
    private readonly adapter: Tr064Adapter;
    private readonly devices: Devices;
    private readonly phonebook: Phonebook;
    /** Calls which are currently running, by call ID */
    private readonly connections: Record<number, CallMonitorMessage> = {};

    private client: Socket | null = null;
    private timeout: ioBroker.Timeout | null = null;
    private updateTimer: ioBroker.Timeout | null = null;
    /** Received text after the last line break */
    private lineBuffer = '';
    private flushTimer: ioBroker.Timeout | null = null;
    private lastCaller: string | undefined;
    private lastCallee: string | undefined;
    /** The call monitor was connected at least once - a refusal then means that the box restarts */
    private connectedOnce = false;
    /** The current attempt was refused by the box */
    private refused = false;
    /** The refusal was logged - it is logged once per outage */
    private refusedLogged = false;

    public constructor(adapter: Tr064Adapter, devices: Devices, phonebook: Phonebook) {
        this.adapter = adapter;
        this.devices = devices;
        this.phonebook = phonebook;

        this.adapter.log.debug('starting callmonitor');

        this.devices.root.createNew(`${CALLMONITOR_NAME}.toPauseState`, {
            val: '',
            common: { name: 'On call states', desc: 'State to pause players. values are: ring, connect, end' },
        });
        this.devices.root.createNew(`${CALLMONITOR_NAME}.connected`, {
            val: false,
            common: {
                name: 'Connected to the call monitor of the FRITZ!Box',
                type: 'boolean',
                role: 'indicator.connected',
                write: false,
            },
        });

        this.init();
    }

    private init(): void {
        const client = new Socket();
        this.client = client;
        // The call monitor is idle for hours. Without keepalive a connection which the box dropped
        // silently (e.g. by a reboot) is never detected: no `close`, no reconnect, no events.
        client.setKeepAlive(true, KEEPALIVE_DELAY);
        this.refused = false;
        this.clearLineBuffer();

        client.on('connect', () => {
            if (this.refusedLogged) {
                this.adapter.log.info(`${CALLMONITOR_NAME} connected`);
            } else {
                this.adapter.log.debug('callmonitor connected');
            }
            this.connectedOnce = true;
            this.refusedLogged = false;
            this.setConnected(true);
        });

        client.on('error', err => {
            // The box answers with ECONNREFUSED as long as port 1012 is not opened - and also for a
            // while when it restarts. The call monitor must not stop then, it retries less often.
            if ((err as NodeJS.ErrnoException).code !== 'ECONNREFUSED') {
                return;
            }
            this.refused = true;
            if (this.refusedLogged) {
                this.adapter.log.debug(`callmonitor refused, retry in ${REFUSED_RETRY_INTERVAL / 1000} s`);
                return;
            }
            this.refusedLogged = true;
            if (this.connectedOnce) {
                this.adapter.log.info(
                    `${CALLMONITOR_NAME}: the FRITZ!Box refuses the connection, probably it restarts. Retrying every ${REFUSED_RETRY_INTERVAL / 1000} seconds`,
                );
            } else {
                this.adapter.log.error(ENABLE_CONNECT_1012);
            }
        });

        client.on('close', () => {
            this.setConnected(false);
            const delay = this.refused ? REFUSED_RETRY_INTERVAL : this.adapter.config.reconnectInterval || 5000;
            this.adapter.log.debug(`callmonitor closed ... reconnect in ${delay / 1000} s`);
            if (this.timeout) {
                this.adapter.clearTimeout(this.timeout);
            }
            this.timeout =
                this.adapter.setTimeout(() => {
                    this.timeout = null;
                    this.init();
                }, delay) ?? null;
        });

        client.on('data', data => this.onData(data));

        this.adapter.log.debug('callmonitor initialize ...');
        client
            .connect({
                host: this.adapter.config.ip || this.adapter.config.iporhost,
                port: 1012,
            })
            .on('error', err => {
                // FRITZ!OS 8.x closes the connection after a longer idle time. The `close` handler
                // reconnects, so those codes are not an error of the adapter.
                const code = (err as NodeJS.ErrnoException).code;
                if (code === 'ECONNREFUSED') {
                    // handled above
                } else if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EPIPE') {
                    this.adapter.log.info(`${CALLMONITOR_NAME} connection dropped (${code}); will reconnect`);
                } else {
                    this.adapter.log.error(`Cannot start ${CALLMONITOR_NAME}: ${err.message}`);
                }
            });
    }

    /**
     * Splits the received data into lines, one line per call event.
     *
     * TCP delivers a stream and not single messages: one packet can hold two events (e.g. `RING`
     * and `DISCONNECT` of a very short call) or only a part of one. Evaluating every packet as one
     * line lost the second event - a lost `DISCONNECT` means no `lastCall` and no refresh of the
     * call lists. A rest without line break is evaluated after `LINE_FLUSH_DELAY`, in case a box
     * does not end its lines.
     */
    private onData(data: Buffer): void {
        if (this.flushTimer) {
            this.adapter.clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        const lines = (this.lineBuffer + data.toString()).split(/\r?\n/);
        this.lineBuffer = lines.pop() ?? '';
        if (this.lineBuffer.length > MAX_LINE_LENGTH) {
            this.adapter.log.debug(`Callmonitor: ${this.lineBuffer.length} characters without line break discarded`);
            this.lineBuffer = '';
        }

        for (const line of lines) {
            if (line.trim()) {
                this.onLine(line);
            }
        }

        if (this.lineBuffer.trim()) {
            this.flushTimer =
                this.adapter.setTimeout(() => {
                    this.flushTimer = null;
                    const line = this.lineBuffer;
                    this.lineBuffer = '';
                    this.onLine(line);
                }, LINE_FLUSH_DELAY) ?? null;
        }
    }

    /** Writes `callmonitor.connected`, so that a script can watch the connection (issue #399) */
    private setConnected(connected: boolean): void {
        this.devices.root.set(`${CALLMONITOR_NAME}.connected`, connected);
        this.devices.root.update();
    }

    private clearLineBuffer(): void {
        this.lineBuffer = '';
        if (this.flushTimer) {
            this.adapter.clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /** Evaluates one line of the call monitor, e.g. `date;RING;id;caller;callee;line;` */
    private onLine(raw: string): void {
        const array = raw.split(';');
        const type = array[1];
        const id = parseInt(array[2], 10);
        const timestamp = array[0];

        // the raw line contains the phone numbers
        this.adapter.log.debug(`Callmonitor event ${type} (id ${id})`);
        this.adapter.log.silly(`Callmonitor Raw: ${raw}`);
        let message: CallMonitorMessage | undefined;

        switch (type) {
            case 'CALL':
                message = { caller: array[4], callee: array[5], extension: parseInt(array[3], 10), timestamp, id };
                this.connections[id] = message;
                this.set('outbound', message, timestamp);
                break;

            case 'RING':
                message = { caller: array[3], callee: array[4], timestamp, id };
                this.connections[id] = message;
                this.set('inbound', message, timestamp);
                break;

            case 'CONNECT':
                message = this.connections[id];
                if (!message) {
                    break;
                }
                message.extension = parseInt(array[3], 10);
                this.set('connect', message, timestamp);
                break;

            case 'DISCONNECT':
                message = this.connections[id];
                if (!message) {
                    break;
                }
                switch (message._type) {
                    case 'inbound':
                        message.type = 'missed';
                        break;
                    case 'connect':
                        message.type = 'disconnect';
                        break;
                    case 'outbound':
                        message.type = 'unreached';
                        break;
                }
                message.duration = ~~Number(array[3]);
                this.set('lastCall', message, timestamp);
                delete this.connections[id];
                break;
        }
    }

    /** Writes the states of one call event */
    private set(name: string, message: CallMonitorMessage, timestamp: string): void {
        const dev = new CDevice(this.devices, CALLMONITOR_NAME, '');

        if (this.updateTimer) {
            this.adapter.clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }

        this.adapter.log.silly(`New Call data ${name}: ${JSON.stringify(message)}`);
        if (message.extension !== undefined && !Number.isNaN(message.extension)) {
            // the name is learned from the call lists, the call monitor only reports the port
            message.device = this.adapter.systemData.native.callLists?.ports[String(message.extension)] ?? '';
        }
        dev.setChannel('', '');
        dev.set('ringing', name === 'inbound');

        dev.setChannel(name, name);
        for (const i of Object.keys(message)) {
            if (i[0] !== '_') {
                if (i === 'callee' || i === 'caller') {
                    dev.set(i, {
                        val: String(message[i]),
                        common: { name: i, type: 'string', role: 'state' },
                    });
                } else {
                    dev.set(i, message[i] as ioBroker.StateValue);
                }
            }
        }
        dev.set('timestamp', timestamp);
        message._type = name;
        if (name === 'inbound' || name === 'outbound') {
            // `_type` changes with every event, the direction of the call stays
            message._direction = name;
        }

        if (this.adapter.config.usePhonebook && this.phonebook) {
            if (this.lastCaller !== message.caller) {
                this.lastCaller = message.caller;
            }

            // the own number decides which phone book is searched first (issue #226)
            const outbound = message._direction === 'outbound';
            if (!message.callerName && message.caller) {
                const pbe = this.phonebook.byNumber(message.caller, outbound ? undefined : message.callee);
                if (pbe) {
                    message.callerName = pbe.name;
                    if (pbe.imageurl) {
                        message.imageurlcaller = pbe.imageurl;
                    }
                } else {
                    message.callerName = '';
                }
            }
            dev.set('callerName', message.callerName || '');

            if (this.lastCallee !== message.callee) {
                this.lastCallee = message.callee;
            }

            if (!message.calleeName && message.callee) {
                const pbee = this.phonebook.byNumber(message.callee, outbound ? message.caller : undefined);
                if (pbee) {
                    message.calleeName = pbee.name;
                    if (pbee.imageurl) {
                        message.imageurlcallee = pbee.imageurl;
                    }
                } else {
                    message.calleeName = '';
                }
            }
            dev.set('calleeName', message.calleeName || '');
        }

        dev.set('json', JSON.stringify(message));

        dev.setChannel('', '');
        const pause = PAUSE_STATES[name];
        if (pause !== undefined) {
            dev.set('toPauseState', pause);
            if (message.extension) {
                dev.set(`toPauseState-${message.extension}`, pause);
            }
        }

        this.adapter.log.debug(`callMonitor.set: type=${name}`);
        this.adapter.log.silly(
            `callMonitor.set: type=${name} caller=${message.caller} callee=${message.callee}` +
                `${message.callerName ? ` callerName=${message.callerName}` : ''}` +
                `${message.calleeName ? ` calleeName=${message.calleeName}` : ''}`,
        );

        this.updateTimer =
            this.adapter.setTimeout(() => {
                this.updateTimer = null;
                dev.update();
                this.devices.update();
            }, 500) ?? null;
    }

    public close(): void {
        if (this.client) {
            try {
                this.client.removeAllListeners();
                this.client.destroy();
            } catch {
                // ignore
            }
            this.client = null;
        }
        if (this.timeout) {
            this.adapter.clearTimeout(this.timeout);
            this.timeout = null;
        }
        if (this.updateTimer) {
            this.adapter.clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        this.clearLineBuffer();
        void this.adapter.setState(`${CALLMONITOR_NAME}.connected`, false, true);
    }
}
