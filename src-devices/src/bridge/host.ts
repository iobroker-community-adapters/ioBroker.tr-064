/**
 * Access to the modules which ioBroker.devices puts on `window.__iobrokerShared__` before it loads
 * any plugin (see `pluginLoader.ts` of ioBroker.devices). The files of this folder are resolved
 * instead of `react`, `@mui/material` ... for the mesh view of `src/shared/` - see `vite.config.ts`.
 *
 * The standalone simulation (`npm start`) fills the same global in `src/dev-shim.ts`.
 */
export function hostModule<T>(name: string): T {
    const shared = (window as unknown as { __iobrokerShared__?: Record<string, unknown> }).__iobrokerShared__;
    const module = shared?.[name];
    if (!module) {
        throw new Error(`ioBroker.devices did not provide "${name}" in window.__iobrokerShared__`);
    }
    return module as T;
}
