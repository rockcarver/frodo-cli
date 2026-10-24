import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;
const emptyCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_AMSTER_PRIVATE_KEY: '',
  FRODO_AMSTER_PASSPHRASE: '',
  FRODO_BROWSER_LOGIN: '',
  FRODO_LOGIN_DEVICE_FLOW: '',
  FRODO_LOGIN_CLIENT_ID: '',
  FRODO_CREDENTIAL: '',
  FRODO_FORCE_LOGIN_AS_USER: '',
  FRODO_NO_PROMPT: '',
};

suite('credential-source audit, on a real terminal', () => {
  let home;
  let recordPath;
  let fakeAm;
  let jwk;
  let pem;
  let encryptedPem;

  beforeAll(() => {
    ensureFrodoArtifact();
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
    pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
    encryptedPem = privateKey.export({
      format: 'pem',
      type: 'pkcs8',
      cipher: 'aes-256-cbc',
      passphrase: 'test-only',
    });
  });

  beforeEach(() => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  const audit = [
    { name: '--sa-id', args: () => ['--sa-id', 'test-account'] },
    { name: '--sa-jwk-file', args: (key) => ['--sa-jwk-file', key] },
    {
      name: '--sa-id + --sa-jwk-file on a command with [realm]',
      args: (key) => ['--sa-id', 'test-account', '--sa-jwk-file', key],
      authenticated: true,
    },
    {
      name: '--private-key',
      args: (_key, key) => ['--private-key', key],
      amster: true,
    },
    {
      name: '--private-key + --passphrase',
      args: (_key, _pem, key) => [
        '--private-key',
        key,
        '--passphrase',
        'test-only',
      ],
      amster: true,
    },
    { name: '--browser', args: () => ['--browser'], browser: true },
    { name: '--device', args: () => ['--device'], browser: true },
    {
      name: 'FRODO_BROWSER_LOGIN=true',
      env: () => ({ FRODO_BROWSER_LOGIN: 'true' }),
      browser: true,
    },
    {
      name: 'FRODO_LOGIN_DEVICE_FLOW=true',
      env: () => ({ FRODO_LOGIN_DEVICE_FLOW: 'true' }),
      // Device flow is selected at authentication; the flag also sets authMode,
      // whereas its environment variable alone leaves that mode unchanged.
    },
    ...['svcacct', 'amster', 'browser'].flatMap((credential) => [
      {
        name: `--credential ${credential} with a host only`,
        args: () => ['--credential', credential],
        selector: true,
      },
      {
        name: `FRODO_CREDENTIAL=${credential}`,
        env: () => ({ FRODO_CREDENTIAL: credential }),
        selector: true,
      },
    ]),
    {
      name: '--credential svcacct overrides FRODO_CREDENTIAL=user',
      args: () => ['--credential', 'svcacct'],
      env: () => ({ FRODO_CREDENTIAL: 'user' }),
      selector: true,
    },
    {
      name: '--credential svcacct overrides FRODO_FORCE_LOGIN_AS_USER',
      args: () => ['--credential', 'svcacct'],
      env: () => ({ FRODO_FORCE_LOGIN_AS_USER: 'true' }),
      selector: true,
    },
    {
      name: 'FRODO_CREDENTIAL=svcacct overrides --force-login-as-user',
      args: () => ['--force-login-as-user'],
      env: () => ({ FRODO_CREDENTIAL: 'svcacct' }),
      selector: true,
    },
    { name: 'FRODO_SA_ID', env: () => ({ FRODO_SA_ID: 'test-account' }) },
    { name: 'FRODO_SA_JWK', env: () => ({ FRODO_SA_JWK: jwk }) },
    {
      name: 'FRODO_SA_ID + FRODO_SA_JWK',
      env: () => ({ FRODO_SA_ID: 'test-account', FRODO_SA_JWK: jwk }),
      authenticated: true,
    },
    {
      name: 'FRODO_SA_ID + FRODO_SA_JWK on conn save',
      command: ['conn', 'save'],
      env: () => ({ FRODO_SA_ID: 'test-account', FRODO_SA_JWK: jwk }),
      tokenAttempt: true,
    },
    {
      name: 'FRODO_AMSTER_PRIVATE_KEY',
      env: () => ({ FRODO_AMSTER_PRIVATE_KEY: pem }),
      amster: true,
    },
    {
      name: 'FRODO_AMSTER_PRIVATE_KEY + FRODO_AMSTER_PASSPHRASE',
      env: () => ({
        FRODO_AMSTER_PRIVATE_KEY: encryptedPem,
        FRODO_AMSTER_PASSPHRASE: 'test-only',
      }),
      amster: true,
    },
    {
      name: '--sa-id + FRODO_SA_JWK',
      args: () => ['--sa-id', 'test-account'],
      env: () => ({ FRODO_SA_JWK: jwk }),
      authenticated: true,
    },
    {
      name: 'FRODO_SA_ID + --sa-jwk-file',
      args: (key) => ['--sa-jwk-file', key],
      env: () => ({ FRODO_SA_ID: 'test-account' }),
      authenticated: true,
    },
    {
      name: '--private-key + FRODO_AMSTER_PASSPHRASE',
      args: (_key, _pem, key) => ['--private-key', key],
      env: () => ({ FRODO_AMSTER_PASSPHRASE: 'test-only' }),
      amster: true,
    },
    {
      name: 'FRODO_AMSTER_PRIVATE_KEY + --passphrase',
      args: () => ['--passphrase', 'test-only'],
      env: () => ({ FRODO_AMSTER_PRIVATE_KEY: encryptedPem }),
      amster: true,
    },
    {
      name: 'malformed FRODO_SA_JWK',
      env: () => ({ FRODO_SA_JWK: 'not JSON' }),
      malformed: true,
    },
    {
      name: 'malformed FRODO_AMSTER_PRIVATE_KEY',
      env: () => ({ FRODO_AMSTER_PRIVATE_KEY: 'not a key' }),
      malformed: true,
    },
  ];

  test.each(audit)(
    '$name does not prompt for credentials',
    async (row) => {
      fakeAm = await startFakeAm({
        recordPath,
        journey: row.authenticated ? 'service-account' : 'password',
        realms: ['alpha', 'bravo'],
      });
      const jwkFile = path.join(home, 'throwaway.jwk');
      const pemFile = path.join(home, 'throwaway.pem');
      const encryptedFile = path.join(home, 'encrypted.pem');
      for (const [file, data] of [
        [jwkFile, jwk],
        [pemFile, pem],
        [encryptedFile, encryptedPem],
      ]) {
        fs.writeFileSync(file, data, { mode: 0o600 });
      }
      const request = row.authenticated
        ? '/trees'
        : row.tokenAttempt
          ? '/access_token'
          : row.amster
            ? '/authenticate'
            : '/json/serverinfo';
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: { ...emptyCredentials, ...row.env?.() },
        args: [
          ...(row.command ?? ['journey', 'list']),
          `http://127.0.0.1:${fakeAm.port}/am`,
          '--type',
          row.amster || row.browser ? 'classic' : 'cloud',
          ...(row.args?.(jwkFile, pemFile, encryptedFile) ?? []),
        ],
        actions: [
          ...(row.malformed || row.browser || row.selector
            ? []
            : [{ type: 'wait_request', path: recordPath, regex: request }]),
          ...(row.authenticated
            ? []
            : [
                {
                  type: 'wait_plain',
                  regex: row.browser
                    ? 'requires an OAuth2 client id'
                    : 'Error getting tokens',
                  timeoutMs: 10000,
                },
              ]),
        ],
      });
      expect(result.plainOutput).not.toContain('Connection:');
      expect(result.plainOutput).not.toMatch(/username: \(not set\)|Username:/);
      expect(result.plainOutput).not.toMatch(/password: \(not set\)|Password:/);
      expect(result.plainOutput).not.toContain('Choose a realm');
      if (!row.malformed && !row.browser && !row.selector) {
        const urls = fs
          .readFileSync(recordPath, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).url);
        expect(urls.some((url) => url.includes(request))).toBe(true);
      }
    },
    30000
  );

  test.each([
    ['FRODO_AMSTER_PASSPHRASE alone', { FRODO_AMSTER_PASSPHRASE: 'test-only' }],
    ['empty credential variables', {}],
  ])('%s still needs credentials', async (_name, env) => {
    fakeAm = await startFakeAm({ recordPath, journey: 'password' });
    const result = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { ...emptyCredentials, ...env },
      args: [
        'journey',
        'list',
        `http://127.0.0.1:${fakeAm.port}/am`,
        '--type',
        'classic',
      ],
      actions: [{ type: 'wait_plain', regex: 'Connection:', timeoutMs: 10000 }],
    });
    expect(result.plainOutput).toContain('username: (not set)');
    expect(result.plainOutput).toContain('password: (not set)');
  });

  describe('a saved profile that names no password (record 0031)', () => {
    // An empty FRODO_USERNAME or FRODO_PASSWORD still counts as given to the
    // library, which then does not load the saved profile: remove them.
    const unset = '__FRODO_PTY_DELETE__';
    const profileEnv = (file) => ({
      ...emptyCredentials,
      FRODO_USERNAME: unset,
      FRODO_PASSWORD: unset,
      FRODO_CONNECTION_PROFILES_PATH: file,
    });

    function saveProfile(profile) {
      const url = `http://127.0.0.1:${fakeAm.port}/am`;
      const file = path.join(home, 'Connections.json');
      fs.writeFileSync(
        file,
        JSON.stringify({
          [url]: { tenant: url, deploymentType: 'classic', ...profile },
        }),
        { mode: 0o600 }
      );
      return { url, file };
    }

    test('a saved default credential of browser completes the connection: no Connection page', async () => {
      fakeAm = await startFakeAm({ recordPath, journey: 'password' });
      const { url, file } = saveProfile({
        username: 'someone',
        defaultCredential: 'browser',
      });
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: profileEnv(file),
        args: ['journey', 'list', url],
        actions: [
          {
            type: 'wait_plain',
            regex: 'requires an OAuth2 client id',
            timeoutMs: 10000,
          },
        ],
      });
      expect(result.plainOutput).not.toContain('Connection:');
      expect(result.plainOutput).not.toMatch(/Username:|Password:/);
    }, 30000);

    test('a username alone still opens the Connection page', async () => {
      fakeAm = await startFakeAm({ recordPath, journey: 'password' });
      const { url, file } = saveProfile({ username: 'someone' });
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: profileEnv(file),
        args: ['journey', 'list', url],
        actions: [
          { type: 'wait_plain', regex: 'Connection:', timeoutMs: 10000 },
        ],
      });
      expect(result.plainOutput).toContain('password: (not set)');
    }, 30000);
  });

  const userSelectors = [
    { name: '--credential user', args: ['--credential', 'user'] },
    { name: 'FRODO_CREDENTIAL=user', env: { FRODO_CREDENTIAL: 'user' } },
    { name: '--force-login-as-user', args: ['--force-login-as-user'] },
    {
      name: 'FRODO_FORCE_LOGIN_AS_USER=true',
      env: { FRODO_FORCE_LOGIN_AS_USER: 'true' },
    },
    {
      name: 'FRODO_FORCE_LOGIN_AS_USER=false (truthy legacy value)',
      env: { FRODO_FORCE_LOGIN_AS_USER: 'false' },
    },
  ];
  test.each([
    {
      name: 'FRODO_BROWSER_LOGIN=false',
      env: () => ({ FRODO_BROWSER_LOGIN: 'false' }),
    },
    {
      name: 'FRODO_LOGIN_DEVICE_FLOW=false',
      env: () => ({ FRODO_LOGIN_DEVICE_FLOW: 'false' }),
    },
    {
      name: 'empty browser/device values',
      env: () => ({ FRODO_BROWSER_LOGIN: '', FRODO_LOGIN_DEVICE_FLOW: '' }),
    },
    ...userSelectors.flatMap((selector) => [
      { ...selector, env: () => selector.env ?? {} },
      {
        ...selector,
        name: `${selector.name} with service-account environment credentials`,
        env: () => ({
          FRODO_SA_ID: 'test-account',
          FRODO_SA_JWK: jwk,
          ...selector.env,
        }),
      },
      {
        ...selector,
        name: `${selector.name} with Amster environment credentials`,
        env: () => ({ FRODO_AMSTER_PRIVATE_KEY: pem, ...selector.env }),
      },
    ]),
    {
      name: '--credential user overrides FRODO_CREDENTIAL=svcacct and a service account',
      args: ['--credential', 'user'],
      env: () => ({
        FRODO_CREDENTIAL: 'svcacct',
        FRODO_SA_ID: 'test-account',
        FRODO_SA_JWK: jwk,
      }),
    },
  ])('$name opens the Connection page', async (row) => {
    fakeAm = await startFakeAm({ recordPath, journey: 'password' });
    const result = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { ...emptyCredentials, ...row.env() },
      args: [
        'journey',
        'list',
        `http://127.0.0.1:${fakeAm.port}/am`,
        '--type',
        'classic',
        ...(row.args ?? []),
      ],
      actions: [{ type: 'wait_plain', regex: 'Connection:', timeoutMs: 10000 }],
    });
    expect(result.plainOutput).toContain('username: (not set)');
    expect(result.plainOutput).toContain('password: (not set)');
  });
});
