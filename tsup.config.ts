import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/app.ts', 'src/launch.ts', 'src/loader.ts'], //include all files under src
  format: ['cjs'], // generate cjs files only
  dts: true, // generate dts files
  splitting: true,
  sourcemap: true,
  clean: true,
  bundle: true,
  shims: true, // this will properly transpile 'import.meta.url'
  // Injected as a literal at bundle time so a running process's build can
  // be verified directly, rather than trusting file mtimes or a packaging
  // step (tsup here, but especially the later pkg binary-packaging step)
  // that can silently produce a stale artifact despite every file on disk
  // looking current. See getCliBuildTimestamp in src/utils/Version.ts.
  define: {
    __CLI_BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  external: [
    // list all the dev dependencies, which do NOT need to be bundled.
    '@types/colors',
    '@types/fs-extra',
    '@types/jest',
    '@types/node',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    '@yao-pkg/pkg',
    'copyfiles',
    'del',
    'eslint',
    'eslint-config-prettier',
    'eslint-plugin-import',
    'eslint-plugin-jest',
    'eslint-plugin-jsx-a11y',
    'eslint-plugin-prettier',
    'eslint-plugin-simple-import-sort',
    'jest',
    'map-stream',
    'prettier',
    'rimraf',
    'ts-jest',
    'tsup',
    'typescript',
  ],
});
