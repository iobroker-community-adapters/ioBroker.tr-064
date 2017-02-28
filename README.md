![Logo](admin/tr-064.png)
ioBroker.tr-064 
==============

[![NPM version](http://img.shields.io/npm/v/iobroker.tr-064.svg)](https://www.npmjs.com/package/iobroker.tr-064)
[![Tests](http://img.shields.io/travis/soef/ioBroker.tr-064/master.svg)](https://travis-ci.org/soef/ioBroker.tr-064)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/soef/iobroker.tr-064/blob/master/LICENSE)

<!--[![Build status](https://ci.appveyor.com/api/projects/status/485gflwiw7p54x7q?svg=true)](https://ci.appveyor.com/project/soef/iobroker-tr-064)-->

***This adapter requires at least Node 4.x***

## Info
This adapter reads main information from AVM Fritz!Box, like call list or number of messages on answering machine.

You execute following on Fritz!Box from ioBroker: 
- turn on/off wifi for 2.4GHz and 5GHz, 
- turn on/off guest wifi,
- reboot Fritz!Box,
- ring some internal phone,
- start WPS process,
- reconnect Internet
- turn on/off multicast Domain Name System (mDNS)

What is AB (Anrufbenatworter?), what is abIndex, command, commandResult?

https://avm.de/service/schnittstellen/

Additionally you can monitor the found in Fritz!Box devices, if they are available or not.

## Changelog
### 0.3.0 (2017-02-25)
* (bluefox) use new table for configuration dialog

### 0.2.0 (2016)
* (soef) initial commit