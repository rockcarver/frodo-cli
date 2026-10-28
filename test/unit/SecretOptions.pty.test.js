import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * A secret option used without a value (`frodo conn set <host> --password`) is
 * asked for with the input hidden on a terminal, and read from stdin when
 * input is piped. The profile is a hand-written one and every run uses
 * `--no-validate`, so nothing reaches a tenant.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const HOST = 'https://x.example.invalid/am';
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

suite('a secret option used without a value', () => {
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
        [HOST]: {
          tenant: HOST,
          alias: 'x',
          deploymentType: 'cloud',
          username: 'someone',
        },
      })
    );
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  const storedProfile = () =>
    Object.values(JSON.parse(fs.readFileSync(profilesPath, 'utf8')))[0];

  /** Runs the built CLI with its stdin piped (not a terminal). */
  function piped(args, input) {
    return cp.spawnSync(
      process.execPath,
      [path.join(ROOT, 'dist/launch.cjs'), ...args],
      {
        input,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...noCredentials,
          NO_COLOR: '1',
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
        },
      }
    );
  }

  /** Runs it on a terminal, driven by `actions`. */
  function onTerminal(args, actions, env = {}) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
        ...env,
      },
      args,
      actions,
    });
  }

  describe('on a terminal', () => {
    test('asks with the input hidden, and stores what was typed', () => {
      const run = onTerminal(
        ['conn', 'set', 'x', '--password', '--no-validate'],
        [
          {
            type: 'wait_plain',
            regex: 'Enter a value for --password',
            timeoutMs: 20000,
          },
          { type: 'sleep', ms: 300 },
          { type: 'send', text: 'hunter2-typed' },
          { type: 'sleep', ms: 300 },
          { type: 'capture', label: 'typed' },
          { type: 'key', name: 'enter' },
          {
            type: 'wait_plain',
            regex: 'Saved connection profile',
            timeoutMs: 20000,
          },
        ]
      );
      expect(run.captures.typed.plain).toContain('(input is hidden)');
      expect(run.plainOutput).not.toContain('hunter2-typed');
      expect(storedProfile().encodedPassword).toEqual(expect.any(String));
      expect(JSON.stringify(storedProfile())).not.toContain('hunter2-typed');
    });

    test('asks for two bare secrets one after the other, in declaration order', () => {
      const run = onTerminal(
        ['conn', 'set', 'x', '--log-api-secret', '--password', '--no-validate'],
        [
          {
            type: 'wait_plain',
            regex: 'Enter a value for --password',
            timeoutMs: 20000,
          },
          { type: 'sleep', ms: 300 },
          { type: 'send', text: 'first' },
          { type: 'key', name: 'enter' },
          {
            type: 'wait_plain',
            regex: 'Enter a value for --log-api-secret',
            timeoutMs: 20000,
          },
          { type: 'sleep', ms: 300 },
          { type: 'send', text: 'second' },
          { type: 'key', name: 'enter' },
          {
            type: 'wait_plain',
            regex: 'Saved connection profile',
            timeoutMs: 20000,
          },
        ]
      );
      const out = run.plainOutput;
      expect(out.indexOf('Enter a value for --password')).toBeGreaterThan(-1);
      expect(out.indexOf('Enter a value for --password')).toBeLessThan(
        out.indexOf('Enter a value for --log-api-secret')
      );
      expect(out).not.toContain('first');
      expect(out).not.toContain('second');
      expect(storedProfile().encodedLogApiSecret).toEqual(expect.any(String));
    });

    test('Escape ends the command without asking for the next secret or changing the profile', () => {
      const before = fs.readFileSync(profilesPath, 'utf8');
      const run = onTerminal(
        ['conn', 'set', 'x', '--password', '--log-api-secret', '--no-validate'],
        [
          {
            type: 'wait_plain',
            regex: 'Enter a value for --password',
            timeoutMs: 20000,
          },
          { type: 'sleep', ms: 300 },
          { type: 'key', name: 'escape' },
          {
            type: 'wait_plain',
            regex: 'was given without a value',
            timeoutMs: 20000,
          },
        ]
      );
      expect(run.plainOutput).toContain(
        "option '--password [password]' was given without a value."
      );
      expect(run.plainOutput).not.toContain(
        'Enter a value for --log-api-secret'
      );
      expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
    });

    test('with prompting turned off on a terminal it does not read the terminal, and says how to supply the value', () => {
      const run = onTerminal(
        ['conn', 'set', 'x', '--password', '--no-validate'],
        [
          {
            type: 'wait_plain',
            regex: 'there is no way to ask for it here',
            timeoutMs: 20000,
          },
        ],
        { FRODO_NO_PROMPT: '1' }
      );
      expect(run.plainOutput).toContain('Pipe the value on stdin');
      expect(run.plainOutput).not.toContain('Enter a value for --password');
    });
  });

  describe('in the other places a value is collected', () => {
    // A complete connection, so the Connection page stays closed.
    const connected = {
      FRODO_HOST: HOST,
      FRODO_USERNAME: 'someone',
      FRODO_PASSWORD: 'not-a-real-password',
    };

    test('a mandatory secret that was left out is asked for last, with the input hidden', () => {
      const run = onTerminal(
        ['admin', 'get-access-token', '-i', 'client-id'],
        [
          {
            type: 'wait_plain',
            regex: 'Enter a value for -s, --client-secret',
            timeoutMs: 20000,
          },
          { type: 'sleep', ms: 300 },
          { type: 'send', text: 'typed-secret' },
          { type: 'sleep', ms: 300 },
          { type: 'capture', label: 'typed' },
          { type: 'key', name: 'escape' },
          { type: 'wait_plain', regex: 'not specified', timeoutMs: 20000 },
        ],
        connected
      );
      expect(run.captures.typed.plain).toContain('(input is hidden)');
      expect(run.plainOutput).not.toContain('typed-secret');
      // declined: commander's own message for a missing mandatory option
      expect(run.plainOutput).toContain(
        "required option '-s, --client-secret [secret]' not specified"
      );
    });

    test('the options editor asks for a secret hidden, shows it as set, and never saves it', () => {
      const run = onTerminal(
        [
          'admin',
          'create-oauth2-client-with-admin-privileges',
          '--prompt',
          '--save-defaults',
        ],
        [
          {
            type: 'wait_plain',
            regex: 'Optional options for',
            timeoutMs: 30000,
          },
          { type: 'sleep', ms: 400 },
          { type: 'send', text: 'client-secret' },
          { type: 'sleep', ms: 500 },
          { type: 'key', name: 'space' },
          { type: 'sleep', ms: 300 },
          { type: 'key', name: 'enter' },
          {
            type: 'wait_plain',
            regex: 'Enter a value for --client-secret',
            timeoutMs: 20000,
          },
          { type: 'sleep', ms: 300 },
          { type: 'send', text: 'editor-secret' },
          { type: 'sleep', ms: 300 },
          { type: 'key', name: 'enter' },
          { type: 'sleep', ms: 2500 },
        ],
        connected
      );
      expect(run.plainOutput).not.toContain('editor-secret');
      const defaults = path.join(home, '.frodo', 'Defaults.json');
      if (fs.existsSync(defaults)) {
        expect(fs.readFileSync(defaults, 'utf8')).not.toContain(
          'editor-secret'
        );
        expect(fs.readFileSync(defaults, 'utf8')).not.toContain('clientSecret');
      }
    });
  });

  describe('with stdin piped', () => {
    test('reads all of stdin, drops one trailing newline, and stores it', () => {
      const result = piped(
        ['conn', 'set', 'x', '--password', '--no-validate'],
        'from the pipe\n'
      );
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain(
        'Saved connection profile'
      );
      expect(storedProfile().encodedPassword).toEqual(expect.any(String));
      expect(JSON.stringify(storedProfile())).not.toContain('from the pipe');
    });

    test('serves the one bare secret while the other is given on the command line', () => {
      const result = piped(
        [
          'conn',
          'set',
          'x',
          '--password',
          '--log-api-secret',
          'given',
          '--no-validate',
        ],
        'piped\n'
      );
      expect(result.status).toBe(0);
      expect(storedProfile().encodedPassword).toEqual(expect.any(String));
      expect(storedProfile().encodedLogApiSecret).toEqual(expect.any(String));
    });

    test('refuses two bare secrets before reading stdin, and changes nothing', () => {
      const before = fs.readFileSync(profilesPath, 'utf8');
      const result = piped(
        ['conn', 'set', 'x', '--password', '--log-api-secret', '--no-validate'],
        'a\nb\n'
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "'--password' and '--log-api-secret' were given without a value"
      );
      expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
    });

    test('says so when nothing was piped', () => {
      const result = piped(
        ['conn', 'set', 'x', '--password', '--no-validate'],
        '\n'
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('nothing was piped on stdin');
    });

    test('reports a missing mandatory option before it reads stdin', () => {
      // admin get-access-token: -i is mandatory and -s is a secret.
      const result = piped(['admin', 'get-access-token', 'x', '-s'], 'piped\n');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "required option '-i, --client-id <id>' not specified"
      );
    });
  });
});
