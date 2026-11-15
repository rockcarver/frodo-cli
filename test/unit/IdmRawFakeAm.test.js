import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `frodo idm export --raw`, `frodo idm import --raw` and the answer of
 * `frodo idm import` to a file that has no `idm` wrapper (#476), driven through
 * the REAL CLI of this checkout and the REAL library against the fake AM of
 * test/utils/FakeAm.mjs in a separate process: no tenant, no recording. The
 * fake serves and takes IDM configuration objects (`idmEntities`) and its
 * request log holds the body of every write, so a test sees exactly what would
 * have reached a tenant, and that nothing did when the command refused.
 *
 * Before the fix, `idm import -i <entity> -f <raw file>` failed with the library's
 * "Cannot convert undefined or null to object", and for `sync` and `managed` it
 * did worse: it read the unwrapped file as a configuration object without
 * mappings or managed objects and wrote THAT to the tenant.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const SYNC = {
  _id: 'sync',
  mappings: [
    {
      name: 'managedAlpha_user_systemLdap',
      source: 'managed/alpha_user',
      target: 'system/ldap/account',
      properties: [{ source: 'mail', target: 'mail' }],
      onCreate: {
        type: 'text/javascript',
        source: 'object.userName = source.userName;',
      },
    },
  ],
};
const MANAGED = {
  _id: 'managed',
  objects: [{ name: 'alpha_user', schema: { type: 'object', properties: {} } }],
};
const CONNECTOR = {
  _id: 'provisioner.openicf/zion',
  name: 'zion',
  connectorRef: { connectorName: 'org.zion.Connector', bundleName: 'zion' },
};
/** What IDM serves: the objects, and a revision the export drops. */
const SERVED = {
  sync: { ...SYNC, _rev: '7' },
  managed: { ...MANAGED, _rev: '3' },
  'provisioner.openicf/zion': { ...CONNECTOR, _rev: '1' },
};

/** The requests that change a tenant. */
const writesOf = (requests) =>
  requests.filter(
    ({ method, url }) =>
      ['PUT', 'PATCH', 'DELETE'].includes(method) ||
      (method === 'POST' &&
        !url.includes('/authenticate') &&
        !url.includes('/oauth2/access_token'))
  );

suite('idm export and import of raw configuration objects', () => {
  let home;
  let work;
  let logDir;
  let recordPath;
  const fakes = [];

  beforeAll(() => {
    ensureFrodoArtifact();
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-idm-raw-log-'));
    recordPath = path.join(logDir, 'requests.jsonl');
  });

  afterAll(() => {
    for (const fake of fakes) fake.stop();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-idm-raw-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-idm-raw-work-'));
    fs.rmSync(recordPath, { force: true });
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a fake AM that serves the objects, and is stopped when the suite ends. */
  async function tenant(idmEntities = SERVED) {
    const started = await startFakeAm({
      journey: 'service-account',
      recordPath,
      idmEntities: structuredClone(idmEntities),
    });
    fakes.push(started);
    return started;
  }

  /** Runs `frodo <args>` in the working directory, without a terminal, and answers its exit code and both outputs. */
  function run(args) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(binaryPath, args, {
        cwd: work,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_TEST: '',
          FRODO_NO_CACHE: 'true',
          FRODO_HOST: '',
          FRODO_REALM: '',
          FRODO_USERNAME: '',
          FRODO_PASSWORD: '',
          FRODO_CREDENTIAL: '',
          FRODO_SA_ID: 'test-account',
          FRODO_SA_JWK: serviceAccountJwk,
          NODE_OPTIONS: '',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  const idm = (verb, server, args) =>
    run([
      'idm',
      verb,
      ...args,
      `http://127.0.0.1:${server.port}/am`,
      '--type',
      'cloud',
    ]);

  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(work, name), 'utf8'));
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(work, name)), { recursive: true });
    fs.writeFileSync(
      path.join(work, name),
      typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    );
  };
  const written = () => writesOf(readRequests(recordPath));

  describe('idm export --raw', () => {
    it(
      'writes the object as IDM serves it, without wrapper, metadata and revision, to <id>.json',
      async () => {
        const server = await tenant();

        const { code, stderr } = await idm('export', server, [
          '-i',
          'sync',
          '--raw',
        ]);

        expect(stderr).toBe('');
        expect(code).toBe(0);
        expect(read('sync.json')).toEqual(SYNC);
        expect(fs.readdirSync(work)).toEqual(['sync.json']);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'keeps the scripts inline and does not extract them, whatever -x says',
      async () => {
        const server = await tenant();

        const { code } = await idm('export', server, ['-i', 'sync', '--raw']);

        expect(code).toBe(0);
        expect(read('sync.json').mappings[0].onCreate.source).toBe(
          'object.userName = source.userName;'
        );
        expect(fs.readdirSync(work)).toEqual(['sync.json']);
      },
      TIMEOUT
    );

    it(
      'names the file of an id with a slash the way the IDM conf directory does',
      async () => {
        const server = await tenant();

        const { code } = await idm('export', server, [
          '-i',
          'provisioner.openicf/zion',
          '--raw',
        ]);

        expect(code).toBe(0);
        expect(read('provisioner.openicf-zion.json')).toEqual(CONNECTOR);
      },
      TIMEOUT
    );

    it(
      'takes -f for the file name and -D for the directory',
      async () => {
        const server = await tenant();

        const { code } = await idm('export', server, [
          '-i',
          'managed',
          '--raw',
          '-f',
          'mine.json',
          '-D',
          'out',
        ]);

        expect(code).toBe(0);
        expect(read('out/mine.json')).toEqual(MANAGED);
      },
      TIMEOUT
    );

    it(
      'fails with exit 1 and writes no file when the tenant does not have the object',
      async () => {
        const server = await tenant();

        const { code, stderr } = await idm('export', server, [
          '-i',
          'nothere',
          '--raw',
        ]);

        expect(stderr).toMatch(/Error exporting config entity nothere/);
        expect(code).toBe(1);
        expect(fs.readdirSync(work)).toEqual([]);
      },
      TIMEOUT
    );

    it.each([
      [
        ['-a', '--raw'],
        /option '-r, --raw' cannot be used with option '-a, --all'/,
      ],
      [
        ['-A', '-D', 'd', '--raw'],
        /option '-r, --raw' cannot be used with option '-A, --all-separate'/,
      ],
      [
        ['-e', 'e.json', '--raw'],
        /option '-r, --raw' cannot be used with option '-e, --entities-file <entities-file>'/,
      ],
    ])(
      '%j is refused while the command line is read, before any login',
      async (args, message) => {
        const server = await tenant();

        const { code, stderr } = await idm('export', server, args);

        expect(stderr).toMatch(message);
        expect(code).toBe(1);
        expect(readRequests(recordPath)).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'without -i there is nothing to export, and the command says so',
      async () => {
        const server = await tenant();

        const { code, stderr } = await idm('export', server, ['--raw']);

        expect(stderr).toMatch(/is required -- choose what to export/);
        expect(code).toBe(1);
        expect(readRequests(recordPath)).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('idm import --raw', () => {
    it(
      'puts the object of <id>.json, as it is, to the tenant',
      async () => {
        const server = await tenant();
        write('sync.json', SYNC);

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '--raw',
        ]);

        expect(stderr).toContain('Imported sync from sync.json.');
        expect(code).toBe(0);
        const puts = written();
        expect(puts).toHaveLength(1);
        expect(puts[0].method).toBe('PUT');
        expect(puts[0].url).toContain('/openidm/config/sync');
        expect(JSON.parse(puts[0].body)).toEqual(SYNC);
      },
      TIMEOUT
    );

    it(
      'takes <id>.json when -f is given without a file name',
      async () => {
        const server = await tenant();
        write('sync.json', SYNC);

        const { code } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          '--raw',
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(written()[0].body)).toEqual(SYNC);
      },
      TIMEOUT
    );

    it(
      'takes the object from -f and names it by its _id when -i is not given',
      async () => {
        const server = await tenant();
        write('elsewhere.json', CONNECTOR);

        const { code } = await idm('import', server, [
          '-f',
          'elsewhere.json',
          '--raw',
        ]);

        expect(code).toBe(0);
        const puts = written();
        expect(puts).toHaveLength(1);
        expect(decodeURIComponent(puts[0].url)).toContain(
          '/openidm/config/provisioner.openicf/zion'
        );
        expect(JSON.parse(puts[0].body)).toEqual(CONNECTOR);
      },
      TIMEOUT
    );

    it(
      'names the object by -i when the file has no _id',
      async () => {
        const server = await tenant();
        const { _id, ...withoutId } = SYNC;
        write('given.json', withoutId);

        const { code } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          'given.json',
          '--raw',
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(written()[0].body)).toEqual({ ...withoutId, _id });
      },
      TIMEOUT
    );

    it(
      'refuses a file whose _id is another object than the one -i names, and writes nothing',
      async () => {
        const server = await tenant();
        write('managed.json', MANAGED);

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          'managed.json',
          '--raw',
        ]);

        expect(stderr).toMatch(
          /managed\.json holds the configuration object "managed", not "sync": nothing was imported/
        );
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'refuses a file without _id when -i does not name the object, and writes nothing',
      async () => {
        const server = await tenant();
        const { _id, ...withoutId } = SYNC;
        write('anon.json', withoutId);

        const { code, stderr } = await idm('import', server, [
          '-f',
          'anon.json',
          '--raw',
        ]);

        expect(stderr).toMatch(/anon\.json has no _id/);
        expect(stderr).toMatch(/name it with -i\/--entity-id/);
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it.each([
      ['an empty idm property', { idm: {} }],
      [
        'an idm property that holds settings, not configuration objects',
        { idm: { enabled: true, name: 'x' } },
      ],
    ])(
      'imports an object that has %s: only a wrapper of configuration objects makes a file an export',
      async (_name, extra) => {
        const server = await tenant();
        const object = { _id: 'sync', ...extra };
        write('odd.json', object);

        const { code } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          'odd.json',
          '--raw',
        ]);

        expect(code).toBe(0);
        const puts = written();
        expect(puts).toHaveLength(1);
        expect(JSON.parse(puts[0].body)).toEqual(object);
      },
      TIMEOUT
    );

    it(
      'refuses a Frodo export (a file with the idm wrapper) and writes nothing: it would replace the object with the wrapper',
      async () => {
        const server = await tenant();
        write('wrapped.idm.json', { idm: { sync: SYNC } });

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          'wrapped.idm.json',
          '--raw',
        ]);

        expect(stderr).toMatch(
          /wrapped\.idm\.json is a Frodo IDM export: it has an "idm" wrapper around the configuration objects\. Import it without --raw\./
        );
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it.each([
      ['a list', '[1, 2]', /does not hold a configuration object/],
      ['a string', '"sync"', /does not hold a configuration object/],
      ['an _id that is not a string', '{"_id": 7}', /_id that is not a string/],
    ])(
      'refuses %s and writes nothing',
      async (_name, content, message) => {
        const server = await tenant();
        write('bad.json', content);

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          'bad.json',
          '--raw',
        ]);

        expect(stderr).toMatch(message);
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'fails with exit 1 when <id>.json is not there, and writes nothing',
      async () => {
        const server = await tenant();

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '--raw',
        ]);

        expect(stderr).toMatch(/sync\.json/);
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'fails with exit 1 when the tenant refuses the object',
      async () => {
        const server = await startFakeAm({
          journey: 'service-account',
          recordPath,
          idmEntities: structuredClone(SERVED),
          failRequests: [{ method: 'PUT', path: '/openidm/config/sync' }],
        });
        fakes.push(server);
        write('sync.json', SYNC);

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '--raw',
        ]);

        expect(stderr).toMatch(/Error importing idm config entity sync/);
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it.each([
      [
        ['-a', '-f', 'x.json', '--raw'],
        /'-r, --raw' cannot be used with option '-a, --all'/,
      ],
      [
        ['-A', '-D', 'd', '--raw'],
        /'-r, --raw' cannot be used with option '-A, --all-separate'/,
      ],
      [
        ['-e', 'e.json', '-f', 'x.json', '--raw'],
        /'-r, --raw' cannot be used with option '-e, --entities-file <entities-file>'/,
      ],
    ])(
      '%j is refused while the command line is read, before any login',
      async (args, message) => {
        const server = await tenant();

        const { code, stderr } = await idm('import', server, args);

        expect(stderr).toMatch(message);
        expect(code).toBe(1);
        expect(readRequests(recordPath)).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'imports what export --raw wrote: the object that comes back is the one that was served',
      async () => {
        const server = await tenant();
        expect(
          (await idm('export', server, ['-i', 'managed', '--raw'])).code
        ).toBe(0);

        const { code } = await idm('import', server, [
          '-i',
          'managed',
          '--raw',
        ]);

        expect(code).toBe(0);
        const puts = written();
        expect(puts).toHaveLength(1);
        expect(JSON.parse(puts[0].body)).toEqual(MANAGED);
      },
      TIMEOUT
    );
  });

  describe('idm import of a file without the idm wrapper, without --raw', () => {
    const NOT_AN_EXPORT =
      /is not a Frodo IDM export: it has no "idm" wrapper\. If it holds a configuration object as IDM serves it, import it with --raw\./;
    // --raw cannot be combined with -a or -A, so these two say what to do instead
    const NOT_AN_EXPORT_ALL =
      /is not a Frodo IDM export: it has no "idm" wrapper\. If it holds one configuration object as IDM serves it, import it with --raw and without -a\./;
    const NOT_AN_EXPORT_DIRECTORY =
      /is not a Frodo IDM export: it has no "idm" wrapper\. A directory import reads Frodo exports only\. If it holds a configuration object as IDM serves it, import that file on its own with -i <id> --raw -f <file>\./;

    it.each([
      ['sync', ['-i', 'sync', '-f', 'raw.json'], SYNC],
      ['managed', ['-i', 'managed', '-f', 'raw.json'], MANAGED],
      [
        'a connector',
        ['-i', 'provisioner.openicf/zion', '-f', 'raw.json'],
        CONNECTOR,
      ],
      ['the first object of the file (-f)', ['-f', 'raw.json'], SYNC],
    ])(
      '%s: fails with exit 1, names --raw, and writes nothing to the tenant',
      async (_name, args, content) => {
        const server = await tenant();
        write('raw.json', content);

        const { code, stderr } = await idm('import', server, args);

        expect(stderr).toMatch(NOT_AN_EXPORT);
        expect(stderr).not.toMatch(/Cannot convert undefined or null/);
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'all objects of a file (-a -f): says to drop -a, because --raw cannot be used with it',
      async () => {
        const server = await tenant();
        write('raw.json', SYNC);

        const { code, stderr } = await idm('import', server, [
          '-a',
          '-f',
          'raw.json',
        ]);

        expect(stderr).toMatch(NOT_AN_EXPORT_ALL);
        expect(stderr).not.toMatch(/Cannot convert undefined or null/);
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'a directory import (-A) names the file that has no wrapper, imports the others and exits 1',
      async () => {
        const server = await tenant();
        write('dir/raw.idm.json', CONNECTOR);
        write('dir/good.idm.json', {
          idm: { good: { _id: 'good', value: 1 } },
        });

        const { code, stderr } = await idm('import', server, [
          '-A',
          '-D',
          'dir',
        ]);

        expect(stderr).toMatch(NOT_AN_EXPORT_DIRECTORY);
        expect(code).toBe(1);
        const puts = written();
        expect(puts).toHaveLength(1);
        expect(puts[0].url).toContain('/openidm/config/good');
      },
      TIMEOUT
    );

    it(
      'a file of the export format that holds no sync object is not imported as an empty sync',
      async () => {
        const server = await tenant();
        write('other.idm.json', { idm: { managed: MANAGED } });

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          'other.idm.json',
        ]);

        expect(stderr).toMatch(
          /other\.idm\.json holds no "sync" configuration object: nothing was imported/
        );
        expect(code).toBe(1);
        expect(written()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('idm import of a Frodo export still works as it did', () => {
    it(
      '-i sync -f imports the mappings of the wrapped file',
      async () => {
        const server = await tenant();
        write('sync.idm.json', { idm: { sync: SYNC } });

        const { code, stderr } = await idm('import', server, [
          '-i',
          'sync',
          '-f',
          'sync.idm.json',
        ]);

        expect(stderr).toBe('');
        expect(code).toBe(0);
        const puts = written();
        expect(puts).toHaveLength(1);
        expect(JSON.parse(puts[0].body)).toEqual(SYNC);
      },
      TIMEOUT
    );

    it(
      '-i <entity> -f imports the wrapped object',
      async () => {
        const server = await tenant();
        write('zion.idm.json', { idm: { [CONNECTOR._id]: CONNECTOR } });

        const { code } = await idm('import', server, [
          '-i',
          'provisioner.openicf/zion',
          '-f',
          'zion.idm.json',
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(written()[0].body)).toEqual(CONNECTOR);
      },
      TIMEOUT
    );

    it(
      '-f imports the first object of the wrapped file, and -a -f all of them',
      async () => {
        const server = await tenant();
        write('all.idm.json', {
          idm: { [CONNECTOR._id]: CONNECTOR, sync: SYNC },
        });

        expect((await idm('import', server, ['-f', 'all.idm.json'])).code).toBe(
          0
        );
        expect(written()).toHaveLength(1);
        fs.rmSync(recordPath, { force: true });

        expect(
          (await idm('import', server, ['-a', '-f', 'all.idm.json'])).code
        ).toBe(0);
        expect(written()).toHaveLength(2);
      },
      TIMEOUT
    );
  });
});
