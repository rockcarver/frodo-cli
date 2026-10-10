import { defineConfig } from 'tsdown';

const devDeps = [
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
];

export default defineConfig({
  entry: ['src/app.ts', 'src/launch.ts', 'src/loader.ts'],
  format: 'cjs',
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
  platform: 'node',
  define: {
    __CLI_BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  // Bundling all production deps into dist/ is the design (zero-dep
  // published package); onlyBundle:false is tsdown's "we know" switch that
  // silences the detected-dependencies hint and its long dep list.
  // NOTE on placement: every bundled runtime package (including the
  // inquirer prompts) lives in devDependencies -- tsdown inlines those
  // automatically, while anything listed under `dependencies` is
  // auto-externalized unless forced via deps.alwaysBundle, which would
  // break the SEA binary (no node_modules to resolve against) and reopen
  // the npm audit surface the zero-dep design deliberately keeps empty.
  deps: {
    neverBundle: devDeps,
    onlyBundle: false,
  },
});
