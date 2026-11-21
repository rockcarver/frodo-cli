import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The command line the launcher (`dist/launch.cjs`, the npm `bin` entry and
 * the Docker entrypoint) starts the app process with.
 *
 * The launcher used to pass `--experimental-loader <dist>/loader.cjs`, a
 * module-resolution hook written for unbundled ESM with extensionless imports.
 * The shipped bundle has no runtime resolution left, so the hook was asked
 * about exactly one specifier (the entry file) and Node's own resolver gave the
 * same answer; the flag cost about a third of the start-up time and printed an
 * ExperimentalWarning on Node 26. It is gone, and these tests keep it gone.
 *
 * The launcher is a standalone file (it requires only Node built-ins), so the
 * test copies the BUILT `dist/launch.cjs` next to a fake `app.cjs` that reports
 * how it was started, and runs the copy. Nothing of the real CLI runs. Run
 * `npx tsdown` first (the test scripts do not rebuild `dist/`); without a
 * build the cases are skipped.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const DIST = path.join(ROOT, 'dist');
const LAUNCHER = path.join(DIST, 'launch.cjs');
const hasDist = fs.existsSync(LAUNCHER);
const testif = (condition) => (condition ? test : test.skip);

let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-launcher-'));
  fs.copyFileSync(LAUNCHER, path.join(dir, 'launch.cjs'));
  // A loader with no hooks, so that a launcher which still passed the flag
  // would start the app anyway and the assertions below, not a start-up
  // failure, would be what fails.
  fs.writeFileSync(path.join(dir, 'loader.cjs'), 'module.exports = {};');
  fs.writeFileSync(
    path.join(dir, 'app.cjs'),
    `process.stdout.write(JSON.stringify({
      execArgv: process.execArgv,
      entry: require('node:path').basename(process.argv[1]),
      args: process.argv.slice(2),
    }));`
  );
});

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Runs the copied launcher and returns what the fake app reported. */
function launch(args) {
  const { NODE_OPTIONS, ...env } = process.env;
  const stdout = cp.execFileSync(
    process.execPath,
    [path.join(dir, 'launch.cjs'), ...args],
    { env, encoding: 'utf8' }
  );
  return JSON.parse(stdout);
}

describe('the launcher starts the app process', () => {
  testif(hasDist)(
    'without a module-resolution loader',
    () => {
      const { execArgv } = launch(['-v']);
      expect(execArgv).not.toContain('--experimental-loader');
      expect(execArgv.join(' ')).not.toMatch(/loader/);
    }
  );

  testif(hasDist)(
    'with the flags it always had, and passes its own arguments on',
    () => {
      const { execArgv, entry, args } = launch(['conn', 'list', '-v']);
      expect(execArgv).toEqual(
        expect.arrayContaining(['--no-warnings', '--enable-source-maps'])
      );
      expect(entry).toBe('app.cjs');
      expect(args).toEqual(['conn', 'list', '-v']);
    }
  );
});

describe('the build', () => {
  testif(hasDist)(
    'emits no loader (run npx tsdown if this fails on an old build)',
    () => {
      expect(fs.existsSync(path.join(DIST, 'loader.cjs'))).toBe(false);
      expect(fs.existsSync(path.join(DIST, 'launch.cjs'))).toBe(true);
      expect(fs.existsSync(path.join(DIST, 'app.cjs'))).toBe(true);
    }
  );
});
