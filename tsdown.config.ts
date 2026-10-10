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
  // The inquirer prompts MUST be bundled explicitly (deps.alwaysBundle): they moved from
  // devDependencies to dependencies with the interactive-prompt feature,
  // and tsdown auto-externalizes packages listed in `dependencies` unless
  // named here -- which surfaced as ERR_UNKNOWN_BUILTIN_MODULE at SEA
  // runtime (there is no node_modules inside a SEA binary to resolve to).
  deps: {
    neverBundle: devDeps,
    onlyBundle: false,
    alwaysBundle: ['@inquirer/confirm', '@inquirer/core', '@inquirer/select'],
  },
});
