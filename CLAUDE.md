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
- A box without a third WLAN configuration uses the second one for the guest WLAN — in that case `wlan50` is set to `undefined` and the states `wlan50*` are not created.
- The external IP addresses come from a second device (`initIGDDevice`), which is initialized asynchronously. Directly after `init()` those actions may still be missing.
- The library works with callbacks, not promises. Answers which never arrive are caught by `CallbackTimers.wrap()` (`src/lib/utils.ts`); the timers are stopped on unload.

### Objects and states: `src/lib/devices.ts`

`Devices` keeps a copy of all objects and values of the own namespace, `CDevice` is a cursor on one device/channel.

- `dev.set(...)` only collects; nothing is written before `update()` is called. `update()` creates missing objects and writes only really changed values.
- The list of collected objects is **shared**: a `CDevice` without an own list writes into `Devices.list`, so `dev.update()` and `devices.update()` flush the same list.
- `setChannelEx()` converts umlauts, spaces and dots of a device name into a valid object ID (`normalizedName()`), `setChannel()` does not.

### The meta object: `src/lib/systemdata.ts`

`SystemData` is written into the object `tr-064.<instance>` with `setObject()`, and `native.callLists` holds the call lists so that counters and the last call ID survive a restart.

Everything which must **not** end up in the database is a `#` private field (`#adapter`, `#html`) — those are invisible to `JSON.stringify()`. Do not turn them into normal `private` fields: TypeScript compiles those into ordinary properties which would be serialized into the object.

### Configuration

- `normalizeConfigVars()` in `src/main.ts` fixes up types and sets the defaults of options which older instances do not have (`useMDNS`, `useDeflectionOptions`).
- The call lists exist in two spellings: `generateJSON`/`generateHTML` (before 4.x) and `generateJson`/`generateHtml` (current admin). `normalizeConfig()` in `src/lib/calllist.ts` converts the old one; both may occur in existing installations.
- `config.ip` is an attribute of very old instances and is still preferred over `iporhost` (`config.ip || config.iporhost`).
- The password is encrypted with the legacy XOR scheme of ioBroker (`encrypted: true` in `jsonConfig.json`) and decrypted in `onReady()` with `this.decrypt()`. Do not switch to `encryptedNative` — that would devalue the stored passwords of all existing instances.

### Admin

`admin/jsonConfig.json` with `i18n: true`; the keys of `admin/i18n/<lang>.json` are the **English labels**. The button "Find a device" sends the message `discovery` with `native: true` and gets the device list back as `{ native: { devices } }` (`useNative`). Without `native: true` the same command answers with a JSON string, like all versions before — user scripts rely on that.

### Misc conventions

- Use `this.setTimeout()`/`this.clearTimeout()` of adapter-core, never the global ones, so that the timers are stopped on unload.
- The adapter terminates itself (`this.terminate()`) if it cannot reach the box; a state change afterwards terminates it again.
- `main.ts` ends with the compact mode export (`require.main !== module`) - do not remove it.

## Release flow

Changelog entries go under the `### **WORK IN PROGRESS**` placeholder in `README.md`; `@alcalzone/release-script` moves them into `io-package.json` `common.news` and creates the tag. The GitHub action publishes on a `v*` tag with npm trusted publishing.
