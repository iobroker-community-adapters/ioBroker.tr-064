/**
 * The answer of the message `help`: what the instance answers, written for an AI agent (e.g. ioBroker.pi-agent, or
 * the MCP server with `send_to`) and for script authors. Keep it in sync with `onMessage` in main.ts and the README.
 */

/** One command which `onMessage` answers; `write` = it changes something */
export interface HelpCommand {
    command: string;
    write: boolean;
}

/** The commands `onMessage` answers */
export const COMMANDS: HelpCommand[] = [
    { command: 'help', write: false },
    { command: 'presence', write: false },
    { command: 'discovery', write: false },
    { command: 'mesh', write: false },
    { command: 'guestWlan', write: false },
    { command: 'setHostName', write: true },
    { command: 'personList', write: false },
];

export const HELP = `ioBroker.tr-064: connects to an AVM FRITZ!Box over TR-064. It switches the WLANs, restarts the box, lets a phone
ring, reads call lists, answering machine and phone book, reports calls (call monitor) and watches which devices and
persons are at home. An agent can ask who is at home, which devices are in the network and where they are connected
(mesh), read the access data of a WLAN, rename a device in the box, and switch things by writing the states below.

Commands (sendTo tr-064.0):
- presence: the persons of the tab "Persons": {persons: [{name, id, group, present, lastArrival, lastDeparture}],
  groups: [names]}. present null = not determined yet; lastArrival / lastDeparture in ms since 1970, 0 = unknown;
  id = the channel of the person (states present, presentSince, absentSince, history ...).
- discovery {onlyActive?, reread?}: the devices the box knows (its host list) as a JSON string
  '[{"name", "ip", "mac", "active"}]'. onlyActive true = only the active ones. The list is cached, reread true
  reads it from the box again. Not connected: '[]'.
- mesh: the mesh topology: {error?, ts, canRename, nodes: [{uid, name, mac, ip?, model?, role (master, slave,
  switch, client), configured? (name in the tab "Devices"), vendor?, deviceClass?, position? (too_close, too_far,
  ok)}], links: [{from (the access point side), to, type (WLAN, LAN ...), state (CONNECTED, DISCONNECTED),
  interface, band? (2.4, 5, 6), curDown?, curUp?, maxDown?, maxUp? (kbit/s), rcpiFrom?, rcpiTo? (dBm),
  lastConnected? (ms)}]}. error: "not connected", "not supported" or the error of the box.
- guestWlan {wlan?}: name and password of a WLAN, e.g. for a QR code: {enabled, ssid, password, security (WPA, WEP,
  nopass), hidden} or {error}. wlan: guest (default), wlan24, wlan50, wlan52, wlan60; a band the box does not have
  gives "not supported", an unknown name "unknown wlan". Needs the right "FRITZ!Box settings" of the box user.
- setHostName {mac, name}: renames a device in the box (name at most 63 characters): {} or {error}. The channel of
  the device below devices follows the name in the box unless "Name the objects after this table" is on.
- personList: for the settings, not for agents.

States (tr-064.0.*), written with ack false; ignored while the box is not connected:
- states.wlan (all WLANs, like the WLAN button), states.wlan24, wlan50, wlan52, wlan60 (only if the box has the
  band), states.wlanGuest: true / false switches the WLAN on / off.
- states.wlan24Password, wlan50Password, wlan52Password, wlan60Password, wlanGuestPassword: sets the passphrase.
- states.reboot (button): restarts the box. states.reconnectInternet (button): new internet connection (new IP).
- states.wps: true starts WPS (push button), false stops it.
- states.ring: "<number>[,<seconds>]": an internal number (e.g. **610) lets that phone ring, an external number is
  dialed by the box and connected to its default phone (Waehlhilfe); <seconds> hangs up after that time.
- states.abIndex: the answering machine (0 = the first) for states.ab; states.ab: true / false switches it on / off.
- states.command: JSON {"service", "action", "params"} calls any TR-064 action of the box, e.g. {"service":
  "urn:dslforum-org:service:X_AVM-DE_TAM:1", "action": "SetEnable", "params": {"NewIndex": "0", "NewEnable": "1"}};
  the answer (JSON) is written into states.commandResult.
- phonebook.number or phonebook.name: write a number or a name; the adapter writes name, number and image of the
  contact it found into phonebook.* (only with the phone book switched on).
- Read: states.abNewMessages, states.externalIP, externalIPv6, boxModel, boxFirmware, wanAccessType, wanLinkStatus,
  wanProvider, wanDownstreamMax, wanUpstreamMax, wanSendRate, wanReceiveRate; devices.<name>.active (a device of the
  tab "Devices" is online), accessPoint, connection; presence.persons.<name>.present, presence.present, allPresent,
  presentNames; callmonitor.ringing, callmonitor.inbound / outbound / connect / lastCall.*; calllists.*;
  deviceLog.json; info.connection (the box answers).

How to talk to the user:
- Name devices and persons by name, not by MAC or IP; times in local time.
- Ask which WLAN is meant (guest WLAN or the own one) before switching it or reading its password.
- Only on the user's explicit request and after confirmation: states.reboot and states.reconnectInternet (the
  internet and the WLAN drop for minutes), switching off the own WLAN (devices in the house lose the network),
  changing a WLAN password, setHostName, states.command with an action that changes something, states.ring.
- The password of guestWlan opens the network: give it only to the user who asked for it, never into a log or a
  message to other people.`;
