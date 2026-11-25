import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { readRequests } from '../utils/FakeAmLog.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `config-manager delete cors`, the REAL CLI of this checkout against a fake
 * tenant (test/utils/FakeAm.mjs, in a separate process, with the named CORS
 * configurations of the global CORS service and the IDM CORS filter as stores
 * that a delete or a write changes) and the real library. What the unit tests
 * stub, this shows in the log of the requests the tenant received, and in what
 * the tenant holds afterwards:
 *
 * - a delete of all sends exactly the deletes of the named configurations and
 *   nothing else; a named delete is looked up in what the service lists, and the
 *   typed text (another case, a path, a fragment) never reaches a request;
 * - a listed id that is not a plain name is never deleted;
 * - one configuration that fails does not stop the others: the summary names it,
 *   the exit is 1, and `--allow-failures` keeps it at 0 for a failed delete only;
 * - a dry run sends nothing but reads, and without a terminal and without -y the
 *   delete is refused before the login: no request at all;
 * - `--deep` also resets the IDM CORS filter on Cloud and ForgeOps, writing the
 *   defaults over `initParams` and `urlPatterns` only when they differ, keeping
 *   every other key, never deleting the filter; Classic skips it; and no request
 *   of any run deletes or writes the CORS service entry (AM refuses to delete it,
 *   as the fake tenant does) or deletes the IDM filter;
 * - on a terminal the question follows a plan and a no deletes nothing.
 *
 * No tenant, no secrets, no recordings; a temporary HOME and working directory
 * keep it away from real profiles and files. Skipped on Windows: the CLI binary
 * shim is a shell script. What the operation does with each answer of the
 * library is in FrConfigCorsDelete.test.js, the command line in
 * ConfigManagerDeleteCorsCommand.test.js.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const ptySuite = hasPty ? describe : describe.skip;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

/** A named CORS configuration as the service lists it. */
const configuration = (id) => ({
  _id: id,
  _type: { _id: 'configuration', name: 'Cors Configuration', collection: true },
});

/** The tenant's AM side: the global CORS service, a singleton that AM does not delete, with its named configurations. */
const SERVICE = (ids = ['cors', 'test', 'custom']) => ({
  realms: {},
  global: [
    {
      _id: 'CorsService',
      singleton: true,
      nextDescendents: ids.map(configuration),
    },
  ],
});

/** The defaults of the IDM CORS filter, as the fixtures of a tenant hold them. */
const DEFAULT_INIT_PARAMS = {
  allowCredentials: false,
  allowedHeaders:
    'authorization,accept,content-type,origin,x-requested-with,cache-control,accept-api-version,if-match,if-none-match',
  allowedMethods: 'GET,POST,PUT,DELETE,PATCH',
  allowedOrigins: '*',
  chainPreflight: false,
  exposedHeaders: 'WWW-Authenticate',
};
const FILTER_CLASS = 'org.eclipse.jetty.ee10.servlets.CrossOriginFilter';

/** An IDM CORS filter that differs from the defaults in two parameters and in its url patterns, and has a filter class and a key of its own. */
const CHANGED_FILTER = () => ({
  _id: 'servletfilter/cors',
  filterClass: FILTER_CLASS,
  note: 'kept',
  initParams: {
    ...DEFAULT_INIT_PARAMS,
    allowedOrigins: 'https://app.example.com',
    allowCredentials: true,
  },
  urlPatterns: ['/openidm/*'],
});
/** An IDM CORS filter that is at the defaults. */
const DEFAULT_FILTER = (extra = {}) => ({
  _id: 'servletfilter/cors',
  initParams: { ...DEFAULT_INIT_PARAMS },
  urlPatterns: ['/*'],
  ...extra,
});

