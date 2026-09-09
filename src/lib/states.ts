/** Definition of the states which the adapter creates below `states` and `phonebook` */
import type { DeviceObject } from './devices';

export const CHANNEL_STATES = 'states';
export const CHANNEL_DEVICES = 'devices';
export const CHANNEL_PHONEBOOK = 'phonebook';
export const CHANNEL_CALLLISTS = 'calllists';
export const CHANNEL_CALLMONITOR = 'callmonitor';

const COMMAND_DESC =
    'eg. { "service": "urn:dslforum-org:service:WLANConfiguration:1", "action": "X_AVM-DE_SetWPSConfig", "params": { "NewX_AVM-DE_WPSMode": "pbc", "NewX_AVM-DE_WPSClientPIN": "" } }';

/** One state of the adapter. `native.func` is the method of `TR064Client` which writes it */
export interface StateDefinition extends DeviceObject {
    name: string;
    val: ioBroker.StateValue;
    native?: { func?: string; desc?: string };
}

/** States below `tr-064.<instance>.states` */
export const STATES: Record<string, StateDefinition> = {
    wps: { name: 'wps', val: false, common: {}, native: { func: 'setWPSMode' } },
    wlan: { name: 'wlan', val: false, common: { desc: 'All WLANs' }, native: { func: 'setWLAN' } },
    wlan24: { name: 'wlan24', val: true, common: { desc: '2.4 GHz WLAN' }, native: { func: 'setWLAN24' } },
    wlan50: { name: 'wlan50', val: true, common: { desc: '5.0 GHz WLAN' }, native: { func: 'setWLAN50' } },
    wlanGuest: { name: 'wlanGuest', val: true, common: { desc: 'Guest WLAN' }, native: { func: 'setWLANGuest' } },
    wlan24Password: {
        name: 'wlan24Password',
        val: '',
        common: { desc: 'Passphrase for 2.4 GHz WLAN' },
        native: { func: 'setWLAN24Password' },
    },
    wlan50Password: {
        name: 'wlan50Password',
        val: '',
        common: { desc: 'Passphrase for 5.0 GHz WLAN' },
        native: { func: 'setWLAN50Password' },
    },
    wlanGuestPassword: {
        name: 'wlanGuestPassword',
        val: '',
        common: { desc: 'Passphrase for Guest WLAN' },
        native: { func: 'setWLANGuestPassword' },
    },
    abIndex: { name: 'abIndex', val: 0, common: {}, native: { func: 'setABIndex' } },
    ab: { name: 'ab', val: false, common: { desc: 'parameter: index, state' }, native: { func: 'setAB' } },
    ring: {
        name: 'ring',
        val: '**610',
        common: { desc: 'let a phone ring. Parameter is phonenumber [,duration]. eg. **610' },
        native: { func: 'ring' },
    },
    reconnectInternet: {
        name: 'reconnectInternet',
        val: false,
        common: { role: 'button', read: false, write: true },
        native: { func: 'reconnectInternet' },
    },
    command: { name: 'command', val: '', native: { func: 'command', desc: COMMAND_DESC } },
    commandResult: { name: 'commandResult', val: '', common: { write: false } },
    externalIP: { name: 'externalIP', val: '', common: { write: false } },
    externalIPv6: { name: 'externalIPv6', val: '', common: { write: false } },
    externalIPv6Prefix: { name: 'externalIPv6Prefix', val: '', common: { write: false } },
    reboot: {
        name: 'reboot',
        val: false,
        common: { role: 'button', read: false, write: true },
        native: { func: 'reboot' },
    },
};

/** States below `tr-064.<instance>.phonebook` */
export const PB_STATES: Record<string, StateDefinition> = {
    pbNumber: { name: 'number', val: '', common: { name: 'Number' } },
    pbName: { name: 'name', val: '', common: { name: 'Name' } },
    pbImageUrl: { name: 'image', val: '', common: { name: 'Image URL' } },
};
