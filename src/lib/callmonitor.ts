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
const ENABLE_CONNECT_1012 =
    '--- To use the callmonitor, enable connects to port 1012 on FritzBox by dialing #96*5* with a directly connected phone (line/dect) and restart this adapter';

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
    private lastCaller: string | undefined;
    private lastCallee: string | undefined;

    public constructor(adapter: Tr064Adapter, devices: Devices, phonebook: Phonebook) {
        this.adapter = adapter;
        this.devices = devices;
        this.phonebook = phonebook;

        this.adapter.log.debug('starting callmonitor');

        this.devices.root.createNew(`${CALLMONITOR_NAME}.toPauseState`, {
            val: '',
            common: { name: 'On call states', desc: 'State to pause players. values are: ring, connect, end' },
        });

        this.init();
    }

    private init(): void {
        const client = new Socket();
        this.client = client;

        client.on('connect', () => this.adapter.log.debug('callmonitor connected'));

        client.on('error', err => {
            // The box answers with ECONNREFUSED as long as port 1012 is not opened. Reconnecting
            // does not help in that case, so the call monitor stops until the adapter is restarted.
            if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
                this.adapter.log.error(ENABLE_CONNECT_1012);
                this.close();
            }
        });

        client.on('close', () => {
            this.adapter.log.debug('callmonitor closed ... reconnect');
            if (this.timeout) {
                this.adapter.clearTimeout(this.timeout);
            }
            this.timeout =
                this.adapter.setTimeout(() => {
                    this.timeout = null;
                    this.init();
                }, this.adapter.config.reconnectInterval || 5000) ?? null;
        });

        client.on('data', data => this.onData(data));

        this.adapter.log.debug('callmonitor initialize ...');
        client
            .connect({
                host: this.adapter.config.ip || this.adapter.config.iporhost,
                port: 1012,
            })
            .on('error', error => this.adapter.log.error(`Cannot start ${CALLMONITOR_NAME}: ${error.message}`));
    }

    private onData(data: Buffer): void {
        const raw = data.toString();
        this.adapter.log.debug(`Callmonitor Raw: ${raw}`);

        const array = raw.split(';');
        const type = array[1];
        const id = parseInt(array[2], 10);
        const timestamp = array[0];
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

        this.adapter.log.debug(`New Call data ${name}: ${JSON.stringify(message)}`);
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

        if (this.adapter.config.usePhonebook && this.phonebook) {
            if (this.lastCaller !== message.caller) {
                this.lastCaller = message.caller;
            }

            if (!message.callerName && message.caller) {
                const pbe = this.phonebook.byNumber(message.caller);
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
                const pbee = this.phonebook.byNumber(message.callee);
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

        this.adapter.log.debug(
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
    }
}
