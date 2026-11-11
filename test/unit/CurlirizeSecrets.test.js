import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `--curlirize` masks the values of credentials in the curl commands, and
 * `--curlirize-secrets` or FRODO_CURLIRIZE_SECRETS shows them (frodo-cli#1214,
 * frodo-lib#990). The real CLI runs against a fake AM with no terminal and the
 * test reads the curl commands it prints. Nothing here touches a real tenant,
 * a saved connection profile or the real home.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');

// made up: neither is a credential
const PASSWORD = 'made-up-login-password';
// what the fake AM answers a login with
const SESSION = 'fake-token';
const WARNING = 'The curl output contains valid credentials';

describe('--curlirize and --curlirize-secrets', () => {
  let home;
  let fakeAm;

  beforeAll(async () => {
    ensureFrodoArtifact();
    home = createShellTestHome();
    fakeAm = await startFakeAm({ journey: 'password' });
  });

  afterAll(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  /** Runs the built CLI against the fake AM from the test home, with no terminal. */
  function run(args, env = {}) {
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'journey',
        'list',
        ...args,
        `http://127.0.0.1:${fakeAm.port}/am`,
        'alpha',
        'someone',
        PASSWORD,
      ],
      {
        cwd: home,
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          FRODO_NO_CACHE: 'true',
          FRODO_NO_PROMPT: '1',
          NO_COLOR: '1',
          FRODO_HOST: '',
          FRODO_REALM: '',
          FRODO_USERNAME: '',
          FRODO_PASSWORD: '',
          FRODO_SA_ID: '',
          FRODO_SA_JWK: '',
          FRODO_CREDENTIAL: '',
          FRODO_CURLIRIZE_SECRETS: '',
          ...env,
        },
      }
    );
    const output = result.stdout + result.stderr;
    return {
      ...result,
      output,
      curl: output.split('\n').filter((line) => line.startsWith('curl ')),
    };
  }

  test('1: --curlirize masks the credentials and keeps the header names', () => {
    const { output, curl } = run(['--curlirize']);

    expect(curl.length).toBeGreaterThan(1);
    // the login: user name in the clear, password masked
    expect(output).toContain('-H "X-OpenAM-Username:someone"');
    expect(output).toContain('-H "X-OpenAM-Password:<redacted>"');
    // the request after the login: the session cookie, masked
    expect(output).toContain('-H "Cookie:iPlanetDirectoryPro=<redacted>"');
    expect(output).not.toContain(PASSWORD);
    // the session token is nowhere: not in the cookie, not in a header named
    // like the cookie (logout), not as the csrf field of the authorization request
    expect(output).not.toContain(SESSION);
    expect(output).not.toContain(WARNING);
  });

  test('2: --curlirize-secrets shows the values and warns once', () => {
    const { output, curl } = run(['--curlirize', '--curlirize-secrets']);

    expect(curl.length).toBeGreaterThan(1);
    expect(output).toContain(`-H "X-OpenAM-Password:${PASSWORD}"`);
    expect(output).toContain(`-H "Cookie:iPlanetDirectoryPro=${SESSION}"`);
    expect(output).not.toContain('<redacted>');
    expect(output.split(WARNING)).toHaveLength(2);
  });

  test.each(['1', 'true', 'TRUE', 'yes', 'on'])(
    '3: FRODO_CURLIRIZE_SECRETS=%s does what --curlirize-secrets does',
    (value) => {
      const { output } = run(['--curlirize'], {
        FRODO_CURLIRIZE_SECRETS: value,
      });

      expect(output).toContain(`-H "X-OpenAM-Password:${PASSWORD}"`);
      expect(output).toContain(`-H "Cookie:iPlanetDirectoryPro=${SESSION}"`);
      expect(output.split(WARNING)).toHaveLength(2);
    }
  );

  test.each(['', '0', 'false', 'no', 'off', 'anything'])(
    '4: FRODO_CURLIRIZE_SECRETS=%j leaves the values masked',
    (value) => {
      const { output } = run(['--curlirize'], {
        FRODO_CURLIRIZE_SECRETS: value,
      });

      expect(output).toContain('-H "X-OpenAM-Password:<redacted>"');
      expect(output).not.toContain(PASSWORD);
      expect(output).not.toContain(WARNING);
    }
  );

  test('5: the option and the variable alone print no curl command', () => {
    for (const result of [
      run(['--curlirize-secrets']),
      run([], { FRODO_CURLIRIZE_SECRETS: '1' }),
    ]) {
      expect(result.curl).toEqual([]);
      expect(result.output).not.toContain(PASSWORD);
      expect(result.output).not.toContain(WARNING);
    }
  });

  test('6: nothing about the secrets is saved in the home', () => {
    run(['--curlirize', '--curlirize-secrets']);
    for (const file of fs.readdirSync(home, { recursive: true })) {
      const full = path.join(home, String(file));
      if (!fs.statSync(full).isFile()) continue;
      expect(fs.readFileSync(full, 'utf8')).not.toMatch(/curlirize/i);
    }
  });

  test('7: the help says what is masked, and the environment variable is listed', () => {
    const help = cp.spawnSync(
      process.execPath,
      [launch, 'journey', 'list', '-hhh'],
      {
        cwd: home,
        input: '',
        encoding: 'utf8',
        env: { ...process.env, HOME: home, NO_COLOR: '1', COLUMNS: '400' },
      }
    );
    const text = (help.stdout + help.stderr).replace(/\s+/g, ' ');
    expect(text).toContain('--curlirize-secrets');
    expect(text).toContain('are replaced with <redacted>');
    expect(text).toContain('add --curlirize-secrets to see the values');
    expect(text).toContain('The output then contains valid credentials');
    // the variable is listed with its own description, not only named in the option help
    expect(text).toMatch(/FRODO_CURLIRIZE_SECRETS Set to 1, true, yes, or on/);
  });

  test('8: the MCP server does not take the option', () => {
    const result = cp.spawnSync(
      process.execPath,
      [launch, 'mcp', 'server', 'start', '--curlirize-secrets'],
      {
        cwd: home,
        input: '',
        encoding: 'utf8',
        env: { ...process.env, HOME: home, NO_COLOR: '1' },
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      "unknown option '--curlirize-secrets'"
    );
  });

  test('9: the MCP server keeps its curl output masked, whatever the variable says', () => {
    // the server logs in with the arguments given and exits when its input ends
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'mcp',
        'server',
        'start',
        `http://127.0.0.1:${fakeAm.port}/am`,
        'someone',
        PASSWORD,
        '--curlirize',
      ],
      {
        cwd: home,
        input: '',
        encoding: 'utf8',
        timeout: 60000,
        env: {
          ...process.env,
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          FRODO_NO_CACHE: 'true',
          FRODO_NO_PROMPT: '1',
          NO_COLOR: '1',
          FRODO_HOST: '',
          FRODO_USERNAME: '',
          FRODO_PASSWORD: '',
          FRODO_CURLIRIZE_SECRETS: '1',
        },
      }
    );
    const output = result.stdout + result.stderr;
    expect(output).toContain('-H "X-OpenAM-Password:<redacted>"');
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain(WARNING);
  });
});
