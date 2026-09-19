import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        ignores: [
            'src-admin/**/*',
            'src-shared/**/*',
            'src-widgets/**/*',
            'src-devices/**/*',
            'widgets/**/*',
            'admin/**/*',
            'node_modules/**/*',
            'test/**/*',
            'build/**/*',
            'tasks.ts',
            'tmp/**/*',
            'www/**/*',
            '.**/*',
        ],
    },
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',

            '@typescript-eslint/no-require-imports': 'off',
        },
    },
];
