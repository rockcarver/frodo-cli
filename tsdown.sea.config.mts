import { defineConfig } from 'tsdown';

// Phase 7: single self-contained CJS bundle for native SEA.
// node --build-sea requires one entry and no sibling chunks, so code
// splitting is off and there is exactly one output file.
export default defineConfig({
  entry: ['src/app.ts'],
  outDir: 'dist-sea',
  outExtensions: () => ({ js: '.cjs' }),
  format: 'cjs',
  dts: false,
  sourcemap: false,
  clean: true,
  shims: true,
  platform: 'node',
  outputOptions: { codeSplitting: false },
  // Self-contained by design (single SEA bundle); onlyBundle:false silences
  // tsdown's detected-dependencies hint and its long dep list.
  // The inquirer prompts MUST be bundled explicitly (deps.alwaysBundle): they moved from
  // devDependencies to dependencies with the interactive-prompt feature,
  // and tsdown auto-externalizes packages listed in `dependencies` unless
  // named here -- which surfaced as ERR_UNKNOWN_BUILTIN_MODULE at SEA
  // runtime (there is no node_modules inside a SEA binary to resolve to).
  deps: {
    onlyBundle: false,
    alwaysBundle: ['@inquirer/confirm', '@inquirer/core', '@inquirer/select'],
  },
  define: {
    __CLI_BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
