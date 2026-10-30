import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * `--no-prompt` and `--prompt` typed after a sub-command of a group that has
 * an action of its own (`conn`, `settings`) act on that sub-command on a
 * terminal, the same as on every other command (cli#990). The profiles are
 * hand-written and no run reaches a tenant.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const HOST_A = 'https://a.example.invalid/am';
const HOST_B = 'https://b.example.invalid/am';
const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

suite('--no-prompt and --prompt after a sub-command of conn', () => {
  let home;
  let profilesPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
    profilesPath = path.join(home, 'Connections.json');
    fs.writeFileSync(
      profilesPath,
      JSON.stringify({
        [HOST_A]: {
          tenant: HOST_A,
          alias: 'a1',
          deploymentType: 'cloud',
          username: 'someone',
        },
        [HOST_B]: {
          tenant: HOST_B,
          alias: 'b1',
          deploymentType: 'cloud',
          username: 'someone',
        },
      })
    );
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  /** Runs the built CLI on a terminal, driven by `actions`. */
  function onTerminal(args, actions) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { ...noCredentials, FRODO_CONNECTION_PROFILES_PATH: profilesPath },
      args,
      actions,
    });
  }

  const settle = [{ type: 'sleep', ms: 4000 }];

  test.each([
    ['after the other options', ['conn', 'set', '--alias', 'z', '--no-prompt']],
    [
      'before the other options',
      ['conn', 'set', '--no-prompt', '--alias', 'z'],
    ],
  ])('--no-prompt %s opens no profile picker', (_where, args) => {
    const before = fs.readFileSync(profilesPath, 'utf8');
    const run = onTerminal(args, settle);
    expect(run.plainOutput).not.toContain('Choose a connection profile');
    expect(run.plainOutput).toContain('No host was given');
    expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
  });

  test('--no-prompt on a bare secret option says how to supply the value instead of asking', () => {
    const run = onTerminal(
      ['conn', 'set', 'a1', '--password', '--no-validate', '--no-prompt'],
      [
        {
          type: 'wait_plain',
          regex: 'there is no way to ask for it here',
          timeoutMs: 20000,
        },
      ]
    );
    expect(run.plainOutput).toContain('Pipe the value on stdin');
    expect(run.plainOutput).not.toContain('Enter a value for --password');
  });

  test('--no-prompt on the group itself still runs its own action without the picker', () => {
    const run = onTerminal(['conn', '--no-prompt'], settle);
    expect(run.plainOutput).not.toContain("Choose a sub-command for 'conn'");
    expect(run.plainOutput).not.toContain('Choose a connection profile');
  });

  test('--prompt after a sub-command opens its options editor', () => {
    const run = onTerminal(
      [
        'conn',
        'set',
        HOST_A,
        '--alias',
        'z',
        '--password',
        'not-a-real-password',
        '--no-validate',
        '--prompt',
      ],
      [
        {
          type: 'wait_plain',
          regex: 'Optional options for',
          timeoutMs: 30000,
        },
      ]
    );
    expect(run.plainOutput).toContain('Optional options for');
  });

  test('--prompt on the group itself still shows the sub-command picker', () => {
    const run = onTerminal(
      ['conn', '--prompt'],
      [
        {
          type: 'wait_plain',
          regex: "Choose a sub-command for 'conn'",
          timeoutMs: 20000,
        },
      ]
    );
    expect(run.plainOutput).toContain("Choose a sub-command for 'conn'");
  });
});
