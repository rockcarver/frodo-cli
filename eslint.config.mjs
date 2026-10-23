import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

const frodoLibRootRestriction = {
  name: '@rockcarver/frodo-lib',
  allowImportNames: ['frodo', 'state', 'FrodoError'],
  allowTypeImports: true,
  message:
    "Import library values through the 'frodo' facade; only 'frodo', 'state', 'FrodoError', and type imports may come from the package root.",
};
const frodoLibSubpathRestriction = {
  group: ['@rockcarver/frodo-lib/*'],
  message:
    "Import library values through the 'frodo' facade instead of importing from a package subpath.",
};

// Every synchronous read of standard input goes through src/utils/StdinSync.ts,
// which knows that fd 0 may be non-blocking (EAGAIN means "no input yet").
const stdinHelperHint =
  "Read standard input through 'readStdinChunkSync' or 'readStdinToEndSync' in src/utils/StdinSync.ts: once anything touches process.stdin, fd 0 is non-blocking and a direct synchronous read throws EAGAIN when no data has arrived yet.";
const stdinRestrictions = [
  {
    selector:
      "MemberExpression[property.name='fd'][object.type='MemberExpression'][object.property.name='stdin'][object.object.name='process']",
    message: stdinHelperHint,
  },
  {
    selector:
      'CallExpression[callee.name=/^(readSync|readFileSync)$/][arguments.0.value=0]',
    message: stdinHelperHint,
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(readSync|readFileSync)$/][arguments.0.value=0]',
    message: stdinHelperHint,
  },
  {
    selector: "Literal[value='/dev/stdin']",
    message: stdinHelperHint,
  },
];
const syntaxRestrictions = [
  'LabeledStatement',
  'WithStatement',
  "ImportExpression[source.value='@rockcarver/frodo-lib']",
];

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
      'no-restricted-syntax': [
        'error',
        ...syntaxRestrictions,
        ...stdinRestrictions,
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            frodoLibRootRestriction,
            {
              name: 'tinyrainbow',
              message:
                "Import color from './utils/ColorTheme' (relative path may vary) instead of 'tinyrainbow' directly, so the color palette stays centralized in one place.",
            },
          ],
          patterns: [frodoLibSubpathRestriction],
        },
      ],
      'no-multi-str': 'off',
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
    },
  },
  {
    // The one module that reads fd 0 directly.
    files: ['src/utils/StdinSync.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...syntaxRestrictions],
    },
  },
  {
    files: ['src/utils/ColorTheme.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [frodoLibRootRestriction],
          patterns: [frodoLibSubpathRestriction],
        },
      ],
    },
  }
);