suite('config-manager delete cors (fake tenant)', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cors-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cors-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a tenant with the service, the IDM filter and whatever else the test gives; it keeps its state until the test ends. */
  async function startTenant({
    service = SERVICE(),
    filter = DEFAULT_FILTER(),
    mode = 'forgeops',
    ...options
  } = {}) {
    fakeAm?.stop();
    fs.rmSync(record, { force: true });
    fakeAm = await startFakeAm({
      recordPath: record,
      // a Cloud tenant logs in with a service account, ForgeOps needs the OAuth2 answers, Classic has no IDM
      journey: mode === 'cloud' ? 'service-account' : 'password',
      logApiKeys: mode === 'forgeops' ? [] : undefined,
      realms: ['alpha', 'bravo'],
      realmServices: service,
      ...(filter ? { idmEntities: { 'servletfilter/cors': filter } } : {}),
      ...options,
    });
  }

  /** Runs `frodo config-manager delete cors <args>` once against the running tenant, without a terminal. */
  function runCli(args, { mode = 'forgeops' } = {}) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          'config-manager',
          'delete',
          'cors',
          ...args,
          `http://127.0.0.1:${fakeAm.port}/am`,
          '-m',
          mode,
        ],
        {
          cwd: work,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_REALM: '',
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            FRODO_NO_PROMPT: '1',
            FRODO_NO_UPDATE_CHECK: '1',
            FRODO_USERNAME: 'admin',
            FRODO_PASSWORD: 'secret',
            FRODO_SA_ID: 'test-account',
            FRODO_SA_JWK: serviceAccountJwk,
            NODE_OPTIONS: '',
            NO_COLOR: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
    });
  }

  const requests = () => readRequests(record);
  const line = ({ method, url }) => `${method} ${url.replace(/^\/am/, '')}`;
  /** Every request for the CORS service, as `METHOD path` without the `/am` of the host and without the query. */
  const serviceRequests = () =>
    requests()
      .filter(({ url }) => url.includes('/CorsService'))
      .map(line)
      .map((request) => request.replace(/\?.*$/, ''));
  /** What the tenant was asked to delete, as `DELETE path`. */
  const deletes = () =>
    serviceRequests().filter((request) => request.startsWith('DELETE'));
  /** Every request for the IDM CORS filter, with its body. */
  const filterRequests = () =>
    requests().filter(({ url }) =>
      url.includes('/openidm/config/servletfilter')
    );
  /** What the tenant was asked to change: every request that is not a read, a login or a session lookup. */
  const changes = () =>
    requests().filter(
      ({ method, url }) =>
        !['GET', 'HEAD'].includes(method) &&
        !url.includes('/authenticate') &&
        !url.includes('/sessions') &&
        !url.includes('/access_token') &&
        !url.includes('/oauth2/') &&
        !(method === 'POST' && url.includes('_action=nextdescendents'))
    );
  /** What the tenant holds for the IDM CORS filter now, read straight from the fake. */
  async function heldFilter() {
    const response = await fetch(
      `http://127.0.0.1:${fakeAm.port}/openidm/config/servletfilter/cors`
    );
    return response.status === 200 ? response.json() : undefined;
  }
  /** Asks the tenant what configurations are left, with a dry run of a delete of all. */
  async function leftOver(mode) {
    fs.rmSync(record, { force: true });
    const { output } = await runCli(['-d'], { mode });
    return [
      ...output.matchAll(/Dry run: Deleting CORS configuration: (.*)/g),
    ].map((match) => match[1]);
  }
  /** The request that the library makes for the entry itself must never be a delete, a write or a post: only reads and the list of the descendents. */
  const entryTouched = () =>
    requests().filter(
      ({ method, url }) =>
        /\/global-config\/services\/CorsService\/?(\?.*)?$/.test(url) &&
        !(
          method === 'GET' ||
          (method === 'POST' && url.includes('_action=nextdescendents'))
        )
    );

  describe('a delete of all', () => {
    test(
      'sends exactly the deletes of the named configurations, and nothing else: not the service entry, not the IDM filter',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-y']);

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/global-config/services/CorsService/configuration/cors',
          'DELETE /json/global-config/services/CorsService/configuration/test',
          'DELETE /json/global-config/services/CorsService/configuration/custom',
        ]);
        expect(output).toContain('Deleted CORS configuration: cors');
        expect(output).toContain('Deleted CORS configuration: test');
        expect(output).toContain('Deleted CORS configuration: custom');
        expect(output).not.toContain('failed');
        expect(entryTouched()).toEqual([]);
        expect(filterRequests()).toEqual([]);
        expect(changes().map(line)).toEqual(deletes());
        // the store afterwards: a dry run finds nothing to delete
        expect(await leftOver('forgeops')).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'nothing listed is a warning and exits 0',
      async () => {
        await startTenant({ service: SERVICE([]) });

        const { code, output } = await runCli(['-y']);

        expect(code).toBe(0);
        expect(output).toContain('No CORS configurations found to delete.');
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a dry run sends nothing but reads, and lists every configuration',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-d']);

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        expect(output).toContain('Dry run: Deleting CORS configuration: cors');
        expect(output).toContain('Dry run: Deleting CORS configuration: test');
        expect(output).toContain(
          'Dry run: Deleting CORS configuration: custom'
        );
        expect(filterRequests()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'without a terminal and without -y it is refused before the login: no request reaches the tenant',
      async () => {
        await startTenant();

        const { code, output } = await runCli([]);

        expect(code).toBe(1);
        expect(output).toContain(
          'Refusing to delete all CORS configurations without confirmation'
        );
        expect(output).toContain('-y/--yes');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    test.each([
      ['Cloud', 'cloud'],
      ['ForgeOps', 'forgeops'],
      ['Classic', 'classic'],
    ])(
      'on %s all three are deleted, with the same requests',
      async (_name, mode) => {
        await startTenant({ mode });

        const { code } = await runCli(['-y'], { mode });

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/global-config/services/CorsService/configuration/cors',
          'DELETE /json/global-config/services/CorsService/configuration/test',
          'DELETE /json/global-config/services/CorsService/configuration/custom',
        ]);
        expect(entryTouched()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'one configuration that fails does not stop the others: the summary names it, the exit is 1, and --allow-failures keeps the exit at 0',
      async () => {
        const failRequests = [
          { method: 'DELETE', path: '/CorsService/configuration/test' },
        ];
        await startTenant({ failRequests });

        const failed = await runCli(['-y']);

        expect(failed.code).toBe(1);
        // the others were deleted, and the failed one was tried
        expect(deletes()).toEqual([
          'DELETE /json/global-config/services/CorsService/configuration/cors',
          'DELETE /json/global-config/services/CorsService/configuration/test',
          'DELETE /json/global-config/services/CorsService/configuration/custom',
        ]);
        expect(failed.output).toContain('1 of 3 CORS operations failed:');
        expect(failed.output).toContain(
          '- CORS configuration test: fake tenant operation failed'
        );
        expect(failed.output).toContain('Deleted CORS configuration: custom');
        // the failed one is still there
        fs.rmSync(record, { force: true });
        expect(await leftOver('forgeops')).toEqual(['test']);

        await startTenant({ failRequests });
        const allowed = await runCli(['-y', '--allow-failures']);
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain('1 of 3 CORS operations failed:');
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
      },
      TIMEOUT
    );

    test.each([[[]], [['--allow-failures']]])(
      'a list that cannot be read fails the command whatever %j says, and deletes nothing',
      async (extra) => {
        await startTenant({
          failRequests: [
            { method: 'POST', path: '/global-config/services/CorsService' },
          ],
        });

        const { code, output } = await runCli(['-y', ...extra]);

        expect(code).toBe(1);
        expect(output).toContain('Error reading the CORS configurations');
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a listed id that is not a plain name is never deleted: the others are, the exit is 1, and the summary names each; no request carries any of them',
      async () => {
        await startTenant({
          service: SERVICE(['cors', '../realms/root', 'a#b', 'x/y', 'custom']),
        });

        const { code, output } = await runCli(['-y']);

        expect(code).toBe(1);
        expect(deletes()).toEqual([
          'DELETE /json/global-config/services/CorsService/configuration/cors',
          'DELETE /json/global-config/services/CorsService/configuration/custom',
        ]);
        expect(output).toContain('3 of 5 CORS operations failed:');
        for (const hostile of ['../realms/root', 'a#b', 'x/y']) {
          expect(output).toContain(`- CORS configuration ${hostile}:`);
        }
        const sent = requests()
          .filter(({ url }) => url.includes('/CorsService'))
          .map(({ url }) => decodeURIComponent(url));
        expect(sent.some((url) => url.includes('realms/root'))).toBe(false);
        expect(sent.some((url) => url.includes('a#b'))).toBe(false);
        expect(sent.some((url) => url.includes('x/y'))).toBe(false);
        expect(entryTouched()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('a named delete', () => {
    test.each([['-i'], ['--cors-id'], ['-n'], ['--name']])(
      '%s deletes the one configuration that the service lists, with one DELETE, and asks nothing',
      async (flag) => {
        await startTenant();

        const { code, output } = await runCli([flag, 'test']);

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/global-config/services/CorsService/configuration/test',
        ]);
        expect(output).toContain('Deleted CORS configuration: test');
        expect(entryTouched()).toEqual([]);
        expect(filterRequests()).toEqual([]);
        expect(await leftOver('forgeops')).toEqual(['cors', 'custom']);
      },
      TIMEOUT
    );

    test.each([
      ['NOPE', false],
      ['TEST', false],
      ['Test', false],
      [' test', false],
      ['test ', false],
      ['te', false],
      ['../realms/root', true],
      ['a/b', true],
      ['a#b', true],
    ])(
      'the typed text %j is not a listed id: nothing is deleted, the exit is 1, also with -d and --allow-failures, and a path never reaches a request',
      async (typed, path) => {
        for (const extra of [
          [],
          ['-d'],
          ['--allow-failures'],
          ['-d', '--allow-failures'],
        ]) {
          await startTenant();

          const { code, output } = await runCli(['-i', typed, ...extra]);

          expect(code).toBe(1);
          expect(output).toContain('not found.');
          expect(deletes()).toEqual([]);
          if (path) {
            expect(
              requests().filter(({ url }) =>
                decodeURIComponent(url).includes(typed)
              )
            ).toEqual([]);
          }
        }
      },
      TIMEOUT
    );

    test(
      'a listed id that is not a plain name is not deleted even when it is typed exactly: exit 1, no request for it',
      async () => {
        await startTenant({ service: SERVICE(['cors', 'a#b']) });

        const { code, output } = await runCli(['-i', 'a#b']);

        expect(code).toBe(1);
        expect(output).toContain('is not a plain name');
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a dry run sends only reads and says what it would delete',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-i', 'test', '-d']);

        expect(code).toBe(0);
        expect(output).toContain('Dry run: Deleting CORS configuration: test');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a delete that fails exits 1, also with --allow-failures: it is the one operation',
      async () => {
        await startTenant({
          failRequests: [
            { method: 'DELETE', path: '/CorsService/configuration/test' },
          ],
        });

        const { code, output } = await runCli(['-i', 'test']);

        expect(code).toBe(1);
        expect(output).toContain('1 of 1 CORS operation failed:');
        expect(output).toContain(
          '- CORS configuration test: fake tenant operation failed'
        );
      },
      TIMEOUT
    );

    test.each([
      [['-i', '']],
      [['-n', '']],
      [['--name=']],
      [['-i', '  ', '-y']],
    ])(
      '%j never means all: refused, nothing is requested',
      async (args) => {
        await startTenant();

        const { code } = await runCli(args);

        expect(code).toBe(1);
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('--deep', () => {
    test.each([
      ['-i', 'test'],
      ['-n', 'test'],
      ['--name', 'test'],
    ])(
      '%s with --deep is refused while the command line is parsed: nothing is requested',
      async (...args) => {
        await startTenant({ filter: CHANGED_FILTER() });

        const { code, output } = await runCli([...args, '--deep', '-y']);

        expect(code).toBe(1);
        expect(output).toContain(
          "error: option '--deep' cannot be used with option '-i, --cors-id <id>'"
        );
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'without a terminal and without -y it is refused before the login, and the refusal says that the filter is reset',
      async () => {
        await startTenant({ filter: CHANGED_FILTER() });

        const { code, output } = await runCli(['--deep']);

        expect(code).toBe(1);
        expect(output).toContain(
          'Refusing to delete all CORS configurations and reset the IDM CORS filter to its default values without confirmation'
        );
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    test.each([
      ['Cloud', 'cloud'],
      ['ForgeOps', 'forgeops'],
    ])(
      'on %s deletes the configurations, then writes the defaults over initParams and urlPatterns of the IDM filter and keeps every other key; the filter is read first, written once, never deleted, and the service entry is never touched',
      async (_name, mode) => {
        await startTenant({ mode, filter: CHANGED_FILTER() });

        const { code, output } = await runCli(['--deep', '-y'], { mode });

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/global-config/services/CorsService/configuration/cors',
          'DELETE /json/global-config/services/CorsService/configuration/test',
          'DELETE /json/global-config/services/CorsService/configuration/custom',
        ]);
        expect(filterRequests().map(line)).toEqual([
          'GET /openidm/config/servletfilter/cors',
          'PUT /openidm/config/servletfilter/cors',
        ]);
        expect(JSON.parse(filterRequests()[1].body)).toEqual({
          _id: 'servletfilter/cors',
          filterClass: FILTER_CLASS,
          note: 'kept',
          initParams: DEFAULT_INIT_PARAMS,
          urlPatterns: ['/*'],
        });
        expect(await heldFilter()).toEqual({
          _id: 'servletfilter/cors',
          filterClass: FILTER_CLASS,
          note: 'kept',
          initParams: DEFAULT_INIT_PARAMS,
          urlPatterns: ['/*'],
        });
        // nothing deletes the entry or the filter, and nothing writes the entry
        expect(
          requests().filter(
            ({ method, url }) =>
              method === 'DELETE' && !url.includes('/configuration/')
          )
        ).toEqual([]);
        expect(entryTouched()).toEqual([]);
        expect(output).toContain(
          'Reset IDM CORS filter: initParams and urlPatterns are at the default values.'
        );
        expect(output).toContain('IDM CORS filter: reset.');
        expect(output).toContain('CORS service entry: not changed.');
      },
      TIMEOUT
    );

    test(
      'a tenant whose filter has no filter class gets none',
      async () => {
        await startTenant({
          filter: { ...CHANGED_FILTER(), filterClass: undefined },
        });

        const { code } = await runCli(['--deep', '-y']);

        expect(code).toBe(0);
        expect(await heldFilter()).not.toHaveProperty('filterClass');
        expect(await heldFilter()).toHaveProperty('note', 'kept');
      },
      TIMEOUT
    );

    test(
      'a filter that is at the defaults is not written: no PUT, and the run says so',
      async () => {
        await startTenant({
          filter: DEFAULT_FILTER({ filterClass: FILTER_CLASS }),
        });

        const { code, output } = await runCli(['--deep', '-y']);

        expect(code).toBe(0);
        expect(filterRequests().map(line)).toEqual([
          'GET /openidm/config/servletfilter/cors',
        ]);
        expect(output).toContain(
          'IDM CORS filter: already at the default values, nothing to write'
        );
        expect(output).toContain(
          'IDM CORS filter: already at the default values.'
        );
        expect(deletes()).toHaveLength(3);
      },
      TIMEOUT
    );

    test(
      'a dry run sends only reads, names the keys that would change and never their values, and keeps the filter class out of the change',
      async () => {
        await startTenant({ filter: CHANGED_FILTER() });

        const { code, output } = await runCli(['--deep', '-d']);

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        expect(filterRequests().map(line)).toEqual([
          'GET /openidm/config/servletfilter/cors',
        ]);
        expect(output).toContain('Dry run: Deleting CORS configuration: cors');
        expect(output).toContain(
          'Dry run: Resetting IDM CORS filter: initParams (allowCredentials, allowedOrigins) and urlPatterns would be set to the default values, the filter class is kept'
        );
        expect(output).not.toContain('app.example.com');
        expect(output).not.toContain('/openidm/*');
        expect(output).not.toContain('CORS service entry');
      },
      TIMEOUT
    );

    test(
      'a Classic deployment has no IDM: the filter is skipped with its message, nothing is requested from IDM, and that is no failure',
      async () => {
        await startTenant({ mode: 'classic', filter: null });

        const { code, output } = await runCli(['--deep', '-y'], {
          mode: 'classic',
        });

        expect(code).toBe(0);
        expect(deletes()).toHaveLength(3);
        expect(
          requests().filter(({ url }) => url.includes('/openidm/config'))
        ).toEqual([]);
        expect(output).toContain(
          'IDM CORS filter: not applicable on a classic deployment, skipped'
        );
        expect(output).toContain(
          'IDM CORS filter: skipped (classic deployment).'
        );
        expect(output).not.toContain('failed');
      },
      TIMEOUT
    );

    test(
      'a tenant that has no such filter is a warning, not a failure',
      async () => {
        await startTenant({ filter: null, idmEntities: {} });

        const { code, output } = await runCli(['--deep', '-y']);

        expect(code).toBe(0);
        expect(output).toContain(
          'IDM CORS filter: not found, nothing to reset'
        );
        expect(filterRequests().map(line)).toEqual([
          'GET /openidm/config/servletfilter/cors',
        ]);
      },
      TIMEOUT
    );

    test(
      'a filter that cannot be written is one failed operation: the configurations were deleted, the summary names it, the closing lines say it was not reset, the exit is 1, and --allow-failures keeps it at 0',
      async () => {
        const failRequests = [
          { method: 'PUT', path: '/openidm/config/servletfilter/cors' },
        ];
        await startTenant({ filter: CHANGED_FILTER(), failRequests });

        const failed = await runCli(['--deep', '-y']);

        expect(failed.code).toBe(1);
        expect(deletes()).toHaveLength(3);
        expect(failed.output).toContain('Error resetting the IDM CORS filter');
        expect(failed.output).toContain('1 of 4 CORS operations failed:');
        expect(failed.output).toContain(
          '- IDM CORS filter: fake tenant operation failed'
        );
        expect(failed.output).toContain(
          'IDM CORS filter: not reset (failed, see above).'
        );
        expect((await heldFilter()).initParams.allowCredentials).toBe(true);

        await startTenant({ filter: CHANGED_FILTER(), failRequests });
        const allowed = await runCli(['--deep', '-y', '--allow-failures']);
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
      },
      TIMEOUT
    );

    test(
      'a filter that cannot be read is one failed operation named IDM CORS filter, and the configurations are deleted anyway',
      async () => {
        await startTenant({
          filter: CHANGED_FILTER(),
          failRequests: [
            { method: 'GET', path: '/openidm/config/servletfilter/cors' },
          ],
        });

        const { code, output } = await runCli(['--deep', '-y']);

        expect(code).toBe(1);
        expect(deletes()).toHaveLength(3);
        expect(output).toContain('Error reading the IDM CORS filter');
        expect(output).toContain(
          '- IDM CORS filter: fake tenant operation failed'
        );
        expect(filterRequests().map(line)).toEqual([
          'GET /openidm/config/servletfilter/cors',
        ]);
      },
      TIMEOUT
    );

    test(
      'a dry run with a filter that cannot be read says so, still lists the configurations, and exits 1',
      async () => {
        await startTenant({
          filter: CHANGED_FILTER(),
          failRequests: [
            { method: 'GET', path: '/openidm/config/servletfilter/cors' },
          ],
        });

        const { code, output } = await runCli(['--deep', '-d']);

        expect(code).toBe(1);
        expect(output).toContain(
          'IDM CORS filter: cannot be read, so it is not known what would be reset'
        );
        expect(output).toContain('Dry run: Deleting CORS configuration: cors');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'the filter is reset when the list of configurations cannot be read, and the exit is 1 whatever --allow-failures says',
      async () => {
        await startTenant({
          filter: CHANGED_FILTER(),
          failRequests: [
            { method: 'POST', path: '/global-config/services/CorsService' },
          ],
        });

        const { code } = await runCli(['--deep', '-y', '--allow-failures']);

        expect(code).toBe(1);
        expect(deletes()).toEqual([]);
        expect((await heldFilter()).urlPatterns).toEqual(['/*']);
      },
      TIMEOUT
    );

    test(
      'one configuration that fails and a filter that is reset: both are told apart in the summary and the closing lines',
      async () => {
        await startTenant({
          filter: CHANGED_FILTER(),
          failRequests: [
            { method: 'DELETE', path: '/CorsService/configuration/cors' },
          ],
        });

        const { code, output } = await runCli(['--deep', '-y']);

        expect(code).toBe(1);
        expect(output).toContain('1 of 4 CORS operations failed:');
        expect(output).toContain(
          '- CORS configuration cors: fake tenant operation failed'
        );
        expect(output).toContain('IDM CORS filter: reset.');
        expect(await heldFilter()).toMatchObject({ urlPatterns: ['/*'] });
      },
      TIMEOUT
    );
  });
});

ptySuite('config-manager delete cors, on a real terminal', () => {
  let home;
  let fakeAm;
  let recordPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      journey: 'service-account',
      recordPath,
      realms: ['alpha', 'bravo'],
      realmServices: SERVICE(['cors', 'test']),
      idmEntities: { 'servletfilter/cors': CHANGED_FILTER() },
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  /** Runs the command on a terminal with the given answers and says what happened. */
  function onTerminal(actions, extra = []) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { FRODO_SA_ID: 'test-account', FRODO_SA_JWK: serviceAccountJwk },
      args: [
        'config-manager',
        'delete',
        'cors',
        ...extra,
        `http://127.0.0.1:${fakeAm.port}/am`,
        '--type',
        'cloud',
      ],
      actions,
    });
  }

  const QUESTION = {
    type: 'wait_plain',
    regex: 'Continue\\? \\(y/N\\)',
    timeoutMs: 60000,
  };
  // the question of --deep is longer than a line of the terminal and wraps inside the brackets
  const QUESTION_DEEP = { ...QUESTION, regex: 'Continue\\? \\(\\s*y/N\\)' };
  const ENDED = { type: 'wait_exit', timeoutMs: 60000 };
  const changesSent = () =>
    readRequests(recordPath).filter(
      ({ method, url }) =>
        ['DELETE', 'PUT'].includes(method) &&
        !url.includes('/sessions') &&
        !url.includes('/oauth2/')
    );

  test(
    'the question follows a plan that names the configurations, and a no deletes nothing',
    () => {
      const result = onTerminal([
        QUESTION,
        { type: 'send_line', text: 'n' },
        ENDED,
      ]);

      const plain = result.plainOutput;
      expect(plain).toContain('Plan: Deleting CORS configuration: cors');
      expect(plain).toContain('Plan: Deleting CORS configuration: test');
      expect(
        plain.indexOf('Plan: Deleting CORS configuration: cors')
      ).toBeLessThan(
        plain.indexOf('This permanently deletes all CORS configurations from')
      );
      expect(plain).toContain(
        `This permanently deletes all CORS configurations from http://127.0.0.1:${fakeAm.port}/am.`
      );
      expect(plain).not.toContain('(realm');
      expect(plain).toContain('Delete aborted.');
      expect(changesSent()).toEqual([]);
      expect(result.exitCode).toBe(1);
    },
    TIMEOUT
  );

  test(
    'a bare Enter is a no: the default answer is no',
    () => {
      const result = onTerminal([
        QUESTION,
        { type: 'key', name: 'enter' },
        ENDED,
      ]);

      expect(changesSent()).toEqual([]);
      expect(result.exitCode).toBe(1);
    },
    TIMEOUT
  );

  test(
    'a yes deletes every named configuration, and nothing else',
    () => {
      const result = onTerminal([
        QUESTION,
        { type: 'send_line', text: 'y' },
        ENDED,
      ]);

      expect(
        changesSent().map(
          ({ method, url }) => `${method} ${url.replace(/^\/am/, '')}`
        )
      ).toEqual([
        'DELETE /json/global-config/services/CorsService/configuration/cors',
        'DELETE /json/global-config/services/CorsService/configuration/test',
      ]);
      expect(result.plainOutput).toContain('Deleted CORS configuration: test');
      expect(result.exitCode).toBe(0);
    },
    TIMEOUT
  );

  test(
    'with --deep the plan names the configurations and the keys of the filter that would change, the question says that the filter is reset, and a no changes nothing',
    () => {
      const result = onTerminal(
        [QUESTION_DEEP, { type: 'send_line', text: 'n' }, ENDED],
        ['--deep']
      );

      const plain = result.plainOutput;
      expect(plain).toContain('Plan: Deleting CORS configuration: cors');
      expect(plain).toContain(
        'Plan: Resetting IDM CORS filter: initParams (allowCredentials, allowedOrigins) and urlPatterns would be set to the default values, the filter class is kept'
      );
      // the question is about the tenant, never about the realm of the login, and says what --deep resets
      expect(plain).toContain(
        `This permanently deletes all CORS configurations from http://127.0.0.1:${fakeAm.port}/am and resets the IDM CORS filter to its default values.`
      );
      expect(plain).not.toContain('(realm');
      expect(plain).toContain('Delete aborted.');
      expect(changesSent()).toEqual([]);
      expect(result.exitCode).toBe(1);
    },
    TIMEOUT
  );

  test(
    'with --deep a yes deletes the configurations and resets the filter once',
    () => {
      const result = onTerminal(
        [QUESTION_DEEP, { type: 'send_line', text: 'y' }, ENDED],
        ['--deep']
      );

      expect(
        changesSent().map(
          ({ method, url }) => `${method} ${url.replace(/^\/am/, '')}`
        )
      ).toEqual([
        'DELETE /json/global-config/services/CorsService/configuration/cors',
        'DELETE /json/global-config/services/CorsService/configuration/test',
        'PUT /openidm/config/servletfilter/cors',
      ]);
      expect(result.plainOutput).toContain('IDM CORS filter: reset.');
      expect(result.exitCode).toBe(0);
    },
    TIMEOUT
  );
});
