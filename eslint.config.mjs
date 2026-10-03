import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'src/**/*.test.ts',
      'src/**/*.test_.ts',
      'test/**/*.test.ts',
      'test/**/*.test_.ts',
      'tsdown.config.ts',
      'tsdown.sea.config.mts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importX,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-deprecated': 'warn',
      'dot-notation': 'off',
      'no-console': 'warn',
      'no-underscore-dangle': 'off',
      'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'tinyrainbow',
              message:
                "Import color from './utils/ColorTheme' (relative path may vary) instead of 'tinyrainbow' directly, so the color palette stays centralized in one place.",
            },
          ],
        },
      ],
      'no-multi-str': 'off',
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
    },
  },
  {
    files: ['src/utils/ColorTheme.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  }
);
