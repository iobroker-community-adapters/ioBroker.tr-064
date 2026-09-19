// vis-2 loads the widgets through module federation, never through this entry point. It only starts the
// stand-alone simulation of `npm start` (index.html); in a production build the import is removed.
if (import.meta.env.DEV) {
    void import('./simulation/main');
}

export {};
