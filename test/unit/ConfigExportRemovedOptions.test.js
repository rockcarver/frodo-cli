import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { describe, expect, test } from '@jest/globals';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * frodo-cli#1085: `frodo config export` declared `-s, --separate-mappings` and
 * `-o, --separate-objects` and nothing read them, so a command line that passed
 * one was accepted and did what it would have done without it. Both options
 * went away in 4.0.0 (MIGRATION.md, "Upgrading to 4.x"); a commit that was
 * written before that brought the declarations back. `-A` writes the sync
 * mappings and, when extraction is on, the managed objects to separate files, so
 * nothing replaces the options and they are gone.
 *
 * These tests run the built CLI against a host that nothing listens on: a
 * rejected option fails while the command line is parsed, before the command
 * looks for a connection profile or opens a connection.
 */

const HOST = 'https://tenant.example.invalid/am';

/** Runs `frodo config export <args>` in an empty home and returns what it printed and its exit code. */
function run(args) {
  ensureFrodoArtifact();
  const homeDir = createShellTestHome();
  try {
    const result = cp.spawnSync(binaryPath, ['config', 'export', ...args], {
      cwd: homeDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
        FRODO_TEST: '1',
        NO_COLOR: '1',
        FRODO_NO_CACHE: 'true',
        FRODO_CONNECTION_PROFILES_PATH: '',
        NODE_OPTIONS: '',
      },
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      all: `${result.stdout}${result.stderr}`,
    };
  } finally {
    removeShellTestHome(homeDir);
  }
}

describe('frodo config export no longer declares -s and -o (#1085)', () => {
  test('the full help offers neither option, but still offers -A', () => {
    const { status, stdout } = run(['-hhh']);
    expect(status).toBe(0);
    expect(stdout).toContain('-A, --all-separate');
    expect(stdout).not.toMatch(/--separate-mappings/);
    expect(stdout).not.toMatch(/--separate-objects/);
    expect(stdout).not.toMatch(/^\s+-s, /m);
    expect(stdout).not.toMatch(/^\s+-o, /m);
    expect(stdout).not.toMatch(/sync\.idm\.json/);
    expect(stdout).not.toMatch(/managed\.idm\.json/);
  });

  test.each([
    ['-s', ['-a', '-s'], '-s'],
    ['-o', ['-a', '-o'], '-o'],
    [
      '--separate-mappings',
      ['-a', '--separate-mappings'],
      '--separate-mappings',
    ],
    ['--separate-objects', ['-a', '--separate-objects'], '--separate-objects'],
    ['-s with -A', ['-A', '-D', 'out', '-s'], '-s'],
    ['-o with -A', ['-A', '-D', 'out', '-o'], '-o'],
    [
      '--separate-mappings with -A',
      ['-A', '-D', 'out', '--separate-mappings'],
      '--separate-mappings',
    ],
    [
      '--separate-objects with -A',
      ['-A', '-D', 'out', '--separate-objects'],
      '--separate-objects',
    ],
  ])(
    '%s is rejected as an unknown option, exit code 1',
    (_name, args, flag) => {
      const { status, stderr, all } = run([...args, HOST]);
      expect(status).toBe(1);
      expect(stderr).toContain(`error: unknown option '${flag}'`);
      // the parser stopped the command: it never looked for a connection profile
      expect(all).not.toMatch(/No connection profile found/);
      expect(all).not.toMatch(/Error getting tokens/);
    }
  );

  test('a short option bundle that holds -s or -o is rejected too', () => {
    const { status, stderr } = run(['-aso', HOST]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/error: unknown option '-so'/);
  });

  test('control: the same command line without them gets past the parser', () => {
    // proves the assertions above tell a parse error from a later failure
    const { status, all } = run(['-a', HOST]);
    expect(status).toBe(1);
    expect(all).not.toMatch(/unknown option/);
    expect(all).toMatch(/No connection profile found matching/);
  });

  describe('MIGRATION.md', () => {
    const migration = fs.readFileSync(
      new URL('../../MIGRATION.md', import.meta.url),
      'utf8'
    );
    const [upgrading5, upgrading4] = migration.split('## Upgrading to 4.x');

    test('lists both options as removed in the 4.x section', () => {
      expect(upgrading4).toMatch(
        /^\| `-s, --separate-mappings` \(`config export`, `idm export`\) +\|/m
      );
      expect(upgrading4).toMatch(
        /^\| `-o, --separate-objects` \(`config export`, `idm export`\) +\|/m
      );
      expect(upgrading4).toMatch(/use `-A` \(with `-D <directory>`\)/);
    });

    test('no longer lists them as a rejected combination in the 5.x section', () => {
      // they cannot be combined with -a any more because they do not exist
      expect(upgrading5).not.toMatch(/separate-mappings/);
      expect(upgrading5).not.toMatch(/separate-objects/);
    });
  });
});
