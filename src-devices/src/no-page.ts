// Input of the production build instead of `index.html` - the page (`npm start`) is only the
// simulation with mock data and must not end up in `admin/dm-widgets/`. What ioBroker.devices
// loads is `customDevices.js`, which module federation generates from `exposes` (vite.config.ts).
export {};
