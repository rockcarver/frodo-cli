#!/usr/bin/env node
// Runs only the tests that validate the guidance files: the decision records,
// the agent entry points and the skills. `npm run test:guidance` and the
// `Validate guidance` job in .github/workflows/pipeline.yml both use it, so
// the list lives here once.
//
// A listed test that does not exist fails the run. Jest alone would run the
// others and pass, which is how a renamed test file would silently stop
// guarding anything.
//
// A path that one of these tests reads belongs in GUIDANCE in
// .github/scripts/classify-changes.sh as well (docs/PIPELINE.md).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUIDANCE_TESTS = [
  'test/unit/DecisionRecords.test.js',
  'test/unit/Skills.test.js',
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const missing = GUIDANCE_TESTS.filter((t) => !existsSync(path.join(root, t)));
if (missing.length > 0) {
  console.error(`Guidance test file(s) not found: ${missing.join(', ')}`);
  process.exit(1);
}

const result = spawnSync('npx', ['jest', '--silent', ...GUIDANCE_TESTS], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    FRODO_TEST: '1',
    NO_COLOR: '1',
    NODE_OPTIONS: '--no-warnings --experimental-vm-modules',
  },
});
process.exit(result.status ?? 1);
