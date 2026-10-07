# Older changes
## 5.1.0 (2026-09-19)
- (@GermanBluefox) New widgets for vis-2 ("FRITZ!Box", "Mesh topology", "Presence") and for `ioBroker.devices` ("FRITZ!Box"): the state of the box as a tile, a click shows the mesh topology
- (@GermanBluefox) New states `boxModel` and `boxFirmware`
- (@GermanBluefox) The table in the tab "Devices" uses the whole width again: in 5.0.2 it was so narrow that name, IP and MAC could not be read
- (@GermanBluefox) "Search for devices" works with many devices: the adapter reads the list of all devices in one request (`X_AVM-DE_GetHostListPath`) instead of one request per device, which took longer than the 20 seconds of the button. The search is always answered, also when a request fails, the box has no devices or the adapter is not connected
- (@GermanBluefox) Fixed the crash `systemData.save is not a function` on start when a call list is generated: installations which ran an adapter version from 2017 to 2020 still had an invalid attribute `save` in the object `tr-064.<instance>`, which is removed now
- (@GermanBluefox) `wlanGuest` switches the guest WLAN again on boxes with three bands (e.g. FRITZ!Box 5690 Pro, 4060) instead of the third band: the guest WLAN is always the last WLAN configuration of the box
- (@GermanBluefox) New states `wlan60` and `wlan60Password` for the 6 GHz WLAN, and `wlan52` and `wlan52Password` for the second 5 GHz WLAN (e.g. FRITZ!Box 4060). The adapter asks the box which band its third WLAN uses
- (@GermanBluefox) The call lists do not stop updating after some hours anymore: the call monitor detects a connection which the box dropped unnoticed (e.g. by a restart) with TCP keepalive and reconnects, and the call lists are also read once a minute - that way they are updated without call monitor, too
- (@GermanBluefox) A call list download which the box does not answer is given up after 10 seconds with a warning
- (@GermanBluefox) `states.wlan` switches all WLANs like the WLAN button of the FRITZ!Box (`X_AVM-DE_SetWLANGlobalEnable`) and shows its state: switching on does not switch on the guest WLAN and bands which were off any more
- (@GermanBluefox) New states for the internet connection: `wanAccessType` (e.g. `LTE` during a fallback to a mobile connection), `wanLinkStatus`, `wanProvider`, `wanDownstreamMax`, `wanUpstreamMax`, and the traffic `wanBytesSent`, `wanBytesReceived` (64 bit counters), `wanSendRate`, `wanReceiveRate`
- (@GermanBluefox) New states `devices.xxx.accessPoint` and `devices.xxx.connection`: the FRITZ!Box or repeater a device is connected to and the band, read from the mesh topology. The new tab "Mesh" in the settings shows the mesh topology as a graphic. Admin 8 is required now
- (@GermanBluefox) New option "Read the event log of the FRITZ!Box": the complete event log including the logins to the user interface in `deviceLog.json`, new events in `deviceLog.newEvents`
- (@GermanBluefox) New state `callmonitor.connected` shows whether the call monitor is connected, and `callmonitor.*.device` the name of the telephone of a call
- (@GermanBluefox) New table "Phone book per own number": a number which is in several phone books gets its name from the phone book of the own number of the call
- (@GermanBluefox) New option "Write unchanged values too": every polled value is written with a new time stamp
- (@GermanBluefox) A single call forwarding of the FRITZ!Box is shown in `callForwarding` now - before, the states were only created from the second call forwarding on. With only one phone number the name of the number is added to the name of the state again, and a box without call forwardings does not delay the poll cycle by 3 seconds any more
- (@GermanBluefox) The call monitor does not lose events any more when the FRITZ!Box sends two of them in one network packet (e.g. `RING` and `DISCONNECT` of a very short call) or one event in two packets: the received data is split into lines now
- (@GermanBluefox) The call lists do not freeze for good any more when the FRITZ!Box numbers its calls from the beginning again, e.g. after exchanging the box, a factory reset or a restart: the adapter asked only for the calls after the last known call ID and got an empty list forever. It now checks an empty answer against the newest call of the box and builds the lists again from the call list of the box; only calls after the newest known call increase the counters. The meta object `tr-064.<instance>` is only written when the lists changed, not with every refresh
- (@GermanBluefox) New state `states.abNewMessages`: number of new (not yet listened) messages on the answering machines
- (@GermanBluefox) The MAC addresses of the configured devices are sent to the box in its own format `AA:BB:CC:DD:EE:FF`, so addresses entered in lower case, with dashes or without separators are found
- (@GermanBluefox) A configured device which the box does not know (or which is offline since the start) is logged once with a hint to check its MAC address and listed as inactive in `jsonDeviceList`, instead of silently being left out
- (@GermanBluefox) New option "Name the objects after this table" in the tab "Devices": the objects below `devices` get the names of the table instead of the names in the Fritz!Box, so two devices with the same name in the box are not mixed up any more. When the option is switched on, the objects which were created with the name of the box are deleted. mDNS writes into the same objects as the poll now - before it created additional objects with the name of the table
- (@GermanBluefox) A device can have several MAC addresses, separated by commas (e.g. a smartphone with a private Wi-Fi address in the home and the guest Wi-Fi): it is present if one of them is active. Changing the spelling of a MAC address does not delete the objects of the device any more, and "Search for devices" does not add a device of the table a second time
- (@GermanBluefox) A device request which the box does not answer does not stop the presence detection and the polling any more
- (@GermanBluefox) An info message tells when "Create JSON device list" is switched on, but no devices are configured
- (@GermanBluefox) The adapter connects to a FRITZ!Box whose WLAN is switched off: the check of the login used the WLAN, which the box answers with an error then, so the adapter restarted (4.x) or retried forever without creating its objects (5.0). A refused login is reported with a hint to check user, password and rights of the user instead of the advice to restart the box
- (@GermanBluefox) The adapter does not hang silently any more when the FRITZ!Box does not deliver the description of a service (e.g. `x_speedtestSCPD.xml` with FRITZ!OS 8.24 Labor): after 10 seconds the service is skipped with a warning, and the connection is limited to 60 seconds and retried
- (@GermanBluefox) The debug log does not contain sensitive data any more, so it can be shared to analyze problems: phone numbers, names, phone book and call data, host names, MAC and IP addresses, values of states and results of `states.command` are only logged with level `silly`, and the session ID in URLs of the box is never logged. The result of `states.command` is no longer logged with level info - it is still written into `states.commandResult`
- (@GermanBluefox) The call monitor does not stop any more when the FRITZ!Box refuses the connection, e.g. while it restarts after a firmware update: it retries every 60 seconds and reconnects on its own. The hint to open port 1012 with `#96*5*` is only logged if the call monitor was never connected


