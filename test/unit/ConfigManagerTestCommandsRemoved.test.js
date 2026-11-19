import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { describe, expect, test } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `frodo config-manager pull test`, `push test` and `delete test` were
 * `frodo conn test` mounted under each group: the same code, the same options,
 * the same result. They are removed, and `frodo conn test` stays (no `test`
 * commands:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0056-the-configuration-command-group.md).
 * A removed command leaves no hidden command behind: its name is unknown to the
 * parser, and MIGRATION.md tells the reader what to use.
 *
 * These tests run the built CLI against a host that nothing listens on: an
 * unknown command fails while the command line is parsed, before the command
 * looks for a connection profile or opens a connection. The control is
 * `frodo conn test`, which gets past the parser and stops at the missing
 * connection profile, which proves that the assertions tell a parse error from
 * a later failure.
 */

const HOST = 'https://openam-matrix.example.com/am';

const REMOVED = ['pull', 'push', 'delete'];

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

describe('config-manager pull test, push test and delete test are removed (#1264)', () => {
  test('the command tree has none of the three, and still has frodo conn test', async () => {
    const names = (await loadLeafCommands()).map(fullName);
    for (const verb of REMOVED) {
      expect(names).not.toContain(`frodo config-manager ${verb} test`);
    }
    expect(names).toContain('frodo conn test');
  });

  test.each(REMOVED)(
    'config-manager %s test is rejected as an unknown command, exit code 1',
    (verb) => {
      const { status, stderr, all } = run([
        'config-manager',
        verb,
        'test',
        HOST,
      ]);
      expect(status).toBe(1);
      expect(stderr).toContain("error: unknown command 'test'");
      // the parser stopped the command: it never tried to log in
      expect(all).not.toMatch(/Error getting tokens/);
    }
  );

  test('control: conn test gets past the parser', () => {
    const { status, all } = run(['conn', 'test', HOST]);
    expect(status).toBe(1);
    expect(all).not.toMatch(/unknown command/);
    expect(all).toMatch(/No connection profile found matching/);
  });

  describe('MIGRATION.md', () => {
    const migration = fs.readFileSync(
      new URL('../../MIGRATION.md', import.meta.url),
      'utf8'
    );
    const [upgrading5] = migration.split('## Upgrading to 4.x');

    // the whole row, so a wrong replacement is caught too; the table is padded
    // with blanks that depend on its widest cell, so they are not matched literally
    test.each(REMOVED)(
      'the 5.x section lists %s test as removed and names frodo conn test instead',
      (verb) => {
        expect(upgrading5).toMatch(
          new RegExp(
            `^\\|\\s*\`frodo config-manager ${verb} test\`\\s*\\|\\s*\`frodo conn test\`\\s*\\|$`,
            'm'
          )
        );
      }
    );
  });
});
