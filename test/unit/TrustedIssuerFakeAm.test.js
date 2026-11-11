import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The `oauth issuer` commands through the REAL CLI of this checkout, against the
 * fake tenant of test/utils/FakeAm.mjs (a separate process: the CLI blocks nothing
 * here, but a fake in this process could not answer while a child runs). The fake
 * serves the trusted JWT issuers the way AM does: a query answers them plain, a
 * read by id wraps every setting in `{ inherited, value }`, a write is stored and
 * a missing id answers 404. No tenant, no secrets, no terminal; a temporary HOME
 * keeps the run away from real profiles. What the unit tests with the library
 * stubbed cannot show is shown here: what the commands send and what they print
 * and exit with when the library is real.
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

const TYPE = {
  _id: 'TrustedJwtIssuer',
  name: 'OAuth2 Trusted JWT Issuer',
  collection: true,
};

/** An issuer in the plain shape of a query, `null` for a setting that is not set. */
const issuer = (id, more = {}) => ({
  _id: id,
  _rev: '1',
  issuer: `https://${id}.example.com`,
  allowedSubjects: ['neo', 'trinity'],
  jwksUri: `https://${id}.example.com/jwks`,
  jwkSet: null,
  jwksCacheTimeout: 3600000,
  jwkStoreCacheMissCacheTime: 60000,
  consentedScopesClaim: 'scope',
  resourceOwnerIdentityClaim: 'sub',
  agentgroup: null,
  _type: TYPE,
  ...more,
});

const TENANT = [
  issuer('zion-trusted-issuer'),
  issuer('matrix-trusted-issuer', { allowedSubjects: [] }),
];

suite('frodo oauth issuer, through the CLI against a fake tenant', () => {
  let fakeAm;
  let home;
  let work;
  let recordPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  /** Starts a fake tenant that holds `issuers`; its state lives as long as the process. */
  async function startTenant(issuers = TENANT) {
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      trustedIssuers: issuers,
    });
  }

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-issuer-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-issuer-work-'));
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Runs `frodo oauth issuer <args>` against the fake in the working directory, with no terminal. */
  function run(args, { login = true } = {}) {
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'oauth',
        'issuer',
        ...args,
        ...(login
          ? [
              `http://127.0.0.1:${fakeAm.port}/am`,
              'alpha',
              'someone',
              'secret',
              '-m',
              'classic',
            ]
          : []),
      ],
      {
        cwd: work,
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
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
        },
      }
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.stdout + result.stderr,
    };
  }

  const requests = () => readRequests(recordPath);
  const issuerRequests = (method) =>
    requests().filter(
      (request) =>
        request.method === method &&
        request.url.includes('/realm-config/agents/TrustedJwtIssuer')
    );

  describe('list', () => {
    it(
      'prints the id of every issuer, sorted',
      async () => {
        await startTenant();

        const { status, stdout } = run(['list']);

        expect(stdout.trim().split('\n')).toEqual([
          'matrix-trusted-issuer',
          'zion-trusted-issuer',
        ]);
        expect(status).toBe(0);
      },
      TIMEOUT
    );

    it(
      '--long prints the table, with "any user" for an issuer without allowed subjects',
      async () => {
        await startTenant();

        const { status, stdout } = run(['list', '--long']);

        expect(stdout).toMatch(/Id\s+│Issuer\s+│Allowed subjects\s*│JWKS URI/);
        expect(stdout).toMatch(
          /matrix-trusted-issuer\s*│https:\/\/matrix-trusted-issuer\.example\.com\s*│any user/
        );
        expect(stdout).toMatch(
          /zion-trusted-issuer\s*│https:\/\/zion-trusted-issuer\.example\.com\s*│neo\s*│https:\/\/zion-trusted-issuer\.example\.com\/jwks/
        );
        expect(stdout).toMatch(/\n\s+│\s+│trinity/);
        expect(status).toBe(0);
      },
      TIMEOUT
    );

    it(
      'a realm without issuers lists nothing and succeeds',
      async () => {
        await startTenant([]);

        const { status, stdout } = run(['list']);

        expect(stdout.trim()).toBe('');
        expect(status).toBe(0);
      },
      TIMEOUT
    );
  });

  describe('describe', () => {
    it(
      '-i prints the table of the issuer, read by id',
      async () => {
        await startTenant();

        const { status, stdout } = run([
          'describe',
          '-i',
          'zion-trusted-issuer',
        ]);

        expect(stdout).toMatch(/Issuer Id\s+│zion-trusted-issuer/);
        expect(stdout).toMatch(
          /Issuer\s+│https:\/\/zion-trusted-issuer\.example\.com/
        );
        expect(stdout).toMatch(/JWK set\s+│not set/);
        expect(status).toBe(0);
        expect(
          issuerRequests('GET').some((request) =>
            request.url.includes('/TrustedJwtIssuer/zion-trusted-issuer')
          )
        ).toBe(true);
      },
      TIMEOUT
    );

    it(
      '-i with --json prints the object as the server answered the read',
      async () => {
        await startTenant();

        const { status, stdout } = run([
          'describe',
          '-i',
          'zion-trusted-issuer',
          '--json',
        ]);

        const printed = JSON.parse(stdout);
        expect(printed._id).toBe('zion-trusted-issuer');
        expect(printed.issuer).toEqual({
          inherited: false,
          value: 'https://zion-trusted-issuer.example.com',
        });
        expect(printed.allowedSubjects.value).toEqual(['neo', 'trinity']);
        expect(status).toBe(0);
      },
      TIMEOUT
    );

    it(
      'an unknown id exits 1 and names it',
      async () => {
        await startTenant();

        const { status, output } = run(['describe', '-i', 'nobody']);

        expect(output).toContain('nobody');
        expect(output).toContain('404');
        expect(status).toBe(1);
      },
      TIMEOUT
    );

    it(
      'without -i is rejected before anything is sent when nobody can be asked',
      async () => {
        await startTenant();

        const { status, output } = run(['describe']);

        expect(output).toContain(
          "error: required option '-i, --issuer-id <issuer-id>' not specified"
        );
        expect(status).toBe(1);
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });
});
