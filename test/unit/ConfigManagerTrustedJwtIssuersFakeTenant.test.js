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
 * The commands `frodo config-manager pull|push|delete trusted-jwt-issuers` driven
 * as the real CLI of this checkout against a fake AM (test/utils/FakeAm.mjs,
 * journey `password`, in a separate process), through the real library: what the
 * unit tests of the ops stub, this checks end to end. The fake holds trusted JWT
 * issuers (FAKE_AM_TRUSTED_JWT_ISSUERS) in every realm. No tenant, no secrets, no
 * master key, no terminal; a temporary HOME and working directory keep it away from
 * real profiles and files.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

suite('config-manager trusted-jwt-issuers against a fake tenant', () => {
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
          trustedJwtIssuers: ['zion-issuer', 'zion-other'],
        });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'trusted-jwt-issuers',
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
          trustedJwtIssuers: ['zion-issuer', 'zion-other'],
        });

        const { code } = await run([
          'config-manager',
          'pull',
          'trusted-jwt-issuers',
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
        const run = await tenant({ trustedJwtIssuers: ['zion-issuer'] });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'trusted-jwt-issuers',
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
        const run = await tenant({ trustedJwtIssuers: ['zion-issuer'] });
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
          'trusted-jwt-issuers',
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
        const run = await tenant({ trustedJwtIssuers: [] });

        const { code, output } = await run([
          'config-manager',
          'pull',
          'trusted-jwt-issuers',
          ...target(),
        ]);

        expect(code).toBe(0);
        expect(output).toContain('No trusted JWT issuers found.');
        expect(fs.existsSync(path.join(work, 'realms'))).toBe(false);
      },
      TIMEOUT
    );
  });
});
