# src-shared - mesh topology for admin, vis-2 widgets and ioBroker.devices

Host independent code for the mesh topology of issue #383. No `package.json`, no own dependencies:
the imports of `react`, `@mui/material`, `@mui/material/styles` and `@mui/icons-material` are
resolved by the project which uses it.

## How a project gets it

Bare imports of a file outside of a project root do not resolve against the `node_modules` of the
project. Therefore `tsx tasks.ts --sync` (repository root) copies `src-shared/**` into
`<project>/src/shared/` of every existing project of `src-admin`, `src-widgets`, `src-devices`.
The copies are gitignored - **edit only `src-shared/`**, a change of a copy is overwritten.

- `tsx tasks.ts` (`npm run build:gui`, `build:admin`, `build:widgets`, `build:devices`) syncs first.
- Add `"prebuild": "tsx ../tasks.ts --sync"` and `"prestart": "tsx ../tasks.ts --sync"` to the
  `package.json` of a new project (as in `src-admin`), so `npm run build`/`npm start` sync too.
- A new project: add its folder to `PROJECTS` in `tasks.ts` (the three above are already listed).
- The project's eslint may reformat the copy with `--fix` - copy such fixes back to `src-shared`.
- Import JSON is used (`i18n/index.ts`): `resolveJsonModule` must be on in the `tsconfig.json`.

## Files

| File | Content |
| --- | --- |
| `types.ts` | `MeshResponse`, `MeshNodeInfo`, `MeshLinkInfo` - answer of `sendTo('<instance>', 'mesh', {})`, same as `src/lib/types.ts` of the adapter |
| `meshApi.ts` | `fetchMesh()`, `MeshLoader`, `useMeshLoader()`, error codes |
| `MeshView.tsx` | the React component: toolbar, SVG graph, table |
| `meshLayout.ts` | tree building and layout (pure functions, no React) |
| `i18n/<lang>.json` | the `tr064_*` texts in 11 languages |
| `i18n/index.ts` | `meshTranslations` (language → texts), `meshTranslate(lang)` |

## `MeshView` (default export of `MeshView.tsx`)

```tsx
<MeshView
    data={data}          // MeshResponse | null - null while nothing was read
    loading={loading}    // boolean - a request is running (spinner on the refresh button)
    error={error}        // string | null - error code or text, see below
    onRefresh={refresh}  // () => void - refresh button
    t={t}                // (key, ...args) => string - translation of the tr064_* keys, `%s` = args
    themeType="dark"     // optional 'light' | 'dark' - default: mode of the MUI theme of the host
    compact              // optional - small toolbar (icon refresh button, small labels) for tiles/dialogs
    height={400}         // optional number | string - height of the whole view, graph/table scroll inside;
                         //   without it the view takes its natural height, graph at most 75vh
    storageKey="..."     // optional - localStorage key of the view settings, default 'tr064.meshTopology'
/>
```

- A function component with hooks; use it inside class components as a normal child.
- Fills the width of its parent (`ResizeObserver`). The tree layout (repeaters side by side) is
  used when it fits, otherwise the stack layout (cards below each other, indented by depth) - from
  ~280 px on without horizontal page scroll. Below 600 px the toolbar is compact automatically, the
  table shows fewer columns below 760 / 480 px.
- Colors from the MUI theme (`palette.background.paper/default`, `text`, `divider`, `primary`).
  With `themeType` different from the host theme it creates its own light/dark theme.
- The view settings (only configured devices, show disconnected ones, graph/table) are stored in
  `localStorage[storageKey]` - use a different key per widget if they shall be independent.
- Error codes (`meshApi.ts`): `not alive` (instance stopped - only an info, no data), `not connected`,
  `not supported`, `timeout`; any other text is shown as "Error: %s". With `data` and `error` both
  set, the data stays visible below a warning (temporary error).
- Exported too: `KIND_COLORS` (colors of 2.4/5/6 GHz, LAN), types `MeshViewProps`, `MeshTranslate`.

## `meshApi.ts`

```ts
fetchMesh(socket: MeshSocket, instanceId: string /* 'tr-064.0' */, timeoutMs = 20000): Promise<MeshResponse>
```
Checks `system.adapter.<instanceId>.alive` first, then `sendTo(instanceId, 'mesh', {})`.
Never throws: errors are in `error` (`not alive`, `timeout`, `not connected`, `not supported`, text).
`MeshSocket` is `{ getState(id), sendTo(instance, command, data) }` - `AdminConnection` of admin and
`Connection` of vis-2 fit.

```ts
const loader = new MeshLoader({ socket, instanceId: 'tr-064.0', interval: 30 /* s, 0 = manual */, timeout: 20000,
                                onChange: (state: MeshLoaderState) => this.setState(state) });
loader.start();     // reads now and every `interval` seconds
loader.refresh();   // reads now (not twice at the same time)
loader.stop();      // in componentWillUnmount - no onChange afterwards
loader.state;       // { data, loading, error } - exactly the props of MeshView
```
`data` stays on a temporary error and becomes `null` when the instance is stopped (`not alive`).

```ts
const { data, loading, error, refresh } = useMeshLoader(socket, 'tr-064.0', 30); // function components
```

## Translations

`t` gets the keys `tr064_*` (see `i18n/en.json`). Hosts with `@iobroker/gui-components`:
`I18n.extendTranslations(meshTranslations)` once, then `t={(key, ...args) => I18n.t(key, ...args)}`.
Hosts without: `t={meshTranslate(language)}`. `tr064_meshTopology` is a title for a dialog/widget.
The admin loads the same files from `admin/custom/i18n/` (`"i18n": true` in `jsonConfig.json`).
