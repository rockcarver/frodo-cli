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
 * frodo-cli#1217: four options were declared and nothing read them, so a command
 * line that passed one was accepted and did what it would have done without it:
 * `-l, --long` of `esv secret version list` (the table already has every field),
 * `--no-deep` of `esv variable delete` and of `oauth client delete` (neither has
 * a deep delete) and `--target` of `promote` (copied from the export commands,
 * where it encrypts secret values for another environment; `promote` never did).
 * They are gone, and MIGRATION.md lists them (record 0048).
 *
 * These tests run the built CLI against a host that nothing listens on: a
 * rejected option fails while the command line is parsed, before the command
 * looks for a connection profile or opens a connection. The control of each
 * command is the same command line without the option: it gets past the parser
 * and stops at the missing connection profile, which proves that the assertions
 * tell a parse error from a later failure.
 */

const HOST = 'https://tenant.example.invalid/am';

const REMOVED = [
  {
    command: ['esv', 'secret', 'version', 'list'],
    option: '--long',
    short: '-l',
    withOption: ['-i', 'es-secret', '--long'],
    control: ['-i', 'es-secret'],
  },
  {
    command: ['esv', 'variable', 'delete'],
    option: '--no-deep',
    withOption: ['-i', 'es-variable', '--no-deep'],
    control: ['-i', 'es-variable'],
  },
  {
    command: ['oauth', 'client', 'delete'],
    option: '--no-deep',
    withOption: ['-i', 'client-one', '--no-deep'],
    control: ['-i', 'client-one'],
  },
  {
    command: ['promote'],
    option: '--target',
    withOption: ['-M', 'master', '-e', 'export', '--target', HOST],
    control: ['-M', 'master', '-e', 'export'],
  },
];

/** Runs `frodo <args>` in an empty home and returns what it printed and its exit code. */
function run(args) {
  ensureFrodoArtifact();
  const homeDir = createShellTestHome();
  try {
    const result = cp.spawnSync(binaryPath, args, {
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

describe('options that were declared and never read are gone (#1217)', () => {
  test.each(REMOVED)(
    '$command: the full help does not offer $option',
    ({ command, option, short }) => {
      const { status, stdout } = run([...command, '-hhh']);
      expect(status).toBe(0);
      // the command itself is still there
      expect(stdout).toContain(`Usage: frodo ${command.join(' ')}`);
      expect(stdout).not.toContain(option);
      if (short) {
        expect(stdout).not.toMatch(new RegExp(`^\\s+${short}, `, 'm'));
      }
    }
  );

  test.each(REMOVED)(
    '$command $option is rejected as an unknown option, exit code 1',
    ({ command, option, withOption }) => {
      const { status, stderr, all } = run([...command, ...withOption, HOST]);
      expect(status).toBe(1);
      expect(stderr).toContain(`error: unknown option '${option}'`);
      // the parser stopped the command: it never looked for a connection profile
      expect(all).not.toMatch(/No connection profile found/);
      expect(all).not.toMatch(/Error getting tokens/);
    }
  );

  test.each(REMOVED)(
    'control: $command without $option gets past the parser',
    ({ command, control }) => {
      const { status, all } = run([...command, ...control, HOST]);
      expect(status).toBe(1);
      expect(all).not.toMatch(/unknown option/);
      expect(all).toMatch(/No connection profile found matching/);
    }
  );

  describe('MIGRATION.md', () => {
    const migration = fs.readFileSync(
      new URL('../../MIGRATION.md', import.meta.url),
      'utf8'
    );
    const [upgrading5] = migration.split('## Upgrading to 4.x');

    test.each([
      '`-l, --long` of `frodo esv secret version list`',
      '`--no-deep` of `frodo esv variable delete`',
      '`--no-deep` of `frodo oauth client delete`',
      '`--target <host url>` of `frodo promote`',
    ])('the 5.x section lists %s as removed', (row) => {
      expect(upgrading5).toContain(`| ${row}`);
    });
  });
});
