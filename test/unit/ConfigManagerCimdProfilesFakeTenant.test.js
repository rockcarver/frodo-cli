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
  describe('push', () => {
    const profileFile = (realm, id, content) => {
      const target = path.join(profilesOf(realm), `${id}.json`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(content));
    };
    const puts = () => requests().filter((r) => r.method === 'PUT');
    const sparse = (id) => ({
      _id: id,
      _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
      cimdConfig: { cimdClientIdUrlPatterns: ['https://agents.example.com/*'] },
    });

    it(
      'creates a profile that does not exist and writes it a second time so that it equals the file, and replaces one that does exist with one write',
      async () => {
        const run = await tenant({ cimdProfiles: ['zion-old'] });
        profileFile('alpha', 'zion-new', sparse('zion-new'));
        profileFile('alpha', 'zion-old', sparse('zion-old'));

        const { code, output } = await run([
          'config-manager',
          'push',
          'cimd-profiles',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        const urls = puts().map((r) =>
          decodeURIComponent(r.url.split('/').pop())
        );
        // the new profile is written twice (the server completed it with its defaults), the existing one once
        expect(urls.filter((url) => url === 'zion-new')).toHaveLength(2);
        expect(urls.filter((url) => url === 'zion-old')).toHaveLength(1);
        for (const request of puts()) {
          const body = JSON.parse(request.body);
          expect(body).not.toHaveProperty('_rev');
          expect(body.coreOAuth2ClientConfig).toBeUndefined();
        }

        // what the tenant holds now is what the file said: pull it back
        fs.rmSync(path.join(work, 'realms'), { recursive: true });
        await run([
          'config-manager',
          'pull',
          'cimd-profiles',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);
        const pulled = JSON.parse(
          fs.readFileSync(path.join(profilesOf('alpha'), 'zion-new.json'))
        );
        expect(pulled.coreOAuth2ClientConfig).toBeUndefined();
        expect(pulled.cimdConfig).toEqual(sparse('zion-new').cimdConfig);
      },
      TIMEOUT
    );

    it(
      'refuses a _rev in a file by removing it: the server would answer 400',
      async () => {
        const run = await tenant({ cimdProfiles: ['zion-old'] });
        profileFile('alpha', 'zion-old', { ...sparse('zion-old'), _rev: '-9' });

        const { code, output } = await run([
          'config-manager',
          'push',
          'cimd-profiles',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        expect(puts()).toHaveLength(1);
      },
      TIMEOUT
    );

    it(
      'skips the files with a warning where the deployment does not offer the type, and exits 0',
      async () => {
        const run = await tenant({});
        profileFile('alpha', 'zion-new', sparse('zion-new'));

        const { code, output } = await run([
          'config-manager',
          'push',
          'cimd-profiles',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(code).toBe(0);
        expect(output).toContain(
          "Realm 'alpha' does not offer CIMD profiles on this deployment: 1 file in "
        );
        expect(puts()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'names the file and exits 1 for a file that cannot be read, and pushes the others',
      async () => {
        const run = await tenant({ cimdProfiles: [] });
        fs.mkdirSync(profilesOf('alpha'), { recursive: true });
        fs.writeFileSync(
          path.join(profilesOf('alpha'), 'zion-broken.json'),
          '{'
        );
        profileFile('alpha', 'zion-new', sparse('zion-new'));

        const { code, output } = await run([
          'config-manager',
          'push',
          'cimd-profiles',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(code).toBe(1);
        expect(output).toContain('1 of 2 CIMD profiles failed');
        expect(output).toContain('alpha/zion-broken.json');
        expect(puts().length).toBeGreaterThan(0);

        const allowed = await run([
          'config-manager',
          'push',
          'cimd-profiles',
          '--allow-failures',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain('The exit code stays 0');
      },
      TIMEOUT
    );

    it(
      'fails when the tree has no realms folder',
      async () => {
        const run = await tenant({ cimdProfiles: [] });

        const { code, output } = await run([
          'config-manager',
          'push',
          'cimd-profiles',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ]);

        expect(code).toBe(1);
        expect(output).toContain("There is no 'realms' folder in ");
      },
      TIMEOUT
    );
  });
  describe('delete', () => {
    const deletes = () => requests().filter((r) => r.method === 'DELETE');
    const target = () => [`http://127.0.0.1:${fakeAm.port}/am`, 'alpha'];

    it(
      'is refused without a terminal and without --yes, before any request for profiles',
      async () => {
        const run = await tenant({ cimdProfiles: ['zion-agents'] });

        const { code, output } = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          ...target(),
        ]);

        expect(code).toBe(1);
        expect(output).toContain('Refusing to delete all CIMD profiles');
        expect(output).toContain('-y/--yes');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'previews with --dry-run and deletes with --yes, by the stored id',
      async () => {
        const run = await tenant({
          cimdProfiles: ['Zion-Agents', 'zion-tools'],
        });

        const preview = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          '-d',
          ...target(),
        ]);
        expect(preview.code).toBe(0);
        expect(preview.output).toContain(
          'Dry run: Deleting CIMD profile: alpha/Zion-Agents'
        );
        expect(deletes()).toEqual([]);

        const done = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          '-y',
          ...target(),
        ]);
        expect(done.code).toBe(0);
        expect(done.output).toContain(
          'Deleted CIMD profile: alpha/Zion-Agents'
        );
        expect(done.output).toContain('Deleted CIMD profile: alpha/zion-tools');
        expect(
          deletes().map((r) => decodeURIComponent(r.url.split('/').pop()))
        ).toEqual(['Zion-Agents', 'zion-tools']);

        // a second delete finds nothing to delete and succeeds
        const again = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          '-y',
          ...target(),
        ]);
        expect(again.code).toBe(0);
        expect(again.output).toContain('No CIMD profiles found to delete.');
      },
      TIMEOUT
    );

    it(
      'deletes one profile by name without asking, ignoring case, and fails for a name that is not there',
      async () => {
        const run = await tenant({
          cimdProfiles: ['zion-agents', 'zion-tools'],
        });

        const one = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          '-n',
          'ZION-AGENTS',
          ...target(),
        ]);
        expect(one.code).toBe(0);
        expect(deletes()).toHaveLength(1);
        expect(deletes()[0].url).toContain('/CIMDProfile/zion-agents');

        const missing = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          '-n',
          'zion-agents',
          ...target(),
        ]);
        expect(missing.code).toBe(1);
        expect(missing.output).toContain(
          "CIMD profile 'zion-agents' not found in realm 'alpha'."
        );
      },
      TIMEOUT
    );

    it(
      'has nothing to delete where the deployment does not offer the type, and fails for a named profile',
      async () => {
        const run = await tenant({});

        const all = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          '-y',
          ...target(),
        ]);
        expect(all.code).toBe(0);
        expect(all.output).not.toMatch(/Error|failed/);

        const named = await run([
          'config-manager',
          'delete',
          'cimd-profiles',
          '-n',
          'zion-agents',
          ...target(),
        ]);
        expect(named.code).toBe(1);
        expect(named.output).toContain(
          "CIMD profiles are not available in realm 'alpha' of this deployment, so 'zion-agents' cannot be deleted."
        );
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );
  });
});
