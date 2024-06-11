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
  external: [
    // list all the dev dependencies, which do NOT need to be bundled as indicated in package.json (_devDependencies)
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
    'eslint-plugin-deprecation',
    'eslint-plugin-import',
    'eslint-plugin-jest',
    'eslint-plugin-jsx-a11y',
    'eslint-plugin-prettier',
    'eslint-plugin-simple-import-sort',
    'jest',
    'loglevel',
    'map-stream',
    'prettier',
    'rimraf',
    'ts-jest',
    'tsup',
    'typescript',
  ],
});
