![Logo](admin/tr-064.png)
# ioBroker.tr-064

![Number of Installations](http://iobroker.live/badges/tr-064-installed.svg)
![Number of Installations](http://iobroker.live/badges/tr-064-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.tr-064.svg)](https://www.npmjs.com/package/iobroker.tr-064)

![Test and Release](https://github.com/iobroker-community-adapters/iobroker.tr-064/workflows/Test%20and%20Release/badge.svg)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/tr-064/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)
[![Downloads](https://img.shields.io/npm/dm/iobroker.tr-064.svg)](https://www.npmjs.com/package/iobroker.tr-064)


**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.

## Info
This adapter reads main information from AVM Fritz!Box, like call list or number of messages on answering machine.
Based on this [AVM documentations](https://avm.de/service/schnittstellen/)

## Needed Settings in your Fritzbox:
* You need to change the Login to "Use Username and password"
  * The maximum relevant password length for FritzBox is 32 characters! FritzBox cuts the password silently in the UI. Please make sure to enter only the 32 relevant characters in the adapter configuration
* Create a user and allow him to "control the Fritzbox and settings"
* Enable Application Access (on Network tab). Click flow in german: Netzwerk ->Heimnetzfreigaben -> Zugriff für Anwendungen -> aktiviert
* If you want to use the "ring" function you need to set additional settings (see below)

## Initial Creation
This adapter was initially created by @soef at https://github.com/soef/ioBroker.tr-064 but not maintained any more, so we moved it to iobroker-community so that bugs could be fixed. thanks @soef for his work.

## How to migrate from tr-064-community (intermediate version and name)
If you move from tr-064-community adapters you can easily copy whole device list or settings by:
* Go in admin to objects and enable expert mode
* Look for an object tree which is called system.adapter.tr-064-community.0 (where 0 is the instance, if you had multiple instances select the right one)
* On the very right of this line is a button with a pencil, click on it
* On the window you get select "raw (experts only)" and there copy the NATIVE part of the json
* then open system.adapter.tr-064.0 (where 0 is the instance, if you had multiple instances select the right one)
* paste the copied native part in there in native
* save the changes
* start the adapter
* check configuration if anything was restored correctly

## Features
### Simple states and functions
- turn on/off wifi for 2.4GHz and 5GHz,
- turn on/off guest wifi,
- reboot Fritz!Box,
- start WPS process,
- reconnect Internet
- external ip address

### ring (dial a number)
- When using an internal number (like **610) the ring state will let ring that internal phone. E.g.: **610[,timeout]
- When using an external number, the ring state will connect you to the external number.
 The Fritz!Box will call the external number and your default phone will ring, when the called phone is picked up.
 The default phone can be configured in the Fritz!Box under:
 Telefonie/Anrufe/[Tab]Wahlhilfe/Wählhilfe verwenden . Please also make sure to choose "Verbindung mit dem Telefon ISDN- und Schnurlostelefone"

### toPauseState
- Values: ring, connect, end
- Can be used to pause a video player on an incoming call (ring), or on pick up the phone (connect).
- Resume can be done on the end value.

### Presence
To monitor the presence of persons in your home, so to control once anyone of your family/roommate is leaving or arriving, you can use this adapter as follows: 
- Enter the Adapter options and switch to the 'Devices' tab
- Add all devices (like smart phones) of your family/roommate members accordingly, and confirm with 'Save'.
- For each device, the adapter will now create a folder structure under the ioBroker Objects of the adapter, typically in the folder "tr-064.0.devices"
- Now once anyone is arriving or leaving, this adapter will get the information accordingly. For example, the state "tr-064.0.devices.xxx.active", where xxx is the device name, will indicate if the specific device is available or not, so if the person is present or not. User feedback is that this works reliable for iOS devices as well, like with iPhones. For iPhones, user feedback is that it takes up to 10 minutes until the Fritz!Box notices that a person left and is no longer connected with WiFi, and it takes up to 1 minute until the Fritz!Box will notice the presence again.

Also, a script was published by the ioBroker community which uses this adapter information to trigger actions (e.g. everyone left home, so turn off everything automatically, see number of persons currently being present, or person status in general, via VIS, etc.). See [ioBroker forum thread](https://forum.iobroker.net/topic/4538/anwesenheitscontrol-basierend-auf-tr64-adapter-script) (in German)

### AB - `Anrufbeantworter` (answering machine)
Can be switched on/off.
The state cbIndex can be set, to address # of the answering machine.

### Call monitor
The call monitor will create realtime states for every inbound and outbound call.
If the phone book is enabled (default), numbers will be resolved to Names
There ist also a state indicating a ringing phone.

### Phone book
- The phone book, if enabled, will be used to get the name of callers phone number.
- Further there are three states to resolve a number or a name. If available you will also get the image URL of the contact.
  e.g.: if you set the state `phonebook.number` all 3 states, name, number and image will be set to the found contact. Note, searches by name will first compare the complete name, if not found, part of is used.

### Call lists
Output formats:
- `json`
- `html`

Call lists are:
- all calls
- missed calls
- inbound calls
- outbound calls

Call count:
The call count can be set to 0. The next call will increment 1.

The html output can be configured by a template.

### command & commandResult state
With the command state you can call every tr-064 command from this [documentation](https://avm.de/service/schnittstellen/).
e.g.

```javascript
command = {
    "service": "urn:dslforum-org:service:WLANConfiguration:1",
    "action": "X_AVM-DE_SetWPSConfig",
    "params": {
        "NewX_AVM-DE_WPSMode": "pbc",
        "NewX_AVM-DE_WPSClientPIN": ""
    }
};
```

The command state should be set to a JSON of the above Lines. So { ... } (without command = and line breaks)
The callback of the call will set the commandResult state.


Here you will find an example how to switch the answering machine in the Fritzbox on and off by using the command state. For testing you can just copy & paste the string into the state tr-064.0.states.command

Switch the answering machine on: 
`{"service": "urn:dslforum-org:service:X_AVM-DE_TAM:1","action": "SetEnable", "params": {"NewIndex": "0","NewEnable": "1"}}`

Switch the answering machine off: 
`{"service": "urn:dslforum-org:service:X_AVM-DE_TAM:1","action": "SetEnable", "params": {"NewIndex": "0","NewEnable": "0"}}`

A detailed description of the actions and parameters for TAM you can find here https://avm.de/fileadmin/user_upload/Global/Service/Schnittstellen/x_tam.pdf (link is contained in the AVM documentation above).


### Enable call monitor
To use the call monitor feature it must be first enabled in the AVM Fritz!Box.
To enable the call monitor dial ```#96*5*```  and the TCP/IP Port 1012 will be opened. To close the port dial ```#96*4*```.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### 4.3.0 (2024-04-30)
* (mcm1957) Adapter requires node.js >= 18 and js-controller >= 5 now
* (mcm1957) Dependencies have been updated

### 4.2.18 (2023-01-04)
* (Apollon77) Prepare for future js-controller verisons

### 4.2.17 (2022-09-16)
* (simatec/Apollon77) Prevent duplication of entries in configuration
* (Apollon77) Make sure active status of devices in jsonDeviceList is correct

### 4.2.16 (2022-03-21)
* (Apollon77) Fix info logs on callee/caller
* (Apollon77) Add special handling for potential broken external image links in phonebook
* (Apollon77) Prevent some crash cases reported by Sentry

### 4.2.15 (2021-12-08)
* (bluefox) fix crash case (Sentry IOBROKER-TR-064-35)

## License
The MIT License (MIT)

Copyright (c) 2023-2024 ioBroker Community Developers <iobroker-community-adapters@gmx.de>  
Copyright (c) 2015-2023 soef <soef@gmx.net>, ioBroker-Community-Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
