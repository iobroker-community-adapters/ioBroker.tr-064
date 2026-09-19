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
        // specify files to exclude from linting here
        ignores: [
            'build/',
            'node_modules/',
            '.__mf__temp/',
            'vite.config.*',
            'vite-env.d.ts',
            'public/',
            // copy of src-shared (tsx ../tasks.ts --sync), linted there
            'src/shared/',
        ],
    },
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'react-hooks/set-state-in-effect': 'off',
        },
    },
];
