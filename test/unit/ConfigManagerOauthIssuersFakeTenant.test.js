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
 * The commands `frodo config-manager pull|push|delete oauth-issuers` driven
 * as the real CLI of this checkout against a fake AM (test/utils/FakeAm.mjs,
 * journey `password`, in a separate process), through the real library: what the
 * unit tests of the ops stub, this checks end to end. The fake holds trusted JWT
 * issuers (FAKE_AM_OAUTH_ISSUERS) in every realm. No tenant, no secrets, no
 * master key, no terminal; a temporary HOME and working directory keep it away from
 * real profiles and files.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

suite('config-manager oauth-issuers against a fake tenant', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-issuer-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-issuer-work-'));
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

  /** The requests the CLI made. */
  const requests = () =>
    fs.existsSync(record)
      ? fs
          .readFileSync(record, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const issuersOf = (realm) =>
    path.join(
      work,
      'realms',
      realm,
      'realm-config',
      'agents',
      'TrustedJwtIssuer'
    );
  const target = () => [`http://127.0.0.1:${fakeAm.port}/am`, 'alpha'];
  const reads = () =>
    requests().filter(
      (r) => r.method === 'GET' && r.url.includes('/agents/TrustedJwtIssuer')
    );

  describe('pull', () => {
    it(
      'writes one file per issuer of every realm, in the wrapped form of the single read',
      async () => {
        const run = await tenant({
          realms: ['alpha', 'bravo'],
          oauthIssuers: ['zion-issuer', 'zion-other'],
        });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
        ]);

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        for (const realm of ['alpha', 'bravo']) {
          expect(fs.readdirSync(issuersOf(realm)).sort()).toEqual([
            'zion-issuer.json',
            'zion-other.json',
          ]);
        }
        const written = JSON.parse(
          fs.readFileSync(path.join(issuersOf('alpha'), 'zion-issuer.json'))
        );
        expect(written._id).toBe('zion-issuer');
        expect(written).not.toHaveProperty('_rev');
        expect(written.issuer).toEqual({
          inherited: false,
          value: 'https://zion-issuer.example.com',
        });
        // one list per realm, one single read per issuer
        expect(
          reads().filter((r) => r.url.includes('?_queryFilter'))
        ).toHaveLength(2);
        expect(
          reads().filter((r) => !r.url.includes('?_queryFilter'))
        ).toHaveLength(4);
      },
      TIMEOUT
    );

    it(
      'pulls one issuer by name from one realm, without listing',
      async () => {
        const run = await tenant({
          oauthIssuers: ['zion-issuer', 'zion-other'],
        });

        const { code } = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          '-n',
          'zion-issuer',
          ...target(),
        ]);

        expect(code).toBe(0);
        expect(fs.readdirSync(issuersOf('alpha'))).toEqual([
          'zion-issuer.json',
        ]);
        expect(reads().some((r) => r.url.includes('?_queryFilter'))).toBe(
          false
        );
      },
      TIMEOUT
    );

    it(
      'fails for a named issuer that does not exist',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-issuer'] });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          '-n',
          'zion-missing',
          ...target(),
        ]);

        expect(code).toBe(1);
        expect(output).toContain('alpha/zion-missing');
        expect(fs.existsSync(path.join(work, 'realms'))).toBe(false);
      },
      TIMEOUT
    );

    it(
      'pulls the same file as pull oauth2-agents for the same issuer',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-issuer'] });
        fs.writeFileSync(
          path.join(work, 'oauth2-agents.json'),
          JSON.stringify({
            alpha: { TrustedJwtIssuer: [{ id: 'zion-issuer' }] },
          })
        );

        const generic = await run([
          'config-manager',
          'pull',
          'oauth2-agents',
          '-f',
          'oauth2-agents.json',
          ...target(),
        ]);
        expect(generic.code).toBe(0);
        const file = path.join(issuersOf('alpha'), 'zion-issuer.json');
        const viaGeneric = fs.readFileSync(file, 'utf8');
        fs.rmSync(path.join(work, 'realms'), { recursive: true });

        const dedicated = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          ...target(),
        ]);
        expect(dedicated.code).toBe(0);

        // the generic kind reads with the agent API (protocol 2.1), the dedicated one with the
        // issuer module (protocol 2.0): the fake answers both alike, a live check compares them
        expect(fs.readFileSync(file, 'utf8')).toBe(viaGeneric);
      },
      TIMEOUT
    );

    it(
      'succeeds with a line of its own where a realm has no issuer',
      async () => {
        const run = await tenant({ oauthIssuers: [] });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          ...target(),
        ]);

        expect(code).toBe(0);
        expect(output).toContain('No trusted JWT issuers found.');
        expect(fs.existsSync(path.join(work, 'realms'))).toBe(false);
      },
      TIMEOUT
    );
  });
  describe('push', () => {
    const issuerFile = (realm, id, content) => {
      const target = path.join(issuersOf(realm), `${id}.json`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(content));
    };
    const puts = () => requests().filter((r) => r.method === 'PUT');
    const idOf = (request) => decodeURIComponent(request.url.split('/').pop());
    const sparse = (id) => ({
      _id: id,
      _type: {
        _id: 'TrustedJwtIssuer',
        name: 'OAuth2 Trusted JWT Issuer',
        collection: true,
      },
      issuer: { inherited: false, value: `https://${id}.example.com` },
    });

    it(
      'creates an issuer that does not exist and writes it a second time so that it equals the file, and replaces one that does exist with one write',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-old'] });
        issuerFile('alpha', 'zion-new', sparse('zion-new'));
        issuerFile('alpha', 'zion-old', sparse('zion-old'));

        const { code, output } = await run([
          'config-manager',
          'push',
          'oauth-issuers',
          ...target(),
        ]);

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        const urls = puts().map(idOf);
        // the new issuer is written twice (the server completed it with its defaults), the existing one once
        expect(urls.filter((url) => url === 'zion-new')).toHaveLength(2);
        expect(urls.filter((url) => url === 'zion-old')).toHaveLength(1);
        for (const request of puts()) {
          const body = JSON.parse(request.body);
          expect(body).not.toHaveProperty('_rev');
          expect(body.jwksCacheTimeout).toBeUndefined();
        }

        // what the tenant holds now is what the file said: pull it back
        const pulled = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          '-n',
          'zion-new',
          ...target(),
        ]);
        expect(pulled.code).toBe(0);
        const back = JSON.parse(
          fs.readFileSync(path.join(issuersOf('alpha'), 'zion-new.json'))
        );
        expect(back.jwksCacheTimeout).toBeUndefined();
        expect(back.issuer).toEqual(sparse('zion-new').issuer);
      },
      TIMEOUT
    );

    it(
      'refuses a file of another type before anything is sent, and pushes the others',
      async () => {
        const run = await tenant({ oauthIssuers: [] });
        issuerFile('alpha', 'zion-agent', {
          ...sparse('zion-agent'),
          _type: { _id: 'WebAgent', name: 'Web Agent', collection: true },
        });
        issuerFile('alpha', 'zion-new', sparse('zion-new'));

        const { code, output } = await run([
          'config-manager',
          'push',
          'oauth-issuers',
          ...target(),
        ]);

        expect(code).toBe(1);
        expect(output).toContain('1 of 2 trusted JWT issuers failed');
        expect(output).toContain(
          "alpha/zion-agent.json: its _type is 'WebAgent', not 'TrustedJwtIssuer'"
        );
        expect(puts().map(idOf)).not.toContain('zion-agent');
        expect(puts().map(idOf)).toContain('zion-new');

        const allowed = await run([
          'config-manager',
          'push',
          'oauth-issuers',
          '--allow-failures',
          ...target(),
        ]);
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain('The exit code stays 0');
      },
      TIMEOUT
    );

    it(
      'removes a _rev from a file, which the server would refuse',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-old'] });
        issuerFile('alpha', 'zion-old', { ...sparse('zion-old'), _rev: '-9' });

        const { code, output } = await run([
          'config-manager',
          'push',
          'oauth-issuers',
          ...target(),
        ]);

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        expect(puts()).toHaveLength(1);
      },
      TIMEOUT
    );

    it(
      'fails when a named file is missing, and when the tree has no realms folder',
      async () => {
        const run = await tenant({ oauthIssuers: [] });

        const noTree = await run([
          'config-manager',
          'push',
          'oauth-issuers',
          ...target(),
        ]);
        expect(noTree.code).toBe(1);
        expect(noTree.output).toContain("There is no 'realms' folder in ");

        issuerFile('alpha', 'zion-other', sparse('zion-other'));
        const missing = await run([
          'config-manager',
          'push',
          'oauth-issuers',
          '-n',
          'zion-new',
          ...target(),
        ]);
        expect(missing.code).toBe(1);
        expect(missing.output).toContain(
          "No trusted JWT issuer file 'zion-new.json' in "
        );
        expect(puts()).toEqual([]);
      },
      TIMEOUT
    );
  });
  describe('delete', () => {
    const deletes = () => requests().filter((r) => r.method === 'DELETE');

    it(
      'is refused without a terminal and without --yes, before any request',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-issuer'] });

        const { code, output } = await run([
          'config-manager',
          'delete',
          'oauth-issuers',
          ...target(),
        ]);

        expect(code).toBe(1);
        expect(output).toContain('Refusing to delete all trusted JWT issuers');
        expect(output).toContain('-y/--yes');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'previews with --dry-run and deletes with --yes',
      async () => {
        const run = await tenant({
          oauthIssuers: ['zion-issuer', 'zion-other'],
        });

        const preview = await run([
          'config-manager',
          'delete',
          'oauth-issuers',
          '-d',
          ...target(),
        ]);
        expect(preview.code).toBe(0);
        expect(preview.output).toContain(
          'Dry run: Deleting trusted JWT issuer: alpha/zion-issuer'
        );
        expect(deletes()).toEqual([]);

        const done = await run([
          'config-manager',
          'delete',
          'oauth-issuers',
          '-y',
          ...target(),
        ]);
        expect(done.code).toBe(0);
        expect(done.output).toContain(
          'Deleted trusted JWT issuer: alpha/zion-issuer'
        );
        expect(done.output).toContain(
          'Deleted trusted JWT issuer: alpha/zion-other'
        );
        expect(
          deletes().map((r) => decodeURIComponent(r.url.split('/').pop()))
        ).toEqual(['zion-issuer', 'zion-other']);

        const again = await run([
          'config-manager',
          'delete',
          'oauth-issuers',
          '-y',
          ...target(),
        ]);
        expect(again.code).toBe(0);
        expect(again.output).toContain(
          'No trusted JWT issuers found to delete.'
        );
      },
      TIMEOUT
    );

    it(
      'deletes one issuer by name without asking, and fails for a name that is not there',
      async () => {
        const run = await tenant({
          oauthIssuers: ['zion-issuer', 'zion-other'],
        });

        const one = await run([
          'config-manager',
          'delete',
          'oauth-issuers',
          '-n',
          'zion-issuer',
          ...target(),
        ]);
        expect(one.code).toBe(0);
        expect(deletes()).toHaveLength(1);
        expect(deletes()[0].url).toContain('/TrustedJwtIssuer/zion-issuer');

        const missing = await run([
          'config-manager',
          'delete',
          'oauth-issuers',
          '-n',
          'zion-issuer',
          ...target(),
        ]);
        expect(missing.code).toBe(1);
        expect(missing.output).toContain(
          "Trusted JWT issuer 'zion-issuer' not found in realm 'alpha'."
        );
      },
      TIMEOUT
    );
  });
});
