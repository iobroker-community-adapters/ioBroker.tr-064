// Augments the globally declared ioBroker types with everything this adapter adds.
// The attributes of `AdapterConfig` must be kept in sync with `native` in io-package.json
// and with admin/jsonConfig.json.
import type { CallListsConfig, DeviceConfigEntry, PhonebookByNumberConfig } from './types';

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** IP address or host name of the Fritz!Box */
            iporhost: string;
            /** User of the Fritz!Box */
            user: string;
            /** Password of the user, encrypted with the system secret */
            password: string;
            /** Seconds between two polls of the Fritz!Box. 0 switches the polling off */
            pollingInterval: number;
            useCallMonitor: boolean;
            usePhonebook: boolean;
            useDeflectionOptions: boolean;
            useDevices: boolean;
            useMDNS: boolean;
            jsonDeviceList: boolean;
            /**
             * The objects of the devices get the names of the tab "Devices" instead of the names in
             * the box. Objects with other names are deleted. `false` for instances without the option
             */
            useConfiguredNames: boolean;
            /** Writes the access point of every device from the mesh topology. `true` for instances without the option */
            useMesh: boolean;
            /** Reads the event log of the box into `deviceLog` */
            useDeviceLog: boolean;
            /** Writes every polled value, not only a changed one (with a new time stamp) */
            updateUnchanged: boolean;
            /** Phone books which are searched first for the calls of an own number */
            phonebooksByNumber: PhonebookByNumberConfig[];
            devices: DeviceConfigEntry[];
            calllists: CallListsConfig;

            /**
             * Attribute of adapter versions before 2018. The old admin wrote `null` into it when
             * the settings were saved, but instances which were never saved again still have the
             * address here, so it is still preferred over `iporhost`.
             */
            ip?: string | null;
            /** Port of the TR-064 interface. Never part of the admin UI, default 49000 */
            port?: number;
            /** Milliseconds until the call monitor reconnects. Never part of the admin UI */
            reconnectInterval?: number;
        }
    }
}

export {};
