<h1>
  <img src="https://raw.githubusercontent.com/ldittmar81/ioBroker.tr-064-community/master/admin/tr-064-community.png" width="64"/>
  ioBroker.tr-064-community
</h1>

![Number of Installations](http://iobroker.live/badges/tr-064-community-installed.svg) 
![Number of Installations](http://iobroker.live/badges/tr-064-community-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.tr-064-community.svg)](https://www.npmjs.com/package/iobroker.tr-064-community)
[![Downloads](https://img.shields.io/npm/dm/iobroker.tr-064-community.svg)](https://www.npmjs.com/package/iobroker.tr-064-community)

[![NPM](https://nodei.co/npm/iobroker.tr-064-community.png?downloads=true)](https://nodei.co/npm/iobroker.tr-064-community/)

[![Travis-CI](http://img.shields.io/travis/iobroker-community-adapters/ioBroker.tr-064-community/master.svg)](https://travis-ci.org/iobroker-community-adapters/ioBroker.tr-064-community)
[![Greenkeeper badge](https://badges.greenkeeper.io/iobroker-community-adapters/ioBroker.tr-064-community.svg)](https://greenkeeper.io/)
[![Dependency Status](https://img.shields.io/david/iobroker-community-adapters/iobroker.tr-064-community.svg)](https://david-dm.org/iobroker-community-adapters/iobroker.tr-064-community)
[![Known Vulnerabilities](https://snyk.io/test/github/iobroker-community-adapters/ioBroker.tr-064-community/badge.svg)](https://snyk.io/test/github/iobroker-community-adapters/ioBroker.tr-064-community)

***This adapter requires at least Node 4.x***

### Info
This adapter reads main information from AVM Fritz!Box, like call list or number of messages on answering machine.
Based on this [AVM documentations](https://avm.de/service/schnittstellen/)

### Initial Creation
This adapter was initialy created by @soef at https://github.com/soef/ioBroker.tr-064 but not maintained any more, so we moved it to iobroker-community so that bugs could be fixed. thanks @soef for his work.

### Simple states and functions
- turn on/off wifi for 2.4GHz and 5GHz,
- turn on/off guest wifi,
- reboot Fritz!Box,
- start WPS process,
- reconnect Internet
- external ip address

### ring (dial a number)
- When using an internel number (like **610) the ring state will let ring that internal phone.
e.g.: **610[,timeout]
- When using an external number, the ring state will connect you to the external number.
 The Fritz!Box will call the external number and your default phone will ring, when the called phone is picked up.
 The default phone can be configured in the Fritz!Box under:
 Telefonie/Anrufe/[Tab]Wahlhilfe/Wählhilfe verwenden

### toPauseState
- Values: ring, connect, end
- Can be used to pause a videoplayer on an incomming call (ring), or on pick up the phone (connect).
- Resume can be done on the end value.

### Presence
To monitor the presence of persons in your home, so to control once anyone of your family/roommate is leaving or arriving, you can use this adapter as follows: 
- Enter the Adapter options and switch to the 'Devices' tab
- Add all devices (like smart phones) of your family/roommate members accordingly, and confirm with 'Save'.
- For each device, the adapter will now create a folder structure under the ioBroker Objects of the adapter, typically in the folder "tr-064-community.0.devices"
- Now once anyone is arriving or leaving, this adapter will get the information accordingly. For example, the state "tr-064-community.0.devices.xxx.active", where xxx is the device name, will indicate if the specific device is available or not, so if the person is present or not. User feedback is that this works reliable for iOS devices as well, like with iPhones. For iPhones, user feedback is that it takes up to 10 minutes until the Fritz!Box notices that a person left and is no longer connected with WiFi, and it takes up to 1 minute until the Fritz!Box will notice the presence again.

Also, a script was published by the ioBroker community which uses this adapter information to trigger actions (e.g. everyone left home, so turn off everything automatically, see number of persons currently being present, or person status in general, via VIS, etc.). See [ioBroker forum thread](https://forum.iobroker.net/topic/4538/anwesenheitscontrol-basierend-auf-tr64-adapter-script) (in German)

### AB - Anrufbeantworter (answering machine)
Can be switch on/off.
The state cbIndex can be set, to address # of the answerig machine.

### Call monitor
The callmonitor will create realtime states for every inbound and outbound call.
If the phonebook is enabled (default), numbers will be resolved to Names
There ist also a state indicating a ringing phone.

### Phonebook
- The phone book, if enabled, will be used to get the name of callers phone number.
- Further there are three states to resolve a number or a name. If available you will also get the image URL of the contact.
  e.g.: if you set the state phonebook.number all 3 states, name, number and image will be set to the found contact. Note, searches by     name will first compare the complete name, if not found, part of is used.

### Call lists
Output formats:
- json
- html

Call lists are:
- all calls
- missed calls
- inbound calls
- outbound calls

Call count:
The call count can be set to 0. The next call will incement 1.

The html output can be configured by a template

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
The command state shoud be set to a JSON of the above Lines. So { ... } (without command = and line breaks)
The callback of the call will set the commandResult state.

<!--
### Installation
Execute the following command in the iobroker root directory (e.g. in /opt/iobroker)
```
npm install iobroker.tr-064
```
-->
### Enable call monitor
To use the call monitor feature it must be first enabled in the AVM Fritz!Box.
To enable the call monitor dial ```#96*5*```  and the TCP/IP Port 1012 will be opened. To close the port dial ```#96*4*```.

### pre release versions
Prerelease versions are available at npm with the tag dev.
You cann install them from the ioBroker root directory with:
```
npm install iobroker.tr-064@dev
iobroker upload tr-064
```

### Changelog

## 1.1.0 (2019-11-10)
* (jey cee) added Admin v3 support

## 1.0.0 (2019-04-01)
* (ldittmar) first version for the community

## License
The MIT License (MIT)

Copyright (c) 2015-2019 soef <soef@gmx.net>

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
