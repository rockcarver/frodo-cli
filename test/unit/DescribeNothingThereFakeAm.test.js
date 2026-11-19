import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `realm describe`, `conn describe` and `log key describe` through the REAL CLI
 * of this checkout, against the fake tenant of test/utils/FakeAm.mjs (cli#1287):
 * what they print and which exit code they end with when there is something to
 * describe, when there is nothing, and when the read fails. No tenant, no
 * secrets, no terminal; a temporary HOME keeps the run away from real profiles.
 * The realm commands log in to a classic tenant (`-m classic`), the log key
 * commands to a cloud one (`-m cloud`), which is where the Log API exists.
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

const KEYS = [
  {
    api_key_id: 'zion-key',
    name: 'zion tail',
    created_at: '2026-11-01T00:00:00Z',
    api_key_secret: 'dummy-secret-value',
  },
  {
    api_key_id: 'matrix-key',
    name: 'matrix pipeline',
    created_at: '2026-11-02T00:00:00Z',
  },
];

suite(
  'describe commands through the CLI against a fake tenant: nothing to describe exits 1',
  () => {
    let fakeAm;
    let home;

    beforeAll(() => {
      ensureFrodoArtifact();
    });

    beforeEach(() => {
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-describe-home-'));
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      fs.rmSync(home, { recursive: true, force: true });
    });

    /** Runs `frodo <args...>` with no terminal, in a temporary HOME. */
    function run(args) {
      const result = cp.spawnSync(process.execPath, [launch, ...args], {
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
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
        stdout: result.stdout,
        stderr: result.stderr,
        output: result.stdout + result.stderr,
      };
    }

    const host = () => `http://127.0.0.1:${fakeAm.port}/am`;
    /** The operands of a classic login to `realm`. */
    const classic = (realm = 'alpha') => [
      host(),
      realm,
      'someone',
      'secret',
      '-m',
      'classic',
    ];
    /** The operands of a cloud login (the Log API commands take no realm). */
    const cloud = () => [host(), 'someone', 'secret', '-m', 'cloud'];

    async function startTenant(options = {}) {
      fakeAm = await startFakeAm({ journey: 'password', ...options });
    }

    describe('frodo realm describe', () => {
      it(
        'prints the realm and exits 0',
        async () => {
          await startTenant({ realms: ['alpha', 'bravo'] });

          const { status, stdout } = run(['realm', 'describe', ...classic()]);

          expect(stdout).toMatch(/Name\s*│?\s*alpha/);
          expect(status).toBe(0);
        },
        TIMEOUT
      );

      it(
        'says the realm is not found and exits 1 for a realm that is not there',
        async () => {
          await startTenant({ realms: ['alpha', 'bravo'] });

          const { status, output } = run([
            'realm',
            'describe',
            ...classic('nosuchrealm'),
          ]);

          expect(output).toContain('Realm nosuchrealm not found!');
          expect(status).toBe(1);
        },
        TIMEOUT
      );

      it(
        'exits 1 and does not say "not found" when the realms cannot be read',
        async () => {
          await startTenant({
            realms: ['alpha'],
            failRequests: [{ method: 'GET', path: '/global-config/realms' }],
          });

          const { status, output } = run(['realm', 'describe', ...classic()]);

          expect(output).toContain('fake tenant operation failed');
          expect(output).not.toContain('not found');
          expect(status).toBe(1);
        },
        TIMEOUT
      );
    });

    describe('frodo conn describe', () => {
      it(
        'says there is no profile for the host and exits 1 (the library throws; the command already ended with 1 here)',
        async () => {
          await startTenant();

          const { status, output } = run([
            'conn',
            'describe',
            'https://nosuchhost.example.com/am',
          ]);

          expect(output).toContain(
            "No connection profile found matching 'https://nosuchhost.example.com/am'"
          );
          expect(status).toBe(1);
        },
        TIMEOUT
      );

      it(
        'prints a saved profile and exits 0; the password stays masked',
        async () => {
          await startTenant({ realms: ['alpha'] });
          const saved = run(['conn', 'save', ...classic()]);
          expect(saved.status).toBe(0);

          const { status, stdout } = run(['conn', 'describe', host()]);

          expect(stdout).toContain(host());
          expect(stdout).toContain('[present]');
          expect(stdout).not.toContain('secret');
          expect(status).toBe(0);
        },
        TIMEOUT
      );
    });

    describe('frodo log key describe', () => {
      it(
        'describes every key without -i and exits 0; no secret is printed',
        async () => {
          await startTenant({ logApiKeys: KEYS });

          const { status, stdout } = run([
            'log',
            'key',
            'describe',
            ...cloud(),
          ]);

          expect(stdout).toMatch(/zion-key\s*│\s*zion tail/);
          expect(stdout).toMatch(/matrix-key\s*│\s*matrix pipeline/);
          expect(stdout).not.toContain('dummy-secret-value');
          expect(status).toBe(0);
        },
        TIMEOUT
      );

      it(
        '-i describes that key and exits 0',
        async () => {
          await startTenant({ logApiKeys: KEYS });

          const { status, stdout } = run([
            'log',
            'key',
            'describe',
            '-i',
            'zion-key',
            ...cloud(),
          ]);

          expect(stdout).toContain('zion-key');
          expect(stdout).toContain('zion tail');
          expect(stdout).toContain('2026-11-01T00:00:00Z');
          expect(stdout).not.toContain('matrix-key');
          expect(stdout).not.toContain('dummy-secret-value');
          expect(status).toBe(0);
        },
        TIMEOUT
      );

      it(
        '-i with --json prints the three fields of the key',
        async () => {
          await startTenant({ logApiKeys: KEYS });

          const { status, stdout } = run([
            'log',
            'key',
            'describe',
            '-i',
            'zion-key',
            '--json',
            ...cloud(),
          ]);

          expect(JSON.parse(stdout)).toEqual({
            api_key_id: 'zion-key',
            name: 'zion tail',
            created_at: '2026-11-01T00:00:00Z',
          });
          expect(status).toBe(0);
        },
        TIMEOUT
      );

      it(
        'says the key is not found and exits 1 for a key that is not there',
        async () => {
          await startTenant({ logApiKeys: KEYS });

          const { status, output } = run([
            'log',
            'key',
            'describe',
            '-i',
            'nosuchkey',
            ...cloud(),
          ]);

          expect(output).toContain("Log API key 'nosuchkey' not found.");
          expect(status).toBe(1);
        },
        TIMEOUT
      );

      it(
        'exits 1 and does not say "not found" when the key cannot be read',
        async () => {
          await startTenant({
            logApiKeys: KEYS,
            failRequests: [{ method: 'GET', path: '/keys/zion-key' }],
          });

          const { status, output } = run([
            'log',
            'key',
            'describe',
            '-i',
            'zion-key',
            ...cloud(),
          ]);

          expect(output).toContain('fake tenant operation failed');
          expect(output).not.toContain('not found');
          expect(status).toBe(1);
        },
        TIMEOUT
      );
    });
  }
);
