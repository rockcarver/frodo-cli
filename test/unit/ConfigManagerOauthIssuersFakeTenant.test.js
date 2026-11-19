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
    return (args, extraEnvironment = {}) =>
      new Promise((resolve, reject) => {
        const child = cp.spawn(binaryPath, args, {
          cwd: work,
          env: {
            ...process.env,
            ...extraEnvironment,
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
      'takes the overrides file as --config-file only: -f is an unknown option',
      async () => {
        const run = await tenant({ oauthIssuers: [] });
        fs.writeFileSync(path.join(work, 'overrides.json'), '{"alpha":[]}');

        const short = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          '-f',
          'overrides.json',
        ]);
        expect(short.code).toBe(1);
        expect(short.output).toContain("unknown option '-f'");
        expect(requests()).toEqual([]);

        const long = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          '--config-file',
          'overrides.json',
          ...target(),
        ]);
        expect(long.code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'writes one file per issuer of every realm, in the plain shape of the single read',
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
        // the plain shape (record 0054): a property that is set is its value
        expect(written.issuer).toBe('https://zion-issuer.example.com');
        expect(JSON.stringify(written)).not.toContain('inherited');
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
      'is the only writer of the file: pull oauth2-agents leaves the issuer to it, with a warning, and writes nothing',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-issuer'] });
        const configFile = path.join(work, 'oauth2-agents.json');
        fs.writeFileSync(
          configFile,
          JSON.stringify({
            alpha: { TrustedJwtIssuer: [{ id: 'zion-issuer' }] },
          })
        );
        const before = fs.readFileSync(configFile);

        const generic = await run([
          'config-manager',
          'pull',
          'oauth2-agents',
          '-f',
          'oauth2-agents.json',
          ...target(),
        ]);

        expect(generic.code).toBe(0);
        expect(generic.output).toContain(
          `Skipping 1 TrustedJwtIssuer entry of realm 'alpha' (zion-issuer): trusted JWT issuers are pulled by "frodo config-manager pull oauth-issuers".`
        );
        expect(fs.existsSync(path.join(work, 'realms'))).toBe(false);
        expect(fs.readFileSync(configFile).equals(before)).toBe(true);

        // the dedicated kind writes the file where the generic kind used to write it
        const dedicated = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          ...target(),
        ]);
        expect(dedicated.code).toBe(0);
        expect(
          JSON.parse(
            fs.readFileSync(
              path.join(issuersOf('alpha'), 'zion-issuer.json'),
              'utf8'
            )
          )._id
        ).toBe('zion-issuer');
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
        // the file said the wrapped shape, the pull writes the plain one: the same issuer
        expect(back.issuer).toBe('https://zion-new.example.com');
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
      'says which attribute the server refused, stores the issuer without it and fails the run unless failures are allowed (cli#1338)',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-old'] });
        issuerFile('alpha', 'zion-old', {
          ...sparse('zion-old'),
          zzUnknown: { inherited: false, value: 1 },
        });
        issuerFile('alpha', 'zion-new', {
          ...sparse('zion-new'),
          zzUnknown: { inherited: false, value: 2 },
        });
        issuerFile('alpha', 'zion-whole', sparse('zion-whole'));
        const push = (...extra) =>
          run([
            'config-manager',
            'push',
            'oauth-issuers',
            ...extra,
            ...target(),
          ]);

        const failed = await push();

        // the library retried without the attribute, so both issuers are stored; the run says what it left out
        expect(failed.code).toBe(1);
        for (const id of ['zion-old', 'zion-new']) {
          expect(failed.output).toContain(
            `Trusted JWT issuer '${id}' of realm 'alpha': the server refused the attributes zzUnknown; they were not stored.`
          );
          expect(failed.output).toContain(
            `alpha/${id}: the server refused the attributes zzUnknown; the issuer is stored without them`
          );
        }
        expect(failed.output).toContain('2 of 3 trusted JWT issuers failed');
        // an issuer that was stored whole is not named
        expect(failed.output).not.toContain("'zion-whole' of realm");
        expect(puts().map(idOf)).toContain('zion-whole');

        // the user may allow it: the line is still printed, the exit code is 0
        const allowed = await push('--allow-failures');
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain(
          "Trusted JWT issuer 'zion-old' of realm 'alpha': the server refused the attributes zzUnknown"
        );
        expect(allowed.output).toContain('The exit code stays 0');

        // what the tenant holds is the file without the attribute (the pull overwrites the file of the working directory, so it comes last)
        const pulled = await run([
          'config-manager',
          'pull',
          'oauth-issuers',
          '-n',
          'zion-old',
          ...target(),
        ]);
        expect(pulled.code).toBe(0);
        const back = JSON.parse(
          fs.readFileSync(path.join(issuersOf('alpha'), 'zion-old.json'))
        );
        expect(back).not.toHaveProperty('zzUnknown');
        expect(back.issuer).toBe('https://zion-old.example.com');
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
          '--dry-run',
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

  describe('a key set with private key material (record 0055, core record 0013)', () => {
    // the real library fills a placeholder into the text of the file: what the unit tests with the library
    // stubbed cannot show is that a key set (JSON text) in a variable still gives a file that can be read
    const keySet = JSON.stringify({
      keys: [
        {
          kty: 'RSA',
          kid: 'zion-key',
          n: 'modulus',
          e: 'AQAB',
          d: 'private-"part"',
        },
      ],
    });
    const holder = () => ({
      _id: 'zion-issuer',
      _rev: '1',
      _type: {
        _id: 'TrustedJwtIssuer',
        name: 'OAuth2 Trusted JWT Issuer',
        collection: true,
      },
      issuer: 'https://zion-issuer.example.com',
      allowedSubjects: [],
      jwkSet: keySet,
      jwksUri: null,
    });
    const file = () => path.join(issuersOf('alpha'), 'zion-issuer.json');
    const puts = () => requests().filter((r) => r.method === 'PUT');
    const pullIt = (run) =>
      run(['config-manager', 'pull', 'oauth-issuers', ...target()]);
    const pushIt = (run, extra = [], environment = {}) =>
      run(
        ['config-manager', 'push', 'oauth-issuers', ...extra, ...target()],
        environment
      );

    it(
      'is not written by a pull: the file has the placeholder, the warning names the variable, and the key is in neither',
      async () => {
        const run = await tenant({ trustedIssuers: [holder()] });

        const { code, output } = await pullIt(run);

        expect(code).toBe(0);
        expect(output).toContain(
          "Trusted JWT issuer 'zion-issuer' of realm 'alpha' holds private or secret key material in jwkSet: it is not written. The file has ${ZION_ISSUER_JWKSET} in its place; set that variable to the key set when you push."
        );
        expect(output).not.toContain('private-');
        const text = fs.readFileSync(file(), 'utf8');
        expect(JSON.parse(text).jwkSet).toBe('${ZION_ISSUER_JWKSET}');
        expect(text).not.toContain('private-');
        expect(text).not.toContain('modulus');
      },
      TIMEOUT
    );

    it(
      'is filled by a push from the variable of the process, as the key set that the tenant holds, and a second pull writes the same file',
      async () => {
        const run = await tenant({ trustedIssuers: [holder()] });
        await pullIt(run);
        const written = fs.readFileSync(file(), 'utf8');

        const { code, output } = await pushIt(run, [], {
          ZION_ISSUER_JWKSET: keySet,
        });

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        expect(puts()).toHaveLength(1);
        expect(JSON.parse(puts()[0].body).jwkSet).toBe(keySet);
        // the tenant holds the same key set as before the round trip: a pull writes the same file
        fs.rmSync(file());
        await pullIt(run);
        expect(fs.readFileSync(file(), 'utf8')).toBe(written);
      },
      TIMEOUT
    );

    it(
      'is filled by a push from -E as well',
      async () => {
        const run = await tenant({ trustedIssuers: [holder()] });
        await pullIt(run);

        const { code, output } = await pushIt(run, [
          '-E',
          `ZION_ISSUER_JWKSET=${keySet}`,
        ]);

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        expect(JSON.parse(puts()[0].body).jwkSet).toBe(keySet);
      },
      TIMEOUT
    );

    it(
      'is refused by a push without the variable: the issuer is named, nothing is sent, and the placeholder is never stored',
      async () => {
        const run = await tenant({ trustedIssuers: [holder()] });
        await pullIt(run);

        const { code, output } = await pushIt(run);

        expect(code).toBe(1);
        expect(output).toContain(
          'No value found for placeholder "ZION_ISSUER_JWKSET"'
        );
        expect(output).toContain(
          '- alpha/zion-issuer.json: No value found for placeholder "ZION_ISSUER_JWKSET"'
        );
        expect(puts()).toEqual([]);
      },
      TIMEOUT
    );
  });
});
