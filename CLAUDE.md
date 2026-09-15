# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.tr-064` is an ioBroker adapter for the **TR-064 interface of an AVM Fritz!Box**. It switches the WLANs, reboots the box, dials numbers, reads call lists, phone book and answering machine, watches the presence of devices and listens to the call monitor on TCP port 1012.

TypeScript (CommonJS output). Sources live in `src/`, the published and runnable code is the compiled `build/` (`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or the integration tests.

## Commands

```bash
npm run build                             # tsc -p tsconfig.build.json  -> build/
npm run watch                             # same in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:integration                  # starts a real js-controller + adapter instance
npm run translate                         # translate-adapter -b admin/i18n/en.json
npm run release-patch                     # @alcalzone/release-script, moves the README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci`/`npm install` does not build. Because `build/` is neither committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from npm, not from GitHub. The integration test requires that **no** js-controller is running on the machine, otherwise it aborts with "JS-Controller is already running!".

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | the adapter class `Tr064Adapter extends utils.Adapter` and the whole orchestration |
| `src/lib/tr064.ts` | `TR064Client` - everything that talks to the box over SOAP |
| `src/lib/devices.ts` | `Devices` / `CDevice` - the object and state cache |
| `src/lib/calllist.ts` | call lists, their HTML template and the XML import |
| `src/lib/callmonitor.ts` | TCP client for port 1012 |
| `src/lib/phonebook.ts` | phone book, resolves numbers to names |
| `src/lib/deflections.ts` | call forwardings |
| `src/lib/systemdata.ts` | the `meta` object which stores the call lists between restarts |
| `src/lib/states.ts` | definition of all states below `states` and `phonebook` |
| `src/lib/utils.ts` | `getProp`, `safeFunction`, `CallbackTimers`, name and value conversion |
| `src/lib/types.ts` | shapes of the data which the box delivers |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `src/types/*.d.ts` | typings for the untyped packages `tr-O64` and `mdns-discovery` |
| `admin/jsonConfig.json` | the configuration dialog |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json` — nothing generates it.

### Talking to the box: `src/lib/tr064.ts`

`TR064Client extends TR064` of the npm package `tr-O64` (note the capital `O`, it is a fork of `tr-064`). The package has no typings; `src/types/tr-O64.d.ts` declares the part which is used here.

- `init()` fetches all actions once and stores them as fields. Which services a box offers depends on model and firmware, therefore **every** action is fetched through `safeFunction()`: a missing action becomes a function which only calls the callback. Never call an action directly without that guard.
- `initWLANs()` maps the `WLANConfiguration:<n>` services: `1` is 2.4 GHz, `2` is 5 GHz, the **last** one is always the guest WLAN (AVM: "one more service is listed" for the guest access point). A third physical access point is a second 5 GHz (FRITZ!Box 4060) or a 6 GHz one (5690 Pro); `NewX_AVM-DE_FrequencyBand` of its `GetInfo` (`5000`/`6000`) decides between `wlan52` and `wlan60`, a firmware without that argument gets `wlan52`. A band the box does not have is `undefined` and its states are not created. Never hard-code `:3` as guest WLAN (issues #726, #667).
- The external IP addresses come from a second device (`initIGDDevice`), which is initialized asynchronously. Directly after `init()` those actions may still be missing.
- `initTR064Device()` of `tr-O64` calls back only when the description (SCPD) of **every** service arrived; for a description which the box does not deliver it neither calls back nor reports an error (FRITZ!OS 8.24 Labor: `x_speedtestSCPD.xml`, issue #653). `guardServiceDescriptions()` in `src/lib/tr064.ts` therefore patches `Device.prototype._addService` with `SCPD_TIMEOUT`: such a service becomes an empty service with `meta.unavailable` and is logged. `connect()` additionally limits the whole `init()` to `INIT_TIMEOUT`.
- The library works with callbacks, not promises. Answers which never arrive are caught by `CallbackTimers.wrap()` (`src/lib/utils.ts`); the timers are stopped on unload.

### Objects and states: `src/lib/devices.ts`

`Devices` keeps a copy of all objects and values of the own namespace, `CDevice` is a cursor on one device/channel.

- `dev.set(...)` only collects; nothing is written before `update()` is called. `update()` creates missing objects and writes only really changed values.
- The list of collected objects is **shared**: a `CDevice` without an own list writes into `Devices.list`, so `dev.update()` and `devices.update()` flush the same list.
- `setChannelEx()` converts umlauts, spaces and dots of a device name into a valid object ID (`normalizedName()`), `setChannel()` does not.

### The meta object: `src/lib/systemdata.ts`

`SystemData` is written into the object `tr-064.<instance>` with `setObject()`, and `native.callLists` holds the call lists so that counters and the last call ID survive a restart.

Everything which must **not** end up in the database is a `#` private field (`#adapter`, `#html`) — those are invisible to `JSON.stringify()`. Do not turn them into normal `private` fields: TypeScript compiles those into ordinary properties which would be serialized into the object.

`load()` takes over **only** `native` of the stored object, and `save()` writes a new plain object `{ type, common, native }`. Do not go back to `Object.assign(this, obj)` or `setObject(namespace, this)`: adapter versions from 2017 to 2020 had the own functions `load`/`save` on that object, the objects database (`deep-clone`) stored them as `{}`, and old installations still carry `"save": {}`. Copied onto the instance it hides the method and the adapter crashes with `systemData.save is not a function` (issue #739).

### Configuration

- `normalizeConfigVars()` in `src/main.ts` fixes up types and sets the defaults of options which older instances do not have (`useMDNS`, `useDeflectionOptions`).
- The call lists exist in two spellings: `generateJSON`/`generateHTML` (before 4.x) and `generateJson`/`generateHtml` (current admin). `normalizeConfig()` in `src/lib/calllist.ts` converts the old one; both may occur in existing installations.
- `config.ip` is an attribute of very old instances and is still preferred over `iporhost` (`config.ip || config.iporhost`).
- The password is encrypted with the legacy XOR scheme of ioBroker (`encrypted: true` in `jsonConfig.json`) and decrypted in `onReady()` with `this.decrypt()`. Do not switch to `encryptedNative` — that would devalue the stored passwords of all existing instances.

### Admin

`admin/jsonConfig.json` with `i18n: true`; the keys of `admin/i18n/<lang>.json` are the **English labels**. The button "Find a device" sends the message `discovery` with `native: true` and gets the device list back as `{ native: { devices } }` (`useNative`). Without `native: true` the same command answers with a JSON string, like all versions before — user scripts rely on that.

### Connection to the box

`connect()` in `src/main.ts` calls `TR064Client.init()`. A box which does not answer is **not** a
reason to stop the adapter: the attempt is repeated every `RECONNECT_INTERVAL` (30 s) until it
works, and only then the objects are created, the polling starts and `subscribeStates()` runs. The
detailed error block is logged once, the following attempts only at debug level.

`info.connection` shows whether the box answers. It is written by `setConnected()`, which is called
on a failed connection, on the first successful one and after every poll cycle in `updateAll()` -
so a box which disappears later also switches the state to `false`.

Because of that the adapter never calls `terminate()` any more. That also keeps the integration
test deterministic: before, the adapter exited with code 1 on the CI runners (where `fritz.box`
resolves to a public address) and the test "The adapter starts" failed or passed depending on
whether the TCP connect gave up within the 5 second observation window of the test harness.

### Presence and `jsonDeviceList`

- Only the devices of the configuration (`config.devices`, tab "Devices") are watched and listed - not all devices of the box. The search in the admin only fills the table, it has to be saved.
- `forEachConfiguredDevice()` sends the MAC as `AA:BB:CC:DD:EE:FF` (`normalizeMac()`), the MAC in states, `native.mac` and `jsonDeviceList` stays as configured, because `isKnownMac()` compares it with the configuration.
- Every SOAP fault arrives as `err.code === 500` - `tr-O64` drops the UPnP error code - so an unknown MAC (714) and an offline device cannot be told apart. A device which was never seen is logged once and listed as inactive via `onUnknown`.
- Every `GetSpecificHostEntry` is guarded by `callbackTimers.wrap()`. Without it one lost answer stops `updateAll()` for good (issue #660).

### Call lists and answering machine

- The call lists and `states.abNewMessages` are refreshed by `refreshCalls()` in `src/main.ts`: on connect, 100 ms after the call monitor wrote `callmonitor.lastCall.timestamp`, and from `updateAll()` at most every `CALLS_REFRESH_INTERVAL` (60 s). The poll path is the only one for an instance without call monitor.
- The call monitor socket uses TCP keepalive. Without it a connection which the box dropped silently (reboot) never emits `close`, is never reconnected, and the call lists freeze (issue #690).
- A refused connection (`ECONNREFUSED`) must not stop the call monitor: a box which restarts refuses port 1012 for a while. It retries every `REFUSED_RETRY_INTERVAL` (60 s); the `#96*5*` hint is only logged if it was never connected (issue #622). Check `err.code`, not `err.errno` - `errno` is a number.
- `abNewMessages` counts the messages with `<New>1</New>` of `GetMessageList` over all answering machines with `Display` = 1 of `GetList`. **`New` = 1 means not listened yet** - the AVM document TR-064_TAM.pdf describes it the other way round, the boxes and other projects use 1 = new.
- XML files of the box are read with `getXml()`/`parseXml()` of `src/lib/utils.ts`: 10 s timeout, the callback is called exactly once, tag names are lower case and a single element is an object, not an array. Only `http` URLs are read.
- There is no TR-064 action for the "new missed calls" counter of a FRITZ!Fon; the call list XML has no seen/unseen flag.

### Misc conventions

- Use `this.setTimeout()`/`this.clearTimeout()` of adapter-core, never the global ones, so that the timers are stopped on unload.
- **Logging (issue #632):** the debug log must be shareable. Phone numbers, names, phone book and call data, host names, MAC and IP addresses, values of states and command results are logged only with `log.silly()` - a message without the data may stay at `debug`. URLs of the box are logged only through `redactUrl()`, a session ID (`sid=`) never. Warnings and infos name a configured device by its name, not by its MAC.
- `main.ts` ends with the compact mode export (`require.main !== module`) - do not remove it.

## Release flow

Changelog entries go under the `### **WORK IN PROGRESS**` placeholder in `README.md`; `@alcalzone/release-script` moves them into `io-package.json` `common.news` and creates the tag. The GitHub action publishes on a `v*` tag with npm trusted publishing.
