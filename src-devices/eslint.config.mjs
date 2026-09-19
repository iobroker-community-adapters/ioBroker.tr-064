import config, { reactConfig } from '@iobroker/eslint-config';

export default [
    ...config,
    ...reactConfig,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // `src/shared/` is a copy of `src-shared/` (tsx ../tasks.ts --sync) - it is linted there
        ignores: ['build/', 'node_modules/', '.__mf__temp/', 'vite.config.*', 'vite.host.config.*', 'src/shared/', '*.mjs'],
    },
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'react-hooks/set-state-in-effect': 'off',
        },
    },
];
