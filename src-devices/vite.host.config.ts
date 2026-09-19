// `npm run host-sim` - serves `host-sim.html`, which loads the BUILT plugin from `build/` through
// module federation like ioBroker.devices. Run `npm run build` first, then open
// http://localhost:3004/host-sim.html. Simulation only.
import react from '@vitejs/plugin-react';

export default {
    plugins: [react()],
    // `build/customDevices.js` and its chunks are served as they are, from the root of the server.
    // `HOST_SIM_DIR=../admin/dm-widgets` checks the copy which the adapter delivers instead.
    publicDir: process.env.HOST_SIM_DIR || 'build',
    server: {
        port: 3004,
    },
};
