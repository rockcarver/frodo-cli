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
  // NOTE on placement: every bundled runtime package (including the
  // inquirer prompts) lives in devDependencies -- tsdown inlines those
  // automatically, while anything listed under `dependencies` is
  // auto-externalized unless forced via deps.alwaysBundle, which would
  // break this binary outright (no node_modules to resolve against).
  deps: {
    onlyBundle: false,
  },
  define: {
    __CLI_BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
