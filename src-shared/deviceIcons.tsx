/**
 * Symbol of a device for the mesh topology.
 *
 * The FRITZ!Box classifies every device of the home network (`device_class` of the mesh list, or
 * `device_class_user` if the user has set it) - the same classes its own web interface uses for
 * the symbols. An unknown class gets the generic symbol, so a new class of a future firmware does
 * not leave a hole.
 *
 * Only names which are listed in `src-devices/src/bridge/mui-icons.ts` may be imported here:
 * ioBroker.devices does not share `@mui/icons-material`, the bridge hands over the host's module.
 */
import React from 'react';

import {
    AcUnit,
    Blinds,
    Computer,
    DeveloperBoard,
    DevicesOther,
    Doorbell,
    Lan,
    Lightbulb,
    Lock,
    Monitor,
    Phone,
    PhoneInTalk,
    Power,
    Print,
    Router,
    Sensors,
    Smartphone,
    SmartToy,
    Speaker,
    SportsEsports,
    Storage,
    Tablet,
    Thermostat,
    TouchApp,
    Tv,
    Videocam,
    Watch,
} from '@mui/icons-material';

/** The icon component of a `device_class` of the box */
const ICONS: Record<string, typeof DevicesOther> = {
    COMPUTER: Computer,
    STORAGE: Storage,
    SMARTPHONE: Smartphone,
    TABLET: Tablet,
    GAMING_DEVICE: SportsEsports,
    SET_TOP_BOX: Tv,
    PRINTER: Print,
    NETWORK_SWITCH: Lan,
    SPEAKER: Speaker,
    ROBOT: SmartToy,
    PHONE: Phone,
    IP_PHONE: PhoneInTalk,
    CIRCUIT_BOARD: DeveloperBoard,
    CAMERA: Videocam,
    DOOR_LOCK: Lock,
    DOOR_BELL: Doorbell,
    SHUTTER: Blinds,
    AIR_CONDITIONER: AcUnit,
    LAMP: Lightbulb,
    THERMOSTAT: Thermostat,
    BUTTON: TouchApp,
    SOCKET: Power,
    SENSOR: Sensors,
    MONITOR: Monitor,
    SMART_WATCH: Watch,
    ROUTER: Router,
};

/**
 * The symbol of a device class, `DevicesOther` for `GENERIC` and for everything unknown
 *
 * @param deviceClass `deviceClass` of a node of the topology
 */
export function deviceIcon(deviceClass?: string): typeof DevicesOther {
    return (deviceClass && ICONS[deviceClass]) || DevicesOther;
}

/**
 * The symbol of a device inside the SVG of the graph.
 *
 * A MUI icon is an `<svg>` of its own, which SVG allows inside another one, placed by `x`/`y`.
 * The size has to be given as **attributes**: a browser sizes a nested `<svg>` by them and not by
 * the `width`/`height` of the style, so MUI's `1em` by CSS is not enough - without the attributes
 * the icon falls back to the size of the whole graph. The style sets them as well, which costs
 * nothing and keeps the icon right if a browser does follow the CSS.
 *
 * @param props the class of the device, the upper left corner and the size in SVG units
 */
export function DeviceIcon(props: {
    deviceClass?: string;
    x: number;
    y: number;
    size: number;
    color: string;
}): React.JSX.Element {
    const Icon = deviceIcon(props.deviceClass);
    return (
        <Icon
            x={props.x}
            y={props.y}
            width={props.size}
            height={props.size}
            sx={{ width: props.size, height: props.size, color: props.color }}
        />
    );
}
