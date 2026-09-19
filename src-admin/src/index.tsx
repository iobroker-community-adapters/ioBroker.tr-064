// this file is used only for the simulation (npm start) and not in the build of the component
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

window.adapterName = 'tr-064';

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    );
}
