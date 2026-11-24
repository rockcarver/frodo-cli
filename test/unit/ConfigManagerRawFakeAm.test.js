import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { startRawProxy } from '../utils/RawConfigProxy.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `frodo config-manager pull raw` (`--stdout`, `--path`, `-V, --push-api-version`) and the
 * version that `config-manager push raw` sends, driven through the REAL CLI of this checkout and
 * the REAL library against the fake AM of test/utils/FakeAm.mjs in a separate process, with a
 * small proxy in front of it that serves the raw paths and records the request headers
 * (test/utils/RawConfigProxy.js): no tenant, no recording.
 *
 * What it guards: what `--stdout` prints is ONE valid JSON document that the next command can
 * read (it was the text that `console.dir` makes: unquoted keys, colours in a pipe, cut at depth
 * 10); `--path` works without a config file and with one that lists the path; the default pull of
 * a config file writes what it always wrote; a path never reaches outside the config folder; a
 * push sends the API version of the file (the CLI deleted it before the library could read it).
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const WEBHOOK_PATH =
  '/am/json/realms/root/realms/alpha/realm-config/webhooks/test-webhook';
const DEFAULT_VERSION = 'protocol=2.0,resource=1.0';

const OK1 = { _id: 'ok1', _rev: '7', v: 1 };
const OK2 = { _id: 'ok2', v: 2 };
/** Quotes, a placeholder, accents, and 12 levels of depth: what the text of console.dir loses. */
const DEEP = {
  _id: 'deep',
  say: 'a "quoted" ${ESV_X} and \u00e9 and a\\b',
  list: Array.from({ length: 300 }, (_, i) => i),
  l1: {
    l2: {
      l3: {
        l4: {
          l5: {
            l6: { l7: { l8: { l9: { l10: { l11: { l12: 'bottom' } } } } } },
          },
        },
      },
    },
  },
};
const WEBHOOK = {
  _id: 'test-webhook',
  _rev: '1846295412',
  url: 'https://zion.example.com/hook',
  headers: { accept: '*/*' },
  list: [1, 2, 3],
};
const RELEASE = { channel: 'rapid', currentVersion: '24777.0' };

const ROUTES = {
  '/openidm/config/ok1': OK1,
  '/openidm/config/ok2': OK2,
  '/openidm/config/deep': DEEP,
  '/openidm/config/a/b': { _id: 'b', nested: true },
  '/openidm/config/placeholder': {
    _id: 'placeholder',
    v: '${ESV_X}',
    w: 'a-${B}',
  },
  [WEBHOOK_PATH]: WEBHOOK,
  '/environment/release': RELEASE,
  // what the HTTP client reaches when it normalises a path that goes up
  '/escape': { _id: 'escape' },
  '/outside': { _id: 'outside' },
  '/etc/passwd': { _id: 'passwd' },
  '/x': { _id: 'x' },
};

/** The list that a config file holds: an override of a list, and a push API version. */
const LISTED_WEBHOOK = {
  path: WEBHOOK_PATH,
  overrides: { url: 'https://zion.example.com/override', list: [9] },
  pushApiVersion: { protocol: '2.0', resource: '1.0' },
};
/** What that item pulls to: the override merged by the library (a list by index) and the version noted. */
const PULLED_WEBHOOK = {
  ...WEBHOOK,
  url: 'https://zion.example.com/override',
  list: [9, 2, 3],
  _pushApiVersion: { protocol: '2.0', resource: '1.0' },
};
const RAW_FILE = [
  { path: '/openidm/config/ok1' },
  LISTED_WEBHOOK,
  { path: '/environment/release' },
];

/** Every file below a folder, relative to it, sorted. */
function filesBelow(folder) {
  if (!fs.existsSync(folder)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(path.relative(folder, full));
    }
  };
  walk(folder);
  return found.sort();
}

