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
 * `frodo config-manager push direct-control-init`, `-apply`, `-abort` and
 * `-state` are removed: direct control has one implementation, `frodo dcc
 * session`, and it gained `--wait` (the one thing the old commands had that it
 * lacked):
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0056-the-configuration-command-group.md
 * A removed command leaves nothing behind: its name is unknown to the parser,
 * and MIGRATION.md tells the reader what to use.
 *
 * The parts that run the built CLI use a host that nothing listens on: an
 * unknown command fails while the command line is parsed, before the command
 * looks for a connection profile or opens a connection. The control is
 * `frodo dcc session state`, which gets past the parser and stops at the
 * missing connection profile, which proves that the assertions tell a parse
 * error from a later failure.
 */

const HOST = 'https://openam-matrix.example.com/am';
const RECORD =
  'https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0056-the-configuration-command-group.md';

const REMOVED = ['init', 'apply', 'abort', 'state'];

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

describe('config-manager push direct-control-* are removed (#1264)', () => {
  test('the command tree has none of the four, and dcc session has exactly its four', async () => {
    const leaves = await loadLeafCommands();
    const names = leaves.map(fullName);

    expect(names.filter((name) => /direct-control/.test(name))).toEqual([]);
    expect(
      names.filter((name) => name.startsWith('frodo dcc ')).sort()
    ).toEqual(REMOVED.map((verb) => `frodo dcc session ${verb}`).sort());
  });

  test('dcc session apply declares --wait (with -w) and --json', async () => {
    const leaves = await loadLeafCommands();
    const apply = leaves.find(
      (command) => fullName(command) === 'frodo dcc session apply'
    );

    const flags = apply.options.map((option) => option.flags);
    expect(flags).toContain('-w, --wait');
    expect(flags).toContain('--json');
  });

  test('the push group no longer lists them in its help', () => {
    const { status, stdout } = run(['config-manager', 'push', '-h']);

    expect(status).toBe(0);
    expect(stdout).not.toMatch(/direct-control/);
    expect(stdout).toMatch(/^\s+csp\s/m);
  });

  test.each(REMOVED)(
    'config-manager push direct-control-%s is rejected as an unknown command, exit code 1',
    (verb) => {
      const { status, stderr, all } = run([
        'config-manager',
        'push',
        `direct-control-${verb}`,
        HOST,
      ]);

      expect(status).toBe(1);
      expect(stderr).toContain(
        `error: unknown command 'direct-control-${verb}'`
      );
      // the parser stopped the command: it never tried to log in
      expect(all).not.toMatch(/Error getting tokens/);
      expect(all).not.toMatch(/No connection profile found/);
    }
  );

  test('control: dcc session state gets past the parser', () => {
    const { status, all } = run(['dcc', 'session', 'state', HOST]);

    expect(status).toBe(1);
    expect(all).not.toMatch(/unknown command/);
    expect(all).toMatch(/No connection profile found matching/);
  });

  test('the operations module of the removed commands is gone', () => {
    expect(
      fs.existsSync(
        new URL(
          '../../src/configManagerOps/FrConfigDirectControlOps.ts',
          import.meta.url
        )
      )
    ).toBe(false);
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
      'the 5.x section lists direct-control-%s as removed and names dcc session %s instead',
      (verb) => {
        expect(upgrading5).toMatch(
          new RegExp(
            `^\\|\\s*\`frodo config-manager push direct-control-${verb}\`\\s*\\|\\s*\`frodo dcc session ${verb}\`\\s*\\|$`,
            'm'
          )
        );
      }
    );

    test('the entry quotes the record as a full URL, names --wait and says that --json holds the old stdout', () => {
      const start = upgrading5.indexOf(
        '**`config-manager push direct-control-init`'
      );
      expect(start).toBeGreaterThan(-1);
      const entry = upgrading5.slice(start).split('\n### ')[0];

      expect(entry).toContain(RECORD);
      expect(entry).toMatch(/dcc session\s+apply --wait/);
      expect(entry).toMatch(/Use `--json` for the same object\s+on stdout/);
    });
  });
});