## 5.0.2 (2026-09-10)
- (@GermanBluefox) Fixed the crash `Cannot read properties of undefined (reading 'safe')` in `getWLAN` right after the start: the WLAN states are read again in every poll cycle
- (@GermanBluefox) A box without a separate 5 GHz configuration does not delay the polling by 3 seconds any more

## 5.0.1 (2026-09-09)
- (@GermanBluefox) **Breaking change:** the adapter requires node.js >= 22 now
- (@GermanBluefox) Adapter requires admin >= 7.7.22 now
- (@GermanBluefox) Adapter requires js-controller >= 6.0.11 now
- (@GermanBluefox) The adapter does not stop any more if the Fritz!Box cannot be reached. The connection is retried every 30 seconds, and the new state `info.connection` shows whether the box answers
- (@justr1) Expected disconnects of the call monitor (`ETIMEDOUT`, `ECONNRESET`, `EPIPE`) are logged as info now, because the adapter reconnects on its own
- (@GermanBluefox) The mDNS socket is closed when the adapter stops, so a restart does not leave a listener behind
- (@GermanBluefox) A phone book with only one contact is read now
- (@GermanBluefox) The hint how to open port 1012 is shown again if the call monitor is refused by the Fritz!Box
- (@GermanBluefox) The adapter was refactored to TypeScript. The sources are in `src/`, the adapter runs from `build/`
- (@GermanBluefox) The configuration dialog was rewritten as JsonConfig. Admin 7.7.22 or newer is required for it
- (@GermanBluefox) The adapter can only be installed from npm now, no longer directly from GitHub (`common.nogit`)
- (@GermanBluefox) The options "Use call forwarding options", "Use mDNS" and "Create JSON device list" have a default value in `io-package.json` now
- (@GermanBluefox) The command `dumpservices.fs` writes the file again instead of stopping the adapter

## 4.3.0 (2024-04-30)
* (mcm1957) Adapter requires node.js >= 18 and js-controller >= 5 now
* (mcm1957) Dependencies have been updated

## 4.2.18 (2023-01-04)
* (Apollon77) Prepare for future js-controller versions

## 4.2.17 (2022-09-16)
* (simatec/Apollon77) Prevent duplication of entries in configuration
* (Apollon77) Make sure the active status of devices in jsonDeviceList is correct

## 4.2.16 (2022-03-21)
* (Apollon77) Fix info logs on callee/caller
* (Apollon77) Add special handling for potential broken external image links in a phonebook
* (Apollon77) Prevent some crash cases reported by Sentry

## 4.2.15 (2021-12-08)
* (bluefox) fix crash case (Sentry IOBROKER-TR-064-35)

## 4.2.14 (2021-07-21)
* (Apollon77) Further optimizations for js-controller 3.3

## 4.2.13 (2021-07-12)
* (Apollon77) Optimize for js-controller 3.3 and prevent warnings (you pot. need to delete datapoints if you still see errors, they will be recreated)