suite('config-manager pull raw and push raw against a fake tenant', () => {
  let home;
  let sandbox;
  let work;
  let logDir;
  let recordPath;
  const stoppers = [];

  beforeAll(() => {
    ensureFrodoArtifact();
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-raw-log-'));
    recordPath = path.join(logDir, 'requests.jsonl');
  });

  afterAll(async () => {
    for (const stop of stoppers) await stop();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-raw-home-'));
    // the working directory has a sibling, so a file that escapes it is found
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-raw-box-'));
    work = path.join(sandbox, 'mid', 'work');
    fs.mkdirSync(work, { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'marker.txt'), 'untouched');
    fs.rmSync(recordPath, { force: true });
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  /** Starts a fake AM with the proxy in front of it; both are stopped when the suite ends. */
  async function tenant({ routes = ROUTES, failPaths = [] } = {}) {
    const fake = await startFakeAm({
      journey: 'service-account',
      recordPath,
    });
    stoppers.push(async () => fake.stop());
    const proxy = await startRawProxy({
      upstreamPort: fake.port,
      routes: structuredClone(routes),
      failPaths,
    });
    stoppers.push(() => proxy.stop());
    return proxy;
  }

  /**
   * Runs `frodo <args>` in the working directory, without a terminal, and answers its exit code
   * and both outputs. Colours are on, as they are for a user: neither NO_COLOR nor FORCE_COLOR is set.
   */
  function run(args, { stdin } = {}) {
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      FRODO_TEST: '',
      FRODO_NO_CACHE: 'true',
      FRODO_NO_UPDATE_CHECK: '1',
      FRODO_HOST: '',
      FRODO_REALM: '',
      FRODO_USERNAME: '',
      FRODO_PASSWORD: '',
      FRODO_CREDENTIAL: '',
      FRODO_SA_ID: 'test-account',
      FRODO_SA_JWK: serviceAccountJwk,
      NODE_OPTIONS: '',
    };
    delete env.NO_COLOR;
    delete env.FORCE_COLOR;
    return new Promise((resolve, reject) => {
      const child = cp.spawn(binaryPath, args, {
        cwd: work,
        env,
        stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      if (stdin !== undefined) child.stdin.end(stdin);
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  const hostOf = (proxy) => [
    `http://127.0.0.1:${proxy.port}/am`,
    '--type',
    'cloud',
  ];
  const pull = (proxy, args) =>
    run(['config-manager', 'pull', 'raw', ...args, ...hostOf(proxy)]);
  const push = (proxy, args, options) =>
    run(['config-manager', 'push', 'raw', ...args, ...hostOf(proxy)], options);
  const writeRawFile = (items = RAW_FILE) =>
    fs.writeFileSync(path.join(work, 'raw.json'), JSON.stringify(items));
  const readJson = (file) =>
    JSON.parse(fs.readFileSync(path.join(work, file), 'utf8'));
  const putsTo = (proxy, pathname) =>
    proxy
      .tenantRequests()
      .filter((r) => r.method === 'PUT' && r.pathname === pathname);

  describe('--stdout', () => {
    it(
      'prints the object of --path as one valid JSON document and nothing else, in colour or not, and writes no file',
      async () => {
        const proxy = await tenant();

        const { code, stdout, stderr } = await pull(proxy, [
          '--stdout',
          '--path',
          '/openidm/config/deep',
        ]);

        expect(code).toBe(0);
        // not a terminal: no colour codes, no inspect text, nothing cut at depth 10
        expect(stdout).not.toContain('\u001b');
        expect(stdout).toBe(`${JSON.stringify(DEEP, null, 2)}\n`);
        expect(JSON.parse(stdout)).toEqual(DEEP);
        // the messages go to the other stream
        expect(stderr).toContain('Experimental feature in use');
        expect(filesBelow(sandbox)).toEqual(['marker.txt']);
      },
      TIMEOUT
    );

    it(
      'prints one list in the order of the config file, and the item of the file has its override and version',
      async () => {
        const proxy = await tenant();
        writeRawFile();

        const { code, stdout } = await pull(proxy, [
          '--stdout',
          '--config-file',
          'raw.json',
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toEqual([OK1, PULLED_WEBHOOK, RELEASE]);
        expect(filesBelow(work)).toEqual(['raw.json']);
      },
      TIMEOUT
    );

    it(
      'prints what it could pull when one item fails, then fails late; --allow-failures keeps the exit code 0',
      async () => {
        const proxy = await tenant({ failPaths: ['/openidm/config/ok2'] });
        writeRawFile([
          { path: '/openidm/config/ok1' },
          { path: '/openidm/config/ok2' },
          { path: '/environment/release' },
        ]);

        const failed = await pull(proxy, [
          '--stdout',
          '--config-file',
          'raw.json',
        ]);
        expect(failed.code).toBe(1);
        expect(JSON.parse(failed.stdout)).toEqual([OK1, RELEASE]);
        expect(failed.stderr).toContain('1 of 3 raw configs failed');
        expect(failed.stderr).toContain('/openidm/config/ok2');

        const allowed = await pull(proxy, [
          '--stdout',
          '--config-file',
          'raw.json',
          '--allow-failures',
        ]);
        expect(allowed.code).toBe(0);
        expect(JSON.parse(allowed.stdout)).toEqual([OK1, RELEASE]);
        expect(allowed.stderr).toContain('1 of 3 raw configs failed');
      },
      TIMEOUT
    );

    it(
      'prints nothing on stdout and fails when the one --path cannot be pulled',
      async () => {
        const proxy = await tenant({ failPaths: ['/openidm/config/ok1'] });

        const { code, stdout, stderr } = await pull(proxy, [
          '--stdout',
          '--path',
          '/openidm/config/ok1',
        ]);

        expect(code).toBe(1);
        expect(stdout).toBe('');
        expect(stderr).toContain('1 of 1 raw config failed');
      },
      TIMEOUT
    );

    it(
      'is what push raw --stdin reads: the object goes through a pipe and arrives as the same object, without its revision',
      async () => {
        const proxy = await tenant();

        const pulled = await pull(proxy, [
          '--stdout',
          '--path',
          '/openidm/config/ok1',
        ]);
        const pushed = await push(
          proxy,
          ['--path', '/openidm/config/ok1', '--stdin'],
          { stdin: pulled.stdout }
        );

        expect(pulled.code).toBe(0);
        expect(pushed.code).toBe(0);
        const [put] = putsTo(proxy, '/openidm/config/ok1');
        expect(JSON.parse(put.body)).toEqual({ v: 1 });
      },
      TIMEOUT
    );

    it(
      'cannot be used with -D: refused while the command line is parsed, before any request',
      async () => {
        const proxy = await tenant();

        const { code, stderr } = await pull(proxy, [
          '--stdout',
          '--path',
          '/openidm/config/ok1',
          '-D',
          'out',
        ]);

        expect(code).toBe(1);
        expect(stderr).toMatch(/--stdout.*-D|-D.*--stdout|conflict/i);
        expect(proxy.requests()).toEqual([]);
        expect(filesBelow(sandbox)).toEqual(['marker.txt']);
      },
      TIMEOUT
    );
  });

  describe('--path', () => {
    it(
      'pulls one path without a config file, into the config folder',
      async () => {
        const proxy = await tenant();

        const { code } = await pull(proxy, [
          '--path',
          '/openidm/config/ok1',
          '-D',
          'out',
        ]);

        expect(code).toBe(0);
        expect(filesBelow(sandbox)).toEqual([
          'marker.txt',
          'mid/work/out/raw/openidm/config/ok1.json',
        ]);
        expect(readJson('out/raw/openidm/config/ok1.json')).toEqual(OK1);
      },
      TIMEOUT
    );

    it(
      'pulls the item of the config file that lists the path, with its override and version, as the whole file pulls it',
      async () => {
        const proxy = await tenant();
        writeRawFile();

        const whole = await pull(proxy, [
          '--config-file',
          'raw.json',
          '-D',
          'whole',
        ]);
        const one = await pull(proxy, [
          '--config-file',
          'raw.json',
          '--path',
          WEBHOOK_PATH,
          '-D',
          'one',
        ]);
        // the same path without its leading slash is the same path
        const slash = await pull(proxy, [
          '--config-file',
          'raw.json',
          '--path',
          WEBHOOK_PATH.slice(1),
          '-D',
          'slash',
        ]);

        const file = `raw${WEBHOOK_PATH}.json`;
        expect([whole.code, one.code, slash.code]).toEqual([0, 0, 0]);
        expect(filesBelow(path.join(work, 'one'))).toEqual([file]);
        expect(readJson(`one/${file}`)).toEqual(PULLED_WEBHOOK);
        expect(fs.readFileSync(path.join(work, `one/${file}`), 'utf8')).toBe(
          fs.readFileSync(path.join(work, `whole/${file}`), 'utf8')
        );
        expect(readJson(`slash/${file}`)).toEqual(PULLED_WEBHOOK);
      },
      TIMEOUT
    );

    it(
      'pulls a path that the config file does not list as it is, without the overrides of the other items',
      async () => {
        const proxy = await tenant();
        writeRawFile();

        const { code, stdout } = await pull(proxy, [
          '--config-file',
          'raw.json',
          '--path',
          '/openidm/config/ok2',
          '--stdout',
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toEqual(OK2);
      },
      TIMEOUT
    );

    it(
      'needs the config file to exist, when one is given, and to be a list',
      async () => {
        const proxy = await tenant();

        const missing = await pull(proxy, [
          '--config-file',
          'nope.json',
          '--path',
          '/openidm/config/ok1',
          '--stdout',
        ]);
        fs.writeFileSync(path.join(work, 'object.json'), '{"path":"x"}');
        const notAList = await pull(proxy, [
          '--config-file',
          'object.json',
          '--path',
          '/openidm/config/ok1',
          '--stdout',
        ]);

        expect(missing.code).toBe(1);
        expect(missing.stderr).toContain(
          "The raw config file 'nope.json' does not exist."
        );
        expect(notAList.code).toBe(1);
        expect(notAList.stderr).toContain('must contain a list of items');
        expect(missing.stdout + notAList.stdout).toBe('');
        expect(proxy.tenantRequests()).toEqual([]);
      },
      TIMEOUT
    );

    it.each([[''], ['   '], ['\t']])(
      'refuses the value %j while the command line is parsed: an empty value never means the whole config file',
      async (value) => {
        const proxy = await tenant();
        writeRawFile();

        const { code, stderr } = await pull(proxy, [
          '--path',
          value,
          '--config-file',
          'raw.json',
          '-D',
          'out',
        ]);

        expect(code).toBe(1);
        expect(stderr).toContain('must not be empty or blank');
        expect(proxy.requests()).toEqual([]);
        expect(filesBelow(work)).toEqual(['raw.json']);
      },
      TIMEOUT
    );

    it(
      'needs the config file or the path, and says so before it logs in',
      async () => {
        const proxy = await tenant();

        const { code, stderr } = await pull(proxy, ['-D', 'out']);

        expect(code).toBe(1);
        expect(stderr).toMatch(/--config-file.*--path|--path.*--config-file/s);
        expect(proxy.requests()).toEqual([]);
      },
      TIMEOUT
    );

    // The path is a path by design (`/openidm/config/cluster`), and it stays inside the config folder.
    it.each([
      ['goes up from the start', '../../x'],
      ['goes up behind the first folder', '/openidm/../../etc/passwd'],
      ['goes up behind the second folder', 'openidm/config/../../../outside'],
      ['is an absolute file path', '/etc/passwd'],
      ['uses backslashes', '/openidm/config\\..\\..\\x'],
      ['names a drive', 'C:/x'],
      ['goes up in the middle', '/openidm/config/ok1/../ok2'],
    ])(
      'writes nothing outside the config folder for a path that %s',
      async (_, hostile) => {
        const proxy = await tenant();

        const { code, stderr } = await pull(proxy, [
          '--path',
          hostile,
          '-D',
          'out',
        ]);

        expect(code).toBe(1);
        // the path was taken as a path and refused, by the library or by the config folder
        expect(stderr).not.toContain('unknown option');
        expect(stderr).toMatch(
          /must stay inside the config folder|not supported/
        );
        // not a file below the working directory, none next to it, none above the box
        expect(filesBelow(sandbox)).toEqual(['marker.txt']);
        expect(fs.readFileSync(path.join(sandbox, 'marker.txt'), 'utf8')).toBe(
          'untouched'
        );
      },
      TIMEOUT
    );

    it(
      'still writes a nested name inside the config folder: a raw path is a path by design',
      async () => {
        const proxy = await tenant();

        const { code } = await pull(proxy, [
          '--path',
          '/openidm/config/a/b',
          '-D',
          'out',
        ]);

        expect(code).toBe(0);
        expect(filesBelow(path.join(work, 'out'))).toEqual([
          'raw/openidm/config/a/b.json',
        ]);
      },
      TIMEOUT
    );

    it(
      'prints a hostile path with --stdout without writing anything',
      async () => {
        const proxy = await tenant();

        const { code, stdout } = await pull(proxy, [
          '--path',
          '/openidm/config/ok1/../ok2',
          '--stdout',
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toEqual(OK2);
        expect(filesBelow(sandbox)).toEqual(['marker.txt']);
      },
      TIMEOUT
    );
  });

  describe('-V, --push-api-version', () => {
    it(
      'is recorded as _pushApiVersion in the file of a path under /am, and the read itself uses the default API version',
      async () => {
        const proxy = await tenant();

        const { code } = await pull(proxy, [
          '--path',
          WEBHOOK_PATH,
          '-V.protocol',
          '2.1',
          '-V.resource',
          '1.0',
          '-D',
          'out',
        ]);

        expect(code).toBe(0);
        expect(readJson(`out/raw${WEBHOOK_PATH}.json`)).toEqual({
          ...WEBHOOK,
          _pushApiVersion: { protocol: '2.1', resource: '1.0' },
        });
        const [read] = proxy
          .tenantRequests()
          .filter((r) => r.method === 'GET' && r.pathname === WEBHOOK_PATH);
        expect(read.acceptApiVersion).toBe(DEFAULT_VERSION);
      },
      TIMEOUT
    );

    it.each([
      [
        [
          '--push-api-version.protocol',
          '2.1',
          '--push-api-version.resource',
          '1.0',
        ],
      ],
      [['-V.protocol=2.1', '-V.resource=1.0']],
      [['-V', 'protocol=2.1', '-V', 'resource=1.0']],
    ])(
      'takes the other spellings of the dot notation: %j',
      async (version) => {
        const proxy = await tenant();

        const { code, stdout } = await pull(proxy, [
          '--path',
          WEBHOOK_PATH,
          '--stdout',
          ...version,
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(stdout)._pushApiVersion).toEqual({
          protocol: '2.1',
          resource: '1.0',
        });
      },
      TIMEOUT
    );

    it(
      'beats the version that the config file gives the item of the path',
      async () => {
        const proxy = await tenant();
        writeRawFile();

        const { code, stdout } = await pull(proxy, [
          '--config-file',
          'raw.json',
          '--path',
          WEBHOOK_PATH,
          '-V.protocol',
          '2.1',
          '-V.resource',
          '1.5',
          '--stdout',
        ]);

        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toEqual({
          ...PULLED_WEBHOOK,
          _pushApiVersion: { protocol: '2.1', resource: '1.5' },
        });
      },
      TIMEOUT
    );

    it.each([
      [
        'only the protocol',
        ['-V.protocol', '2.1'],
        'requires resource and protocol',
      ],
      [
        'only the resource',
        ['-V.resource', '1.0'],
        'requires resource and protocol',
      ],
      [
        'a property that is neither',
        ['-V.protocol', '2.1', '-V.resource', '1.0', '-V.extra', '7'],
        "protocol and resource only, not 'extra'",
      ],
      [
        'a blank version',
        ['-V.protocol', ' ', '-V.resource', '1.0'],
        'The protocol of --push-api-version must be a version',
      ],
      [
        'a version given twice',
        ['-V.protocol', '2.1', '-V.protocol', '2.2', '-V.resource', '1.0'],
        'The protocol of --push-api-version must be a version',
      ],
      [
        'a nested property',
        ['-V.protocol.x', '2.1', '-V.resource', '1.0'],
        'The protocol of --push-api-version must be a version',
      ],
    ])(
      'refuses %s before it logs in: exit 1, one message, no request',
      async (_, args, message) => {
        const proxy = await tenant();

        const { code, stdout, stderr } = await pull(proxy, [
          '--path',
          WEBHOOK_PATH,
          '--stdout',
          ...args,
        ]);

        expect(code).toBe(1);
        expect(stdout).toBe('');
        expect(stderr).toContain(message);
        expect(proxy.requests()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('a pull of a config file without the new options', () => {
    it(
      'writes what it always wrote: the library merges the overrides, nothing is escaped, a version is noted for /am only',
      async () => {
        const proxy = await tenant();
        writeRawFile([
          { path: '/openidm/config/placeholder' },
          LISTED_WEBHOOK,
          {
            path: '/environment/release',
            pushApiVersion: { protocol: '2.0', resource: '1.0' },
          },
          {
            path: '/openidm/config/ok1',
            pushApiVersion: { protocol: '2.0', resource: '1.0' },
          },
        ]);

        const { code, stdout } = await pull(proxy, [
          '--config-file',
          'raw.json',
          '-D',
          'out',
        ]);

        expect(code).toBe(0);
        expect(stdout).toBe('');
        expect(filesBelow(path.join(work, 'out'))).toEqual([
          `raw${WEBHOOK_PATH}.json`,
          'raw/environment/release.json',
          'raw/openidm/config/ok1.json',
          'raw/openidm/config/placeholder.json',
        ]);
        // a placeholder of the tenant data is not escaped
        const placeholder = fs.readFileSync(
          path.join(work, 'out/raw/openidm/config/placeholder.json'),
          'utf8'
        );
        expect(placeholder).toContain('"${ESV_X}"');
        expect(placeholder).toContain('"a-${B}"');
        expect(placeholder).not.toContain('\\$');
        // a list of the override is merged by index by the library: [9] over [1, 2, 3]
        expect(readJson(`out/raw${WEBHOOK_PATH}.json`)).toEqual(PULLED_WEBHOOK);
        // the library notes the version for /am only
        expect(readJson('out/raw/environment/release.json')).toEqual(RELEASE);
        expect(readJson('out/raw/openidm/config/ok1.json')).toEqual(OK1);
      },
      TIMEOUT
    );
  });

  describe('push raw sends the API version of the file', () => {
    const VERSIONED = { protocol: '2.1', resource: '1.0' };
    const writeFileOf = (rawPath, content) => {
      const file = path.join(work, 'raw', `${rawPath}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(content));
    };

    it(
      'sets Accept-API-Version from _pushApiVersion on /am and /environment, and does not send it as data',
      async () => {
        const proxy = await tenant();
        writeFileOf(WEBHOOK_PATH, { ...WEBHOOK, _pushApiVersion: VERSIONED });
        writeFileOf('/environment/release', {
          ...RELEASE,
          _pushApiVersion: { protocol: '2.2', resource: '1.1' },
        });
        writeFileOf('/openidm/config/ok1', {
          ...OK1,
          _pushApiVersion: VERSIONED,
        });

        const { code } = await push(proxy, []);

        expect(code).toBe(0);
        const [webhook] = putsTo(proxy, WEBHOOK_PATH);
        expect(webhook.acceptApiVersion).toBe('protocol=2.1,resource=1.0');
        expect(JSON.parse(webhook.body)).toEqual({
          url: WEBHOOK.url,
          headers: WEBHOOK.headers,
          list: WEBHOOK.list,
        });
        const [release] = putsTo(proxy, '/environment/release');
        expect(release.acceptApiVersion).toBe('protocol=2.2,resource=1.1');
        expect(JSON.parse(release.body)).toEqual(RELEASE);
        // IDM takes no version, and the attribute is not data for it either
        const [ok1] = putsTo(proxy, '/openidm/config/ok1');
        expect(JSON.parse(ok1.body)).toEqual({ v: 1 });
      },
      TIMEOUT
    );

    it(
      'sets it from standard input too',
      async () => {
        const proxy = await tenant();

        const { code } = await push(
          proxy,
          ['--path', WEBHOOK_PATH, '--stdin'],
          {
            stdin: JSON.stringify({ ...WEBHOOK, _pushApiVersion: VERSIONED }),
          }
        );

        expect(code).toBe(0);
        const [webhook] = putsTo(proxy, WEBHOOK_PATH);
        expect(webhook.acceptApiVersion).toBe('protocol=2.1,resource=1.0');
        expect(JSON.parse(webhook.body)._pushApiVersion).toBeUndefined();
      },
      TIMEOUT
    );

    it(
      'uses the default version for a file that has none',
      async () => {
        const proxy = await tenant();
        writeFileOf(WEBHOOK_PATH, WEBHOOK);

        const { code } = await push(proxy, []);

        expect(code).toBe(0);
        expect(putsTo(proxy, WEBHOOK_PATH)[0].acceptApiVersion).toBe(
          DEFAULT_VERSION
        );
      },
      TIMEOUT
    );

    it.each([
      ['a version without a resource', { protocol: '2.1' }],
      ['a text', 'x'],
      ['null', null],
    ])(
      'drops %s without a word and sends the default version, as every push did before the version was kept',
      async (_, version) => {
        const proxy = await tenant();
        writeFileOf(WEBHOOK_PATH, { ...WEBHOOK, _pushApiVersion: version });

        const fromFile = await push(proxy, []);
        const fromStdin = await push(
          proxy,
          ['--path', WEBHOOK_PATH, '--stdin'],
          { stdin: JSON.stringify({ ...WEBHOOK, _pushApiVersion: version }) }
        );

        expect([fromFile.code, fromStdin.code]).toEqual([0, 0]);
        expect(fromFile.stderr + fromStdin.stderr).not.toMatch(
          /pushApiVersion|undefined/i
        );
        const puts = putsTo(proxy, WEBHOOK_PATH);
        expect(puts.map((put) => put.acceptApiVersion)).toEqual([
          DEFAULT_VERSION,
          DEFAULT_VERSION,
        ]);
        for (const put of puts) {
          expect(JSON.parse(put.body)._pushApiVersion).toBeUndefined();
        }
      },
      TIMEOUT
    );

    it(
      'carries the version from a pull of a path to the push of its file',
      async () => {
        const proxy = await tenant();

        const pulled = await pull(proxy, [
          '--path',
          WEBHOOK_PATH,
          '-V.protocol',
          '2.1',
          '-V.resource',
          '1.0',
          '-D',
          'out',
        ]);
        const pushed = await run([
          'config-manager',
          'push',
          'raw',
          '-D',
          'out',
          ...hostOf(proxy),
        ]);

        expect([pulled.code, pushed.code]).toEqual([0, 0]);
        expect(putsTo(proxy, WEBHOOK_PATH)[0].acceptApiVersion).toBe(
          'protocol=2.1,resource=1.0'
        );
      },
      TIMEOUT
    );
  });
});
