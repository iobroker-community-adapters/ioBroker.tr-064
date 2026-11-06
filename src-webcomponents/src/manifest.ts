/**
 * The manifests of the web components. Read by the build only (`vite.config.ts`), which writes each as
 * `<name>.json` next to its module - a host reads that file for its palette and its settings without loading
 * the module.
 *
 * The texts come from the dictionaries of the adapter (`vis_*` are the texts of the vis-2 widgets). The name of a
 * component is the label of the native widget that shows the same: the devices widget where there is one,
 * otherwise the vis-2 widget. vis-2 and ioBroker.devices then show the native widget instead of the component,
 * the other hosts (Aura, admin) the component.
 */
import type {
    WebComponentManifest,
    WebComponentSetting,
    WebComponentSettingsPanel,
    WebComponentText,
} from '@iobroker/web-components';

// with the extension: `vite.config.ts` imports this file, and Vite may load its config natively
import { ADAPTER, COMPONENTS, moduleFile, type ComponentKey } from './constants.ts';

/** Where the texts of a manifest come from */
export interface ManifestTexts {
    /** A word of the dictionaries in every language */
    word: (key: string) => WebComponentText;
    /** Label and description of a widget of `common.deviceWidgets` in io-package.json, in every language */
    deviceWidget: (name: string) => { label: WebComponentText; description: WebComponentText };
}

type Settings = WebComponentSettingsPanel;

function instanceSetting(w: ManifestTexts['word']): WebComponentSetting {
    return { type: 'instance', adapter: ADAPTER, default: `${ADAPTER}.0`, label: w('vis_instance') };
}

function fritzBoxSettings(w: ManifestTexts['word']): Settings {
    return {
        type: 'panel',
        items: {
            instance: instanceSetting(w),
            boxName: { type: 'text', label: w('vis_name'), help: w('vis_name_tooltip') },
            partsHeader: { type: 'header', text: w('vis_parts') },
            hideDetails: {
                type: 'checkbox',
                default: false,
                label: w('vis_hide_details'),
                help: w('vis_hide_details_tooltip'),
            },
            showIp: { type: 'checkbox', default: true, label: w('vis_show_ip'), hidden: '!!data.hideDetails' },
            showWlan: { type: 'checkbox', default: true, label: w('vis_show_wlan'), hidden: '!!data.hideDetails' },
            switchWlan: {
                type: 'checkbox',
                default: false,
                label: w('vis_switch_wlan'),
                help: w('vis_switch_wlan_tooltip'),
                hidden: '!!data.hideDetails || data.showWlan === false',
            },
            showMessages: {
                type: 'checkbox',
                default: true,
                label: w('vis_show_messages'),
                help: w('vis_show_messages_tooltip'),
                hidden: '!!data.hideDetails',
            },
            noMesh: { type: 'checkbox', default: false, label: w('vis_no_mesh'), help: w('vis_no_mesh_tooltip') },
        },
    };
}

function meshSettings(w: ManifestTexts['word']): Settings {
    return {
        type: 'panel',
        items: {
            instance: instanceSetting(w),
            title: { type: 'text', label: w('vis_title') },
            interval: {
                type: 'number',
                min: 10,
                max: 3600,
                default: 30,
                label: w('vis_interval'),
                help: w('vis_interval_tooltip'),
            },
            viewHeader: { type: 'header', text: w('vis_view_defaults') },
            view: {
                type: 'select',
                default: 'graph',
                label: w('vis_view'),
                options: [
                    { value: 'graph', label: w('vis_view_graph') },
                    { value: 'table', label: w('vis_view_table') },
                ],
            },
            onlyConfigured: { type: 'checkbox', default: false, label: w('vis_only_configured') },
            showDisconnected: { type: 'checkbox', default: false, label: w('vis_show_disconnected') },
            showVendor: { type: 'checkbox', default: true, label: w('vis_show_vendor') },
        },
    };
}

function presenceSettings(w: ManifestTexts['word']): Settings {
    return {
        type: 'panel',
        items: {
            instance: instanceSetting(w),
            mode: {
                type: 'select',
                default: 'devices',
                label: w('vis_mode'),
                help: w('vis_mode_tooltip'),
                options: [
                    { value: 'devices', label: w('vis_mode_devices') },
                    { value: 'persons', label: w('vis_mode_persons') },
                ],
            },
            group: {
                type: 'text',
                label: w('vis_group'),
                help: w('vis_group_tooltip'),
                hidden: "data.mode !== 'persons'",
            },
            title: { type: 'text', label: w('vis_title') },
            onlyActive: { type: 'checkbox', default: false, label: w('vis_only_active') },
            activeFirst: { type: 'checkbox', default: true, label: w('vis_active_first') },
            showAccessPoint: {
                type: 'checkbox',
                default: true,
                label: w('vis_show_access_point'),
                hidden: "data.mode === 'persons'",
            },
            showGuests: {
                type: 'checkbox',
                default: true,
                label: w('vis_show_guests'),
                help: w('vis_show_guests_tooltip'),
                hidden: "data.mode !== 'persons'",
            },
        },
    };
}

