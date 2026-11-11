import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * The commands `frodo config-manager pull|push|delete cimd-profiles` driven as the
 * real CLI of this checkout against a fake AM (test/utils/FakeAm.mjs, journey
 * `password`, in a separate process), through the real library: what the unit
 * tests of the ops stub, this checks end to end. The fake holds CIMD profiles
 * (FAKE_AM_CIMD_PROFILES) in every realm, or does not offer the type at all, as a
 * deployment before PingAM 9.0 does not. No tenant, no secrets, no master key, no
 * terminal; a temporary HOME and working directory keep it away from real
 * profiles and files.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

suite('config-manager cimd-profiles against a fake tenant', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cimd-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cimd-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts the fake with the given options and returns a function that runs the CLI once against it. */
  async function tenant(options) {
    fakeAm = await startFakeAm({
      journey: 'password',
      recordPath: record,
      ...options,
    });
    return (args) =>
      new Promise((resolve, reject) => {
        const child = cp.spawn(binaryPath, args, {
          cwd: work,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_HOST: `http://127.0.0.1:${fakeAm.port}/am`,
            FRODO_USERNAME: 'someone@example.com',
            FRODO_PASSWORD: 'secret',
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            NODE_OPTIONS: '',
            NO_COLOR: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, output }));
      });
  }

  /** The requests the CLI made, as "METHOD path" without the host. */
  const requests = () =>
    fs.existsSync(record)
      ? fs
          .readFileSync(record, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const profilesOf = (realm) =>
    path.join(work, 'realms', realm, 'realm-config', 'agents', 'CIMDProfile');
  const reads = () =>
    requests().filter(
      (r) => r.method === 'GET' && r.url.includes('/agents/CIMDProfile?')
    );

  describe('pull', () => {
    it(
      'writes one file per profile of every realm',
      async () => {
        const run = await tenant({
          realms: ['alpha', 'bravo'],
          cimdProfiles: ['zion-agents', 'zion-tools'],
        });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'cimd-profiles',
        ]);

        expect(output).not.toMatch(/Error/);
        expect(code).toBe(0);
        for (const realm of ['alpha', 'bravo']) {
          expect(fs.readdirSync(profilesOf(realm)).sort()).toEqual([
            'zion-agents.json',
            'zion-tools.json',
          ]);
        }
        const written = JSON.parse(
          fs.readFileSync(path.join(profilesOf('alpha'), 'zion-agents.json'))
        );
        expect(written._id).toBe('zion-agents');
        expect(written).not.toHaveProperty('_rev');
        expect(reads()).toHaveLength(2);
      },
      TIMEOUT
    );

    it(
      'pulls one profile by name from one realm, ignoring case, into a file named after the stored id',
      async () => {
        const run = await tenant({
          cimdProfiles: ['Zion-Agents', 'zion-tools'],
        });

        const { code } = await run([
          'config-manager',
          'pull',
          'cimd-profiles',
          '-n',
          'zion-agents',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(code).toBe(0);
        expect(fs.readdirSync(profilesOf('alpha'))).toEqual([
          'Zion-Agents.json',
        ]);
      },
      TIMEOUT
    );

    it(
      'is a success that requests no profile where the deployment does not offer the type',
      async () => {
        const run = await tenant({ realms: ['alpha'] });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'cimd-profiles',
        ]);

        expect(code).toBe(0);
        expect(output).toContain(
          "CIMD profiles are not available in realm 'alpha' of this deployment."
        );
        expect(output).not.toMatch(/failed|Error/);
        expect(reads()).toEqual([]);
        expect(fs.existsSync(path.join(work, 'realms'))).toBe(false);
      },
      TIMEOUT
    );

    it(
      'fails for a named profile where the deployment does not offer the type, in plain words',
      async () => {
        const run = await tenant({});

        const { code, output } = await run([
          'config-manager',
          'pull',
          'cimd-profiles',
          '-n',
          'zion-agents',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(code).toBe(1);
        expect(output).toContain(
          "CIMD profiles are not available in realm 'alpha' of this deployment, so 'zion-agents' cannot be pulled."
        );
      },
      TIMEOUT
    );

    it(
      'fails for a named profile that does not exist',
      async () => {
        const run = await tenant({ cimdProfiles: ['zion-agents'] });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'cimd-profiles',
          '-n',
          'zion-missing',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(code).toBe(1);
        expect(output).toContain(
          "CIMD profile 'zion-missing' not found in realm 'alpha'."
        );
      },
      TIMEOUT
    );
  });
});
