import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const tsConfigs = compat
  .config({
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
      requireConfigFile: false,
      project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint', 'prettier', 'jest', 'simple-import-sort', 'import'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-deprecated': 'warn',
      'prettier/prettier': ['warn'],
      'dot-notation': 'off',
      'no-console': 'warn',
      'no-underscore-dangle': 'off',
      'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
      'no-multi-str': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
    },
    env: {
      jest: true,
      'jest/globals': true,
      node: true,
    },
  })
  .map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
  }));

export default [
  {
    ignores: ['src/**/*.test.ts', 'src/**/*.test_.ts', 'test/**/*.test.ts', 'test/**/*.test_.ts', 'tsup.config.ts'],
  },
  ...tsConfigs,
];