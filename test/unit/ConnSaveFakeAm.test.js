import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `frodo conn save --sa-id ... --sa-jwk-file ...` through the REAL CLI of this
 * checkout, against the fake tenant of test/utils/FakeAm.mjs (cli#1262): a key
 * file that cannot be used ends the command with exit code 1 and no saved
 * profile. Before, the command printed the failure, saved the profile with the
 * service account id and no key, and ended with 0. A temporary HOME and a
 * temporary profile file keep the run away from the real profiles.
 *
 * Skipped on Windows: the CLI is started through its launcher script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');
const TIMEOUT = 120000;

suite('conn save with a service account the user already has', () => {
  let fakeAm;
  let home;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-conn-save-home-'));
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const profilesFile = () => path.join(home, 'Connections.json');

  /** Runs `frodo <args...>` with no terminal, in a temporary HOME. */
  function run(args) {
    const result = cp.spawnSync(process.execPath, [launch, ...args], {
      input: '',
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FRODO_CONNECTION_PROFILES_PATH: profilesFile(),
        FRODO_NO_CACHE: 'true',
        FRODO_NO_PROMPT: '1',
        FRODO_MOCK: '',
        NO_COLOR: '1',
        FRODO_HOST: '',
        FRODO_REALM: '',
        FRODO_USERNAME: '',
        FRODO_PASSWORD: '',
        FRODO_SA_ID: '',
        FRODO_SA_JWK: '',
        FRODO_CREDENTIAL: '',
      },
    });
    return {
      status: result.status,
      output: result.stdout + result.stderr,
    };
  }

  const savedProfiles = () =>
    fs.existsSync(profilesFile())
      ? JSON.parse(fs.readFileSync(profilesFile(), 'utf8'))
      : {};

  async function startTenant() {
    // the tenant knows the service account, as it does when the user has one:
    // saving a profile that names it reads the account back
    fakeAm = await startFakeAm({
      journey: 'password',
      logApiKeys: [],
      serviceAccounts: ['matrix-sa'],
    });
  }

  const saveWith = (extra) => [
    'conn',
    'save',
    `http://127.0.0.1:${fakeAm.port}/am`,
    'someone',
    'secret',
    '-m',
    'cloud',
    '--no-log-api',
    '--sa-id',
    'matrix-sa',
    ...extra,
  ];

  const brokenKeyFile = () => {
    const file = path.join(home, 'matrix-sa.jwk.json');
    fs.writeFileSync(file, 'this is not json');
    return file;
  };

  it(
    'exits 1 and saves no profile when the key file cannot be read as JSON',
    async () => {
      await startTenant();

      const { status, output } = run(
        saveWith(['--sa-jwk-file', brokenKeyFile()])
      );

      expect(output).toContain('Failed to validate service account matrix-sa');
      expect(output).not.toContain('Saved connection profile');
      expect(status).toBe(1);
      expect(savedProfiles()).toEqual({});
    },
    TIMEOUT
  );

  it(
    'exits 1 and saves no profile with --no-validate when the key file cannot be read as JSON',
    async () => {
      await startTenant();

      const { status, output } = run(
        saveWith(['--no-validate', '--sa-jwk-file', brokenKeyFile()])
      );

      expect(output).toContain('Failed to validate service account matrix-sa');
      expect(output).not.toContain('Saved connection profile');
      expect(status).toBe(1);
      expect(savedProfiles()).toEqual({});
    },
    TIMEOUT
  );

  it(
    'exits 1 and saves no profile when the key file does not exist',
    async () => {
      await startTenant();

      const { status, output } = run(
        saveWith(['--sa-jwk-file', path.join(home, 'no-such-file.json')])
      );

      expect(output).not.toContain('Saved connection profile');
      expect(status).toBe(1);
      expect(savedProfiles()).toEqual({});
    },
    TIMEOUT
  );
});