function personSettings(w: ManifestTexts['word']): Settings {
    return {
        type: 'panel',
        items: {
            person: {
                type: 'objectId',
                types: 'channel',
                // every instance of the adapter; the element takes the instance from the ID
                root: ADAPTER,
                label: w('vis_person'),
                help: w('wc_personHelp'),
            },
            showName: { type: 'checkbox', default: true, label: w('vis_show_name') },
            nameText: {
                type: 'text',
                label: w('vis_name'),
                help: w('vis_person_name_tooltip'),
                hidden: 'data.showName === false',
            },
            image: { type: 'text', label: w('vis_image'), help: w('wc_imageHelp') },
            grayAbsent: { type: 'checkbox', default: true, label: w('vis_gray_absent') },
            presentHeader: { type: 'header', text: w('vis_when_present') },
            presentText: { type: 'text', label: w('vis_text'), help: w('vis_present_text_tooltip') },
            presentColor: { type: 'color', label: w('vis_color') },
            absentHeader: { type: 'header', text: w('vis_when_absent') },
            absentText: { type: 'text', label: w('vis_text'), help: w('vis_absent_text_tooltip') },
            absentColor: { type: 'color', label: w('vis_color') },
            timesHeader: { type: 'header', text: w('vis_times') },
            showDuration: { type: 'checkbox', default: true, label: w('vis_show_duration') },
            showArrival: { type: 'checkbox', default: true, label: w('vis_show_arrival') },
            showDeparture: { type: 'checkbox', default: true, label: w('vis_show_departure') },
            showToday: { type: 'checkbox', default: false, label: w('vis_show_today') },
            showDevices: { type: 'checkbox', default: false, label: w('vis_show_devices') },
            historyHeader: { type: 'header', text: w('vis_history') },
            showHistory: {
                type: 'checkbox',
                default: true,
                label: w('vis_show_history'),
                help: w('vis_show_history_tooltip'),
            },
            historyCount: {
                type: 'number',
                default: 10,
                min: 1,
                max: 100,
                label: w('vis_history_count'),
                hidden: 'data.showHistory === false',
            },
            historyDays: {
                type: 'number',
                default: 7,
                min: 1,
                max: 365,
                label: w('vis_history_days'),
                help: w('vis_history_days_tooltip'),
                hidden: 'data.showHistory === false',
            },
            showExport: {
                type: 'checkbox',
                default: true,
                label: w('vis_show_export'),
                help: w('vis_show_export_tooltip'),
                hidden: 'data.showHistory === false',
            },
        },
    };
}

function guestWlanSettings(w: ManifestTexts['word']): Settings {
    return {
        type: 'panel',
        items: {
            instance: instanceSetting(w),
            wlan: {
                type: 'select',
                default: 'guest',
                label: w('vis_qr_wlan'),
                help: w('vis_qr_wlan_tooltip'),
                options: ['guest', 'wlan24', 'wlan50', 'wlan52', 'wlan60'].map(kind => ({
                    value: kind,
                    label: w(`vis_qr_wlan_${kind}`),
                })),
            },
            mode: {
                type: 'select',
                default: 'dialog',
                label: w('vis_guest_mode'),
                options: [
                    { value: 'tile', label: w('vis_guest_mode_tile') },
                    { value: 'dialog', label: w('vis_guest_mode_dialog') },
                    { value: 'pin', label: w('vis_guest_mode_pin') },
                ],
            },
            pin: {
                type: 'password',
                label: w('vis_guest_pin'),
                help: w('fritzdm_guestPinHelp'),
                hidden: "data.mode !== 'pin'",
            },
            autoClose: {
                type: 'number',
                default: 60,
                min: 0,
                max: 3600,
                label: w('vis_guest_auto_close'),
                help: w('vis_guest_auto_close_tooltip'),
                hidden: "data.mode === 'tile'",
            },
            title: { type: 'text', label: w('vis_title'), help: w('vis_guest_title_tooltip') },
            showSsid: { type: 'checkbox', default: true, label: w('vis_guest_show_ssid') },
            showPassword: { type: 'checkbox', default: true, label: w('vis_guest_show_password') },
        },
    };
}

/**
 * The manifest of a component
 *
 * @param key the component
 * @param texts where the texts come from
 */
export function buildManifest(key: ComponentKey, texts: ManifestTexts): WebComponentManifest {
    const w = texts.word;
    const base = {
        $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
        manifestVersion: 1 as const,
        tag: COMPONENTS[key].tag,
        module: moduleFile(key),
    };
    switch (key) {
        case 'fritzbox': {
            const native = texts.deviceWidget('FritzBoxComponent');
            return {
                ...base,
                name: native.label,
                description: native.description,
                // relative to this file: the icon of the devices widget, /adapter/tr-064/dm-widgets/fritzbox.png
                icon: '../dm-widgets/fritzbox.png',
                size: { width: 360, height: 280 },
                settings: fritzBoxSettings(w),
            };
        }
        case 'mesh':
            return {
                ...base,
                name: w('vis_mesh'),
                description: w('vis_mesh_help'),
                icon: '../tr-064.png',
                size: { width: 720, height: 480 },
                settings: meshSettings(w),
            };
        case 'presence':
            return {
                ...base,
                name: w('vis_presence'),
                description: w('vis_presence_help'),
                icon: '../tr-064.png',
                size: { width: 320, height: 360 },
                settings: presenceSettings(w),
            };
        case 'person': {
            const native = texts.deviceWidget('PersonComponent');
            return {
                ...base,
                name: native.label,
                description: native.description,
                icon: '../dm-widgets/person.svg',
                size: { width: 300, height: 340 },
                settings: personSettings(w),
            };
        }
        case 'guest-wlan': {
            const native = texts.deviceWidget('GuestWlanComponent');
            return {
                ...base,
                name: native.label,
                description: native.description,
                icon: '../dm-widgets/guest-wlan.svg',
                size: { width: 220, height: 280 },
                settings: guestWlanSettings(w),
            };
        }
    }
    throw new Error(`Unknown web component "${String(key)}"`);
}
