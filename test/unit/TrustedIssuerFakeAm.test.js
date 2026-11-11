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
  async function startTenant(issuers = TENANT, options = {}) {
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      trustedIssuers: issuers,
      ...options,
    });
  }

  /** The ids of the issuers the fake holds, asked through the CLI itself. */
  const idsOnTenant = () =>
    run(['list']).stdout.trim().split('\n').filter(Boolean);

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
  describe('export', () => {
    const read = (name) =>
      JSON.parse(fs.readFileSync(path.join(work, name), 'utf8'));

    it(
      '-i writes <id>.oauth2.issuer.json with the settings of the issuer and nothing else',
      async () => {
        await startTenant();

        const { status, output } = run(['export', '-i', 'zion-trusted-issuer']);

        const file = read('zion-trusted-issuer.oauth2.issuer.json');
        expect(Object.keys(file)).toEqual(['meta', 'trustedJwtIssuer']);
        expect(Object.keys(file.trustedJwtIssuer)).toEqual([
          'zion-trusted-issuer',
        ]);
        const written = file.trustedJwtIssuer['zion-trusted-issuer'];
        // exactly the settings of a trusted issuer and its type, no _rev, no secret
        expect(Object.keys(written).sort()).toEqual(
          [
            '_id',
            '_type',
            'agentgroup',
            'allowedSubjects',
            'consentedScopesClaim',
            'issuer',
            'jwkSet',
            'jwkStoreCacheMissCacheTime',
            'jwksCacheTimeout',
            'jwksUri',
            'resourceOwnerIdentityClaim',
          ].sort()
        );
        expect(written.issuer).toBe('https://zion-trusted-issuer.example.com');
        expect(written.allowedSubjects).toEqual(['neo', 'trinity']);
        expect(output).toContain(
          'Exported zion-trusted-issuer to zion-trusted-issuer.oauth2.issuer.json.'
        );
        expect(status).toBe(0);
      },
      TIMEOUT
    );

    it(
      '-i with -f and -N names the file and leaves the metadata out',
      async () => {
        await startTenant();

        const { status } = run([
          'export',
          '-i',
          'zion-trusted-issuer',
          '-f',
          'mine.json',
          '-N',
        ]);

        expect(Object.keys(read('mine.json'))).toEqual(['trustedJwtIssuer']);
        expect(status).toBe(0);
      },
      TIMEOUT
    );

    it(
      '-a writes allAlphaIssuers.oauth2.issuer.json with every issuer',
      async () => {
        await startTenant();

        const { status } = run(['export', '-a']);

        const file = read('allAlphaIssuers.oauth2.issuer.json');
        expect(Object.keys(file.trustedJwtIssuer).sort()).toEqual([
          'matrix-trusted-issuer',
          'zion-trusted-issuer',
        ]);
        expect(status).toBe(0);
      },
      TIMEOUT
    );

    it(
      '-A writes a file per issuer, and the file of -i holds an equal issuer (one shape)',
      async () => {
        await startTenant();

        expect(run(['export', '-A']).status).toBe(0);
        const separate = read('zion-trusted-issuer.oauth2.issuer.json');
        expect(
          fs.readdirSync(work).filter((name) => name.endsWith('.issuer.json'))
        ).toEqual([
          'matrix-trusted-issuer.oauth2.issuer.json',
          'zion-trusted-issuer.oauth2.issuer.json',
        ]);

        // a read by id is wrapped on the server; the file must not be
        expect(
          run(['export', '-i', 'zion-trusted-issuer', '-f', 'one.json']).status
        ).toBe(0);
        expect(read('one.json').trustedJwtIssuer).toEqual(
          separate.trustedJwtIssuer
        );
      },
      TIMEOUT
    );

    it(
      'an unknown id exits 1 and writes no file',
      async () => {
        await startTenant();

        const { status, output } = run(['export', '-i', 'nobody']);

        expect(output).toContain('nobody');
        expect(status).toBe(1);
        expect(fs.readdirSync(work)).toEqual([]);
      },
      TIMEOUT
    );

    it(
      '-A with one file that cannot be written writes the others, names it in one summary and exits 1; --allow-failures exits 0',
      async () => {
        await startTenant();
        // a directory where the file of the first issuer should go
        fs.mkdirSync(
          path.join(work, 'matrix-trusted-issuer.oauth2.issuer.json')
        );

        const failed = run(['export', '-A']);
        expect(failed.output).toMatch(
          /1 of 2 issuers failed:\n\s+- matrix-trusted-issuer: /
        );
        expect(failed.status).toBe(1);
        expect(
          read('zion-trusted-issuer.oauth2.issuer.json').trustedJwtIssuer
        ).toBeDefined();

        const allowed = run(['export', '-A', '--allow-failures']);
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
        expect(allowed.status).toBe(0);
      },
      TIMEOUT
    );

    it(
      '-A in a realm without issuers writes nothing and succeeds',
      async () => {
        await startTenant([]);

        const { status, output } = run(['export', '-A']);

        expect(output).toContain('Nothing to export.');
        expect(fs.readdirSync(work)).toEqual([]);
        expect(status).toBe(0);
      },
      TIMEOUT
    );

    it(
      'without -i, -a or -A is rejected before anything is sent when nobody can be asked',
      async () => {
        await startTenant();

        const { status, output } = run(['export']);

        expect(output).toContain(
          'one of -i, --issuer-id <issuer-id> | -a, --all | -A, --all-separate is required'
        );
        expect(status).toBe(1);
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });
  describe('import', () => {
    const write = (name, data) =>
      fs.writeFileSync(
        path.join(work, name),
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    const file = (...ids) => ({
      trustedJwtIssuer: Object.fromEntries(
        ids.map((id) => [id, issuer(id, { _rev: undefined })])
      ),
    });
    const puts = () =>
      issuerRequests('PUT').map((request) =>
        decodeURIComponent(request.url.split('/TrustedJwtIssuer/')[1])
      );

    it(
      'an issuer exported from one tenant is restored on another (export, then import -i)',
      async () => {
        await startTenant();
        expect(run(['export', '-i', 'zion-trusted-issuer']).status).toBe(0);
        fakeAm.stop();

        await startTenant([]);
        expect(idsOnTenant()).toEqual([]);
        const { status } = run([
          'import',
          '-i',
          'zion-trusted-issuer',
          '-f',
          'zion-trusted-issuer.oauth2.issuer.json',
        ]);

        expect(status).toBe(0);
        expect(idsOnTenant()).toEqual(['zion-trusted-issuer']);
        const [body] = issuerRequests('PUT').map((request) =>
          JSON.parse(request.body)
        );
        // no _rev in what was sent, and the settings as exported
        expect(body._rev).toBeUndefined();
        expect(body.issuer).toBe('https://zion-trusted-issuer.example.com');
        expect(body.allowedSubjects).toEqual(['neo', 'trinity']);
      },
      TIMEOUT
    );

    it(
      '-f of a file with three issuers imports one (the first), not three',
      async () => {
        await startTenant([]);
        write('three.oauth2.issuer.json', file('t1', 't2', 't3'));

        const { status } = run(['import', '-f', 'three.oauth2.issuer.json']);

        expect(status).toBe(0);
        expect(puts()).toEqual(['t1']);
      },
      TIMEOUT
    );

    it(
      'a file that still holds _rev imports: the body has none, which the server would refuse',
      async () => {
        await startTenant([]);
        write('rev.oauth2.issuer.json', {
          trustedJwtIssuer: { r1: issuer('r1', { _rev: '5' }) },
        });

        const { status } = run([
          'import',
          '-a',
          '-f',
          'rev.oauth2.issuer.json',
        ]);

        expect(status).toBe(0);
        expect(JSON.parse(issuerRequests('PUT')[0].body)._rev).toBeUndefined();
        expect(idsOnTenant()).toEqual(['r1']);
      },
      TIMEOUT
    );

    it(
      '-i imports the named issuer of a file with three, and no other',
      async () => {
        await startTenant([]);
        write('three.oauth2.issuer.json', file('t1', 't2', 't3'));

        const { status } = run([
          'import',
          '-i',
          't2',
          '-f',
          'three.oauth2.issuer.json',
        ]);

        expect(status).toBe(0);
        expect(puts()).toEqual(['t2']);
      },
      TIMEOUT
    );

    it(
      '-i with an issuer that is not in the file exits 1 and sends nothing',
      async () => {
        await startTenant([]);
        write('three.oauth2.issuer.json', file('t1'));

        const { status, output } = run([
          'import',
          '-i',
          'nobody',
          '-f',
          'three.oauth2.issuer.json',
        ]);

        expect(output).toContain('Trusted issuer nobody not found');
        expect(status).toBe(1);
        expect(puts()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      '-a imports every issuer of the file',
      async () => {
        await startTenant([]);
        write('three.oauth2.issuer.json', file('t1', 't2', 't3'));

        const { status } = run([
          'import',
          '-a',
          '-f',
          'three.oauth2.issuer.json',
        ]);

        expect(status).toBe(0);
        expect(puts()).toEqual(['t1', 't2', 't3']);
        expect(idsOnTenant()).toEqual(['t1', 't2', 't3']);
      },
      TIMEOUT
    );

    it(
      '-a with one issuer that the server refuses imports the others, names it and exits 1; --allow-failures exits 0',
      async () => {
        await startTenant([], {
          failRequests: [{ method: 'PUT', path: '/TrustedJwtIssuer/t2' }],
        });
        write('three.oauth2.issuer.json', file('t1', 't2', 't3'));

        const failed = run(['import', '-a', '-f', 'three.oauth2.issuer.json']);
        expect(failed.output).toMatch(/1 of 3 issuers failed:\n\s+- t2: /);
        expect(failed.status).toBe(1);
        expect(idsOnTenant()).toEqual(['t1', 't3']);

        const allowed = run([
          'import',
          '-a',
          '-f',
          'three.oauth2.issuer.json',
          '--allow-failures',
        ]);
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
        expect(allowed.status).toBe(0);
      },
      TIMEOUT
    );

    it(
      'a file of the generic agent export imports its issuer and leaves the other agents out',
      async () => {
        await startTenant([]);
        write('old-issuer.agent.json', {
          agent: {
            'old-issuer': issuer('old-issuer'),
            'a-web-agent': {
              _id: 'a-web-agent',
              _type: { _id: 'WebAgent', name: 'Web Agent', collection: true },
            },
          },
        });

        const { status } = run(['import', '-f', 'old-issuer.agent.json']);
        expect(status).toBe(0);
        expect(
          run(['import', '-a', '-f', 'old-issuer.agent.json']).status
        ).toBe(0);

        expect(puts()).toEqual(['old-issuer', 'old-issuer']);
        expect(idsOnTenant()).toEqual(['old-issuer']);
      },
      TIMEOUT
    );

    it(
      'the same issuer in both sections of a full export is written once, from its own key',
      async () => {
        await startTenant([]);
        write('both.json', {
          agent: {
            dup: issuer('dup', { issuer: 'https://from-agent.example.com' }),
          },
          trustedJwtIssuer: {
            dup: issuer('dup', { issuer: 'https://from-own-key.example.com' }),
          },
        });

        const { status } = run(['import', '-a', '-f', 'both.json']);

        expect(status).toBe(0);
        expect(puts()).toEqual(['dup']);
        expect(JSON.parse(issuerRequests('PUT')[0].body).issuer).toBe(
          'https://from-own-key.example.com'
        );
      },
      TIMEOUT
    );

    it(
      '-A imports *.oauth2.issuer.json and *.trustedJwtIssuer.json files and ignores agent files',
      async () => {
        await startTenant([]);
        write('a.oauth2.issuer.json', file('a1'));
        write('b.trustedJwtIssuer.json', file('b1', 'b2'));
        write('x.agent.json', { agent: { x1: issuer('x1') } });
        write('x.web.agent.json', { agent: { x2: issuer('x2') } });

        const { status } = run(['import', '-A']);

        expect(status).toBe(0);
        expect(puts()).toEqual(['a1', 'b1', 'b2']);
      },
      TIMEOUT
    );

    it(
      '-A with a file that is not JSON names that file in the summary and exits 1; --allow-failures exits 0',
      async () => {
        await startTenant([]);
        write('a.oauth2.issuer.json', file('a1'));
        write('b.oauth2.issuer.json', 'not json');

        const failed = run(['import', '-A']);
        expect(failed.output).toMatch(
          /1 of 2 issuers failed:\n\s+- b\.oauth2\.issuer\.json: /
        );
        expect(failed.status).toBe(1);
        expect(idsOnTenant()).toEqual(['a1']);

        expect(run(['import', '-A', '--allow-failures']).status).toBe(0);
      },
      TIMEOUT
    );

    it(
      '-A with no matching file warns and exits 0',
      async () => {
        await startTenant([]);
        write('x.agent.json', { agent: {} });

        const { status, output } = run(['import', '-A']);

        expect(output).toContain('No trusted issuer files');
        expect(status).toBe(0);
        expect(puts()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'a file that is no export of issuers exits 1 whatever --allow-failures says',
      async () => {
        await startTenant([]);
        write('journeys.json', { journey: {} });

        const { status, output } = run([
          'import',
          '-a',
          '-f',
          'journeys.json',
          '--allow-failures',
        ]);

        expect(output).toContain('No trusted issuers found in');
        expect(status).toBe(1);
        expect(puts()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'without -f or -A is rejected before anything is sent when nobody can be asked',
      async () => {
        await startTenant([]);

        const { status, output } = run(['import', '-a']);

        expect(output).toContain(
          'one of -f, --file <file> | -A, --all-separate is required'
        );
        expect(status).toBe(1);
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });
});
