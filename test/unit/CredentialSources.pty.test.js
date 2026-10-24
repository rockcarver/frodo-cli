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
          ...(row.malformed || row.browser
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
      if (!row.malformed && !row.browser) {
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
});