## 4.2.12 (2021-04-16)
* (Apollon77) prevent html template for call lists to be overwritten by default one
* (Apollon77) fix crash case (Sentry IOBROKER-TR-064-2M)

## 4.2.11 (2021-03-12)
* (Apollon77) fix id-reset detection for single calls

## 4.2.10 (2021-03-11)
* (Apollon77) better handle caller id resets by reboots/FW updates to also update list specific counter and log when this happened

## 4.2.9 (2021-03-10)
* (Apollon77) try to better handle calllist resets on FW updates
* (Apollon77) Make sure jsonDeviceList do not get deleted on start
* (Apollon77) Better handle not initialized calllist templates

## 4.2.8 (2021-03-09)
* (Apollon77) Optimize customized HTML templates if state is empty

## 4.2.7 (2021-03-08)
* (Apollon77) Allow customized HTML templates again

## 4.2.6 (2021-02-18)
* (Apollon77) Fix crash case (IOBROKER-TR-064-20)
* (Apollon77) Get calllists working again

## 4.2.4 (2021-02-02)
* (Apollon77) Prevent crash case (Sentry IOBROKER-TR-064-1T)

## 4.2.3 (2021-01-16)
* (Apollon77) Crash case prevented (Sentry IOBROKER-TR-064-1N)

## 4.2.2 (2020-12-25)
* (Apollon77) Crash case prevented (Sentry IOBROKER-TR-064-1K)

## 4.2.1 (2020-11-13)
* (Apollon77) try to fix pot. not working disabling commands

## 4.2.0 (2020-11-09)
* (Apollon77) Crash case prevented (Sentry IOBROKER-TR-064-15, IOBROKER-TR-064-16)
* (Apollon77) Try to solve error 500 problem with offline devices
* (SliX185) Add IPv6 states
* (foxriver76) optimizations
* (Apollon77) Fix initialization if ip/host

## 4.1.0 (2020-09-17)
* (Apollon77) Fix crash case (Sentry IOBROKER-TR-064-14)
* (bazidibavaria) added tablesort to device search
* (bazidibavaria) added Fritzbox link to admin

## 4.0.13 (2020-08-17)
* (Apollon77) Crash prevented (Sentry IOBROKER-TR-064-10)

## 4.0.12 (2020-08-06)
* (Apollon77) Crash prevented (Sentry IOBROKER-TR-064-Y)

## 4.0.11 (2020-07-26)
* (Apollon77) Crash prevented (Sentry IOBROKER-TR-064-W)

## 4.0.9 (2020-07-01)
* (Apollon77) handle cases correctly when no hosts are existing on device (Sentry IOBROKER-TR-064-R)

## 4.0.8 (2020-06-20)
* (Apollon77) Make sure states are only subscribed if initialization is done (Sentry IOBROKER-TR-064-J)

## 4.0.7 (2020-06-09)
* (Apollon77) Fix Admin UI to allow setting poll Interval correctly again

## 4.0.4 (2020-06-05)
* (Apollon77) Make sure adapter do not crash of no calls were returned (Sentry IOBROKER-TR-064-D)
* (Apollon77) Make sure adapter do not crash when invalid parameter are provided (Sentry IOBROKER-TR-064-B)
* (Apollon77) https is not supported right now (Sentry IOBROKER-TR-064-E)

## 4.0.3 (2020-05-11)
* (Apollon77) Make sure adapter do not crash of no calls were returned (Sentry IOBROKER-TR-064-7)
* (Apollon77) Make sure adapter do not crash when providing a non string to "ring" state (Sentry IOBROKER-TR-064-8)

## 4.0.1 (2020-04-23)
* (Apollon77) handle case where no Phone deflections are available (Sentry IOBROKER-TR-064-1/2)

## 4.0.0 (2020-04-12)
* (Apollon77) update dependencies, use auto decrypt features with js-controller 3.0
* (foxriver76) make callmonitor compatible with js-controller 3.0

## 3.1.4 (2020-01-26)
* (Apollon77) fix error and check some other code check comments
* (Apollon77) Add proper meta data for buttons

## 3.1.1 (2020-01-25)
* (bluefox) Configuration dialog was improved
* (bluefox) Soef library was removed

## 3.0.0 (2020-01-24)
* (Apollon77) Switch Name back to tr064 because ewe got it from npmjs
* (maeb3) Enhance call handling and fix wrong data for currently active calls 
* (Apollon77) Remove unused state phonebook.ringing

## 2.0.3 (2019-12-17)
* (Jey Cee) fix delete last device from list

## 2.0.2 (2019-12-16)
* __requires js-controller v2__
* (foxriver76) no longer use adapter.objects
* (Apollon77) several fixes, Call lists working again, Phonebook fixed and many more

## 1.1.0 (2019-11-10)
* (jey cee) added Admin v3 support

## 1.0.0 (2019-04-01)
* (ldittmar) first version for the community