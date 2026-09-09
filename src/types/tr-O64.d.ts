/**
 * Minimal typings for the untyped CommonJS package `tr-O64` (a fork of `tr-064`).
 *
 * Only the parts that this adapter uses are declared. The library builds its API at runtime
 * from the SCPD description of the Fritz!Box, so `services`, `actions` and `stateVariables`
 * are plain records whose content depends on the box and its firmware.
 */
declare module 'tr-O64' {
    /** Error as it is passed to the callbacks of the library */
    export interface TR064Error extends Error {
        /** HTTP status of the SOAP request, e.g. 500 if the box does not know the device */
        code?: number | string;
    }

    /** Arguments of a SOAP action - the library sends every value as a string */
    export type ActionArguments = Record<string, string | number | boolean>;

    /** Result of a SOAP action - the "out" arguments of the action */
    export type ActionResult = Record<string, string>;

    /** Callback of a SOAP action */
    export type ActionCallback = (err: TR064Error | null, result: ActionResult) => void;

    /** One SOAP action of a service. The arguments may be omitted if the action has no input */
    export interface Action {
        (vars: ActionArguments, callback: ActionCallback): void;
        (callback: ActionCallback): void;
    }

    export interface Service {
        meta: {
            serviceType: string;
            serviceId: string;
            controlURL: string;
            eventSubURL: string;
            SCPDURL: string;
        };
        actions: Record<string, Action>;
        stateVariables: Record<string, unknown>;
    }

    export interface Device {
        meta: Record<string, unknown>;
        services: Record<string, Service>;
        login(user: string, password: string): void;
        logout(): void;
        startTransaction(callback: (err: TR064Error | null, device: Device) => void): void;
        stopTransaction(callback: (err: TR064Error | null, device: Device) => void): void;
        startEncryptedCommunication(callback: (err: TR064Error | null, device: Device) => void): void;
        stopEncryptedCommunication(): void;
    }

    export type DeviceCallback = (err: TR064Error | null, device: Device) => void;

    export class TR064 {
        /** Reads `/tr64desc.xml` and creates the device with all its services */
        initTR064Device(host: string, port: number, callback: DeviceCallback): void;
        /** Reads `/igddesc.xml` (internet gateway device) */
        initIGDDevice(host: string, port: number, callback: DeviceCallback): void;
        /** Reads `/pmr/PersonalMessageReceiver.xml` */
        initPMRDevice(host: string, port: number, callback: DeviceCallback): void;
        startEventServer(port: number): void;
        stopEventServer(): void;
    }
}
