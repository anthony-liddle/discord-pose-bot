const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      'eslint.config.js',
      'commitlint.config.js',
    ],
  },
);
