// SIMULATION ONLY - entry of `npm start` (index.html). The federation build starts at Components.tsx.
//
// `dev-shim` MUST be the first import: it fills the globals of the host which
// `@iobroker/dm-widgets` and `src/bridge/` read when their modules are evaluated.
import './dev-shim';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    );
}
