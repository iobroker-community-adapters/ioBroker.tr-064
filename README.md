![Logo](admin/tr-064.png) 
##ioBroker.tr-064 

[![NPM version](http://img.shields.io/npm/v/iobroker.tr-064.svg)](https://www.npmjs.com/package/iobroker.tr-064)
[![Tests](http://img.shields.io/travis/soef/ioBroker.tr-064/master.svg)](https://travis-ci.org/soef/ioBroker.tr-064)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/soef/iobroker.tr-064/blob/master/LICENSE)

<!--[![Build status](https://ci.appveyor.com/api/projects/status/485gflwiw7p54x7q?svg=true)](https://ci.appveyor.com/project/soef/iobroker-tr-064)-->

***This adapter requires at least Node 4.x***

### Info
This adapter reads main information from AVM Fritz!Box, like call list or number of messages on answering machine.
Based on this [AVM documentations](https://avm.de/service/schnittstellen/)

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
 The FritzBox will call the external number and your default 
phone will ring, when the called phone is picked up. 
 The default phone can be configured in the FritsBox under:
 Telefonie/Anrufe/[Tab]Wahlhilfe/Wählhilfe verwenden

### Presence
You can configure a list of devices to listen to.
Can be triggert by mDNS. When using MDNS, no polling ist needet and it is faster

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
e.g.: if you set the state phonebook.number all 3 states, name, number and image will be set to the found contact. Note, searches by name will first compare the complete name, if not found, part of is used.  

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

### pre release versions
Prerelease versions are available at npm with the tag dev.
You cann install them from the ioBroker root directory with:
```
npm install iobroker.tr-064@dev
iobroker upload tr-064
```

## Changelog
### 0.3.7 (2017-03-06)
* (soef) Fixed imageurl for external phone book again. E.g. google
### 0.3.6 (2017-03-06)
* (soef) Fixed imageurl for external phone book. e.g. google
### 0.3.5" (2017-03-06)
* (soef) Json device list added
### 0.3.3 (2017-03-01)
* (soef) phonebook functions/states added
### 0.3.1 (2017-02-28)
* (soef) some bug fixes
* (soef) releasing call lists
### 0.3.0 (2017-02-25)
* (bluefox) use new table for configuration dialog

### 0.2.0 (2016)
* (soef) initial commit