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
 * `config-manager delete connector-mappings`, the REAL CLI of this checkout
 * against a fake tenant (test/utils/FakeAm.mjs, in a separate process, with the
 * IDM store of its configuration objects and the application records of two
 * realms) and the real library. What the unit tests stub, this shows in the log
 * of the requests the tenant received, and in what the tenant holds afterwards:
 *
 * - a mapping is looked up in the list of the sync configuration, and the
 *   mapping that the list holds is what is deleted: a selector that is a path, a
 *   prefixed id or only almost a name sends nothing but reads and deletes
 *   nothing, and an empty name deletes nothing at all (it never means all);
 * - a delete that the tenant refuses leaves its mapping where it was: the
 *   mapping is still in the sync configuration afterwards, and the run goes on
 *   with the others (the summary names the one that failed);
 * - a mapping that a schedule, another mapping (`links`, `syncAfter`, in either
 *   store) or an application still names is not deleted, also with
 *   `--allow-failures`; with `--force` it is, with one write, and every holder
 *   is as it was afterwards;
 * - a source that cannot be read stops the delete, and `--force` goes on;
 * - a delete of all mappings: without a terminal and without `-y` it sends no
 *   request at all; a dry run, and nothing else, looks up what names them, in
 *   the same reads however many there are; `-y` sends no lookup;
 * - an empty name, a `--force` that has no `-i`, and classic deployments are
 *   refused before anything is sent;
 * - the usage examples of the command run as written.
 *
 * No tenant, no secrets, no recordings, no terminal; a temporary HOME and working
 * directory keep it away from real profiles and files. Skipped on Windows: the
 * CLI binary shim is a shell script. What the operation does with each answer of
 * the library is in FrConfigConnectorMappingsDelete.test.js, the command line
 * in ConfigManagerDeleteConnectorMappingsCommand.test.js.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

/** The sample mapping of the usage examples: they run against it as written. */
const SAMPLE = 'managedAlpha_user_systemZionDirectory';

const mapping = (name, extra = {}) => ({
  name,
  source: 'managed/alpha_user',
  target: 'system/Zion/User',
  properties: [],
  policies: [],
  ...extra,
});

/** The sync configuration before every test: four mappings that nothing names, in this order. */
const SYNC = () => ({
  _id: 'sync',
  mappings: ['mapA', 'mapB', 'mapC', 'mapD'].map((name) => mapping(name)),
});

/** What the tenant holds before every test: the sync configuration, and objects that are none of it. */
const STORE = () => ({
  sync: SYNC(),
  // a configuration object whose id is what the path selector `../scheduler/mapA` spells
  'scheduler/mapA': { _id: 'scheduler/mapA', note: 'not a mapping' },
  'provisioner.openicf/Zion': {
    _id: 'provisioner.openicf/Zion',
    name: 'Zion',
    enabled: false,
  },
  // the schedule of a liveSync names a source, never a mapping
  'schedule/liveZion': {
    _id: 'schedule/liveZion',
    enabled: false,
    invokeService: 'provisioner',
    invokeContext: { action: 'liveSync', source: 'system/Zion/User' },
  },
});

/** A reconciliation schedule that names a mapping. */
const reconciliation = (id, mappingName) => ({
  _id: `schedule/${id}`,
  enabled: false,
  invokeService: 'sync',
  invokeContext: { action: 'reconcile', mapping: mappingName },
});

/** The four holders of `mapA`, one of each source and flag, as the lookup finds them. */
const HOLDERS = () => ({
  sync: {
    _id: 'sync',
    mappings: [
      mapping('mapA'),
      mapping('mapB', { links: 'mapA' }),
      mapping('mapC', { syncAfter: ['mapA'] }),
      mapping('mapD'),
    ],
  },
  'mapping/newMap': {
    _id: 'mapping/newMap',
    name: 'newMap',
    source: 'managed/alpha_user',
    target: 'system/Zion/User',
    syncAfter: ['mapA'],
  },
  'schedule/reconA': reconciliation('reconA', 'mapA'),
});
const APPLICATIONS = {
  alpha_application: [
    {
      _id: 'app-1',
      _rev: '1',
      name: 'Zion Portal',
      mappingNames: ['mapA'],
    },
    { _id: 'app-2', _rev: '1', name: 'Other', mappingNames: ['elsewhere'] },
  ],
};

suite('config-manager delete connector-mappings (fake tenant)', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-mappings-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-mappings-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a Cloud tenant with the store and whatever else the test gives; it keeps its state until the test ends. */
  async function startTenant({ store = {}, ...options } = {}) {
    fakeAm?.stop();
    fs.rmSync(record, { force: true });
    fakeAm = await startFakeAm({
      recordPath: record,
      journey: 'service-account',
      realms: ['alpha', 'bravo'],
      idmEntities: structuredClone({ ...STORE(), ...store }),
      ...options,
    });
  }

  /** Runs `frodo config-manager delete connector-mappings <args>` once against the running tenant, without a terminal. */
  function runCli(args, { deployment = 'cloud', before = [] } = {}) {
    const login =
      deployment === 'cloud'
        ? ['-m', 'cloud']
        : ['bravo', 'admin', 'secret', '-m', deployment];
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          ...before,
          'config-manager',
          'delete',
          'connector-mappings',
          ...args,
          `http://127.0.0.1:${fakeAm.port}/am`,
          ...login,
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

  /** Starts a fresh tenant and runs the CLI once against it. */
  async function deleteMappings(args, options = {}) {
    await startTenant(options.tenant);
    return runCli(args, options);
  }

  const requests = () => readRequests(record);
  const decoded = (url) => decodeURIComponent(url);
  /** What the tenant was asked to change: every request that is not a read, a login or a session lookup, with the names that a write of `sync` holds. */
  const changes = () =>
    requests()
      .filter(
        ({ method, url }) =>
          method !== 'GET' &&
          !/\/authenticate|\/sessions|\/oauth2\/|_action=/.test(url)
      )
      .map(({ method, url, body }) => {
        const id = decoded(url).replace(/^.*\/openidm\/config\//, '');
        const names =
          method === 'PUT' && body
            ? ` [${JSON.parse(body)
                .mappings?.map((m) => m.name)
                .join(',')}]`
            : '';
        return `${method} ${id}${names}`;
      });
  /** The reads of the configuration, the realms and the application records: what a lookup of holders sends, and the reads of the sync configuration. */
  const reads = () =>
    requests()
      .filter(
        ({ method, url }) =>
          method === 'GET' &&
          /\/openidm\/(config|managed\/\w+_application|managed\/application)|\/global-config\/realms/.test(
            url
          )
      )
      .map(({ url }) =>
        decoded(url)
          .replace(/^.*\/openidm\//, 'openidm/')
          .replace(/^.*\/global-config\//, 'global-config/')
          .replace(/\?.*$/, '')
          .replace(/\/$/, '')
      );
  /** The number of requests of every method that reached the tenant. */
  const requestCount = () => requests().length;
  /** What the tenant holds for a configuration id now, read straight from the fake. */
  async function held(id) {
    const response = await fetch(
      `http://127.0.0.1:${fakeAm.port}/openidm/config/${id}`
    );
    return response.status === 200 ? response.json() : undefined;
  }
  /** The names of the mappings that the sync configuration holds now, in order. */
  const syncNames = async () =>
    (await held('sync'))?.mappings?.map((entry) => entry.name);

  describe('a named delete', () => {
    test(
      'deletes the mapping that the list holds with one write of the sync configuration without it, after reading it and what names it',
      async () => {
        const { code, output } = await deleteMappings(['-i', 'mapB']);

        expect(output).toContain('Deleted mapping: mapB');
        expect(code).toBe(0);
        expect(changes()).toEqual(['PUT sync [mapA,mapC,mapD]']);
        // the sync configuration is read before the one write (the reads of this test come after the log is taken)
        const log = requests().filter(({ url }) =>
          url.includes('/openidm/config/sync')
        );
        expect(log[0].method).toBe('GET');
        expect(log.at(-1).method).toBe('PUT');
        expect(await syncNames()).toEqual(['mapA', 'mapC', 'mapD']);
        // the other configuration objects are untouched
        expect(await held('scheduler/mapA')).toBeDefined();
        expect(await held('provisioner.openicf/Zion')).toBeDefined();
      },
      TIMEOUT
    );

    test.each([['-i'], ['--connector-mapping-id'], ['-n'], ['--name']])(
      '%s names it',
      async (flag) => {
        const { code } = await deleteMappings([flag, 'mapC']);

        expect(code).toBe(0);
        expect(changes()).toEqual(['PUT sync [mapA,mapB,mapD]']);
      },
      TIMEOUT
    );

    test.each([
      ['../scheduler/mapA'],
      ['mapA/../mapB'],
      ['a/b'],
      ['%2e%2e%2f'],
      ['..'],
      ['sync/mapA'],
      ['mapping/mapA'],
      ['mapA '],
      ['mapa'],
      ['MAPA'],
      ['map'],
    ])(
      'a selector that is not exactly a listed name (%j) deletes nothing and exits 1, and the typed text never reaches a request',
      async (typed) => {
        const { code, output } = await deleteMappings(['-i', typed]);

        expect(code).toBe(1);
        expect(output).toContain(`Mapping '${typed}' not found.`);
        expect(changes()).toEqual([]);
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
        // no request carries the typed text as a path: the configuration object that has it as an id is never read
        for (const { url } of requests()) {
          if (/[/.]/.test(typed)) expect(decoded(url)).not.toContain(typed);
          expect(decoded(url)).not.toMatch(
            /openidm\/config\/(\.\.|a\/b|scheduler)/
          );
        }
        expect(await held('scheduler/mapA')).toBeDefined();
      },
      TIMEOUT
    );

    test.each([[[]], [['-d']], [['--allow-failures']], [['--force', '-y']]])(
      'a mapping that is not there fails the command (%j): exit 1, with a dry run, with --allow-failures and with --force too',
      async (extra) => {
        const { code, output } = await deleteMappings(['-i', 'NOPE', ...extra]);

        expect(code).toBe(1);
        expect(output).toContain("Mapping 'NOPE' not found.");
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'an empty name is refused while the command line is parsed, even with -y: no request at all, exit 1, and nothing is deleted',
      async () => {
        for (const args of [
          ['-n', '', '-y'],
          ['-i', '', '-y'],
          ['--name', '', '-y'],
          ['--name=', '-y'],
          ['--connector-mapping-id=', '-y'],
        ]) {
          const { code, output } = await deleteMappings(args);

          expect([args, code]).toEqual([args, 1]);
          expect(output).toContain('An empty value never selects all objects');
          expect(requestCount()).toBe(0);
        }
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test(
      'a name of blanks is refused before the login too: no request at all, exit 1',
      async () => {
        const { code, output } = await deleteMappings(['-i', '  ', '-y']);

        expect(code).toBe(1);
        expect(output).toContain('must not be empty');
        expect(requestCount()).toBe(0);
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test(
      'a write that the tenant refuses exits 1, names the mapping in the summary, and leaves it in the sync configuration; --allow-failures keeps the exit code at 0',
      async () => {
        const failing = [{ method: 'PUT', path: '/openidm/config/sync' }];

        const failed = await deleteMappings(['-i', 'mapB'], {
          tenant: { failRequests: failing },
        });
        expect(failed.code).toBe(1);
        expect(failed.output).toContain('1 of 1 mapping failed');
        expect(failed.output).toContain('mapB');
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);

        const allowed = await deleteMappings(
          ['-i', 'mapB', '--allow-failures'],
          {
            tenant: { failRequests: failing },
          }
        );
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test(
      'a dry run sends no write, and says what would be deleted',
      async () => {
        const { code, output } = await deleteMappings(['-i', 'mapB', '-d']);

        expect(code).toBe(0);
        expect(output).toContain('Dry run: Deleting mapping: mapB');
        expect(changes()).toEqual([]);
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test(
      'works on ForgeOps too, with the application records of the type that a ForgeOps tenant has',
      async () => {
        const { code, output } = await deleteMappings(['-i', 'mapA'], {
          deployment: 'forgeops',
          tenant: {
            journey: 'password',
            // a ForgeOps login asks for an OAuth2 token, which the fake answers with the log API keys
            logApiKeys: [],
            managedObjects: {
              application: [
                { _id: 'a1', name: 'Zion', mappingNames: ['mapA'] },
              ],
            },
          },
        });

        expect(code).toBe(1);
        expect(output).toContain("Mapping 'mapA' is still named by:");
        expect(output).toContain("application 'Zion' (mappingNames), hard");
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('what names a mapping stops the delete', () => {
    test.each([
      [
        'a schedule (invokeContext.mapping)',
        { 'schedule/reconA': reconciliation('reconA', 'mapA') },
        {},
        "schedule 'schedule/reconA' (invokeContext.mapping), hard",
      ],
      [
        'a mapping of the sync configuration that reuses its links',
        {
          sync: {
            _id: 'sync',
            mappings: [mapping('mapA'), mapping('mapB', { links: 'mapA' })],
          },
        },
        {},
        "mapping 'sync/mapB' (links), hard",
      ],
      [
        'a mapping of the sync configuration that runs after it (soft)',
        {
          sync: {
            _id: 'sync',
            mappings: [
              mapping('mapA'),
              mapping('mapB', { syncAfter: ['mapA'] }),
            ],
          },
        },
        {},
        "mapping 'sync/mapB' (syncAfter), soft",
      ],
      [
        'a mapping configuration that reuses its links',
        {
          'mapping/newMap': {
            _id: 'mapping/newMap',
            name: 'newMap',
            links: 'mapA',
          },
        },
        {},
        "mapping 'mapping/newMap' (links), hard",
      ],
      [
        'a mapping configuration that runs after it (soft)',
        {
          'mapping/newMap': {
            _id: 'mapping/newMap',
            name: 'newMap',
            syncAfter: ['mapA'],
          },
        },
        {},
        "mapping 'mapping/newMap' (syncAfter), soft",
      ],
      [
        'an application of a realm',
        {},
        { managedObjects: APPLICATIONS },
        "application 'Zion Portal' of realm 'alpha' (mappingNames), hard",
      ],
    ])(
      '%s: exit 1, the holder is named with its field and dependency, nothing was deleted, no write is sent; also with --allow-failures',
      async (_what, store, tenant, line) => {
        for (const extra of [[], ['--allow-failures']]) {
          const { code, output } = await deleteMappings(
            ['-i', 'mapA', ...extra],
            {
              tenant: { store, ...tenant },
            }
          );

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain(
            `Mapping 'mapA' is still named by:\n  - ${line}`
          );
          expect(output).toContain('Nothing was deleted.');
          expect(changes()).toEqual([]);
          expect((await syncNames()).includes('mapA')).toBe(true);
        }
      },
      TIMEOUT
    );

    test(
      'four holders at once refuse, every one is named, and the sync configuration and every other object are unchanged',
      async () => {
        await startTenant({ store: HOLDERS(), managedObjects: APPLICATIONS });
        const before = {};
        for (const id of ['sync', 'mapping/newMap', 'schedule/reconA']) {
          before[id] = await held(id);
          expect(before[id]).toBeDefined();
        }
        fs.rmSync(record, { force: true });

        const { code, output } = await runCli(['-i', 'mapA']);

        expect(code).toBe(1);
        const lines = output
          .split('\n')
          .filter((line) => line.startsWith('  - '));
        expect(lines.sort()).toEqual(
          [
            "  - application 'Zion Portal' of realm 'alpha' (mappingNames), hard",
            "  - mapping 'mapping/newMap' (syncAfter), soft",
            "  - mapping 'sync/mapB' (links), hard",
            "  - mapping 'sync/mapC' (syncAfter), soft",
            "  - schedule 'schedule/reconA' (invokeContext.mapping), hard",
          ].sort()
        );
        // the sentence that a user reads when deciding on --force says what it does, and no more than that
        expect(output).toContain(
          '--force deletes it anyway: it deletes the mapping and clears no reference itself'
        );
        expect(output).not.toMatch(/and nothing else|left as it is/);
        expect(changes()).toEqual([]);
        for (const [id, was] of Object.entries(before)) {
          expect([id, await held(id)]).toEqual([id, was]);
        }
      },
      TIMEOUT
    );

    test(
      'an application that names the mapping owns it: the refusal names the command that removes both',
      async () => {
        const { code, output } = await deleteMappings(['-i', 'mapA'], {
          tenant: { managedObjects: APPLICATIONS },
        });

        expect(code).toBe(1);
        expect(output).toContain(
          'An application owns the mapping that it names: config-manager delete applications removes both.'
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a mapping that is stored in both places is one holder per field, not two',
      async () => {
        const both = mapping('mapB', { links: 'mapA' });
        const { code, output } = await deleteMappings(['-i', 'mapA'], {
          tenant: {
            store: {
              sync: { _id: 'sync', mappings: [mapping('mapA'), both] },
              'mapping/mapB': { _id: 'mapping/mapB', ...both },
            },
          },
        });

        expect(code).toBe(1);
        const lines = output
          .split('\n')
          .filter((line) => line.startsWith('  - mapping'));
        // one holder for the mapping that both stores hold, not one for each store
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(
          /^ {2}- mapping '(mapping|sync)\/mapB' \(links\), hard$/
        );
      },
      TIMEOUT
    );

    test(
      'a dry run says that the delete would be refused, and sends no write',
      async () => {
        const { code, output } = await deleteMappings(['-i', 'mapA', '-d'], {
          tenant: { store: HOLDERS() },
        });

        expect(code).toBe(1);
        expect(output).toContain('Dry run: the delete would be refused.');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a mapping that nothing names is deleted although other mappings are named',
      async () => {
        const { code } = await deleteMappings(['-i', 'mapD'], {
          tenant: { store: HOLDERS(), managedObjects: APPLICATIONS },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual(['PUT sync [mapA,mapB,mapC]']);
      },
      TIMEOUT
    );

    test(
      'a tenant without schedules, without mapping configurations and without applications names nothing and deletes',
      async () => {
        const { code } = await deleteMappings(['-i', 'mapB'], {
          tenant: { store: { 'schedule/liveZion': undefined } },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual(['PUT sync [mapA,mapC,mapD]']);
      },
      TIMEOUT
    );
  });

  describe('a source that cannot be read', () => {
    const unreadable = [
      { method: 'GET', path: '/openidm/managed/alpha_application' },
    ];

    test(
      'stops the delete: it names the source, deletes nothing and exits 1, also with --allow-failures',
      async () => {
        for (const extra of [[], ['--allow-failures']]) {
          const { code, output } = await deleteMappings(
            ['-i', 'mapB', ...extra],
            {
              tenant: { failRequests: unreadable },
            }
          );

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain(
            "Cannot tell what still names mapping 'mapB': these could not be read:"
          );
          expect(output).toContain('Error reading applications');
          expect(output).toContain(
            'Nothing was deleted. --force deletes the mapping without that check.'
          );
          expect(changes()).toEqual([]);
          expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
        }
      },
      TIMEOUT
    );

    test(
      'with --force it goes on after saying that it was not checked: one write, exit 0',
      async () => {
        const { code, output } = await deleteMappings(
          ['-i', 'mapB', '--force', '-y'],
          { tenant: { failRequests: unreadable } }
        );

        expect(code).toBe(0);
        expect(output).toContain(
          'Because --force was given, the mapping is deleted without that check.'
        );
        expect(changes()).toEqual(['PUT sync [mapA,mapC,mapD]']);
      },
      TIMEOUT
    );
  });

  // "every other object" below does not include the other entries of the sync configuration: the library writes
  // them again with the mapping gone, see https://github.com/rockcarver/frodo-lib/issues/1153
  describe('--force deletes the mapping and clears no reference', () => {
    test(
      'every holder is named, one write of the sync configuration is sent, and every other object is exactly as it was afterwards',
      async () => {
        await startTenant({ store: HOLDERS(), managedObjects: APPLICATIONS });
        const before = {};
        for (const id of [
          'mapping/newMap',
          'schedule/reconA',
          'schedule/liveZion',
          'scheduler/mapA',
          'provisioner.openicf/Zion',
        ]) {
          before[id] = await held(id);
          expect(before[id]).toBeDefined();
        }
        fs.rmSync(record, { force: true });

        const { code, output } = await runCli(['-i', 'mapA', '--force', '-y']);

        expect(code).toBe(0);
        // one request that changes anything: the write of the sync configuration without the mapping
        expect(changes()).toEqual(['PUT sync [mapB,mapC,mapD]']);
        expect(await syncNames()).toEqual(['mapB', 'mapC', 'mapD']);
        for (const [id, was] of Object.entries(before)) {
          expect([id, await held(id)]).toEqual([id, was]);
        }
        // the mappings that name it still name it: the field is not cleared
        const links = (await held('sync')).mappings.find(
          (m) => m.name === 'mapB'
        );
        expect(links.links).toBe('mapA');
        expect(output).toContain('Deleted mapping: mapA');
        expect(output).toContain(
          'These named the mapping before it was deleted; this command clears no reference:'
        );
        expect(output).toContain("schedule 'schedule/reconA'");
        expect(output).toContain("mapping 'mapping/newMap'");
        expect(output).toContain("application 'Zion Portal'");
      },
      TIMEOUT
    );

    test(
      'a dry run with --force lists what still names the mapping and sends no write',
      async () => {
        const { code, output } = await deleteMappings(
          ['-i', 'mapA', '--force', '-d'],
          { tenant: { store: HOLDERS() } }
        );

        expect(code).toBe(0);
        expect(output).toContain(
          'This command clears no reference: these would name a mapping that does not exist afterwards:'
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'without a terminal and without -y it is refused before the login: no request at all, exit 1',
      async () => {
        const { code, output } = await deleteMappings([
          '-i',
          'mapA',
          '--force',
        ]);

        expect(code).toBe(1);
        expect(output).toContain('Refusing to delete connector mapping');
        expect(requestCount()).toBe(0);
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test(
      'without -i it is refused before the login: no request at all, exit 1',
      async () => {
        for (const extra of [[], ['-y'], ['-d']]) {
          const { code, output } = await deleteMappings(['--force', ...extra]);

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain(
            '--force applies to a named connector mapping only'
          );
          expect(requestCount()).toBe(0);
        }
      },
      TIMEOUT
    );
  });

  describe('a delete of all mappings', () => {
    test(
      'without a terminal and without -y is refused before the login: no request at all, exit 1',
      async () => {
        const { code, output } = await deleteMappings([]);

        expect(code).toBe(1);
        expect(output).toContain('Refusing to delete all connector mappings');
        expect(output).toContain('-y/--yes');
        expect(output).toContain('--dry-run');
        expect(requestCount()).toBe(0);
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test(
      '-d sends no write, and its plan lists what names each mapping from one lookup',
      async () => {
        const { code, output } = await deleteMappings(['-d'], {
          tenant: { store: HOLDERS(), managedObjects: APPLICATIONS },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        for (const name of ['mapA', 'mapB', 'mapC', 'mapD']) {
          expect(output).toContain(`Dry run: Deleting mapping: ${name}`);
        }
        expect(output).toContain('1 of them is named by other objects.');
        // the holders that the same run deletes (mapB and mapC are mappings of the sync configuration) are left out
        expect(output).not.toContain("mapA: mapping 'sync/mapB'");
        expect(output).not.toContain("mapA: mapping 'sync/mapC'");
        expect(output).toContain(
          "    - mapA: mapping 'mapping/newMap' (syncAfter), soft"
        );
        expect(output).toContain(
          "    - mapA: application 'Zion Portal' of realm 'alpha' (mappingNames), hard"
        );
        expect(output).toContain(
          "    - mapA: schedule 'schedule/reconA' (invokeContext.mapping), hard"
        );
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test(
      'the lookup of the plan is the same reads for one mapping as for four, and for fifteen',
      async () => {
        const readsFor = async (count) => {
          const sync = {
            _id: 'sync',
            mappings: Array.from({ length: count }, (_, index) =>
              mapping(`map${index}`)
            ),
          };
          const { code } = await deleteMappings(['-d'], {
            tenant: { store: { sync } },
          });
          expect(code).toBe(0);
          return reads();
        };

        const one = await readsFor(1);
        const four = await readsFor(4);
        const fifteen = await readsFor(15);

        // the read of the sync configuration for the list, then the reads of the lookup
        expect(one.length).toBeGreaterThan(3);
        expect(four).toEqual(one);
        expect(fifteen).toEqual(one);
      },
      TIMEOUT
    );

    test(
      '-y deletes every mapping, one write of the sync configuration each, and sends no lookup at all: only the sync configuration is read',
      async () => {
        const { code, output } = await deleteMappings(['-y'], {
          tenant: { store: HOLDERS(), managedObjects: APPLICATIONS },
        });

        expect(code).toBe(0);
        // a delete of all never refuses for what names a mapping
        expect(changes()).toEqual([
          'PUT sync [mapB,mapC,mapD]',
          'PUT sync [mapC,mapD]',
          'PUT sync [mapD]',
          'PUT sync []',
        ]);
        // the list, and the read of each delete: never a schedule, a mapping configuration or an application
        expect(new Set(reads())).toEqual(new Set(['openidm/config/sync']));
        for (const name of ['mapA', 'mapB', 'mapC', 'mapD']) {
          expect(output).toContain(`Deleted mapping: ${name}`);
        }
        expect(await syncNames()).toEqual([]);
        // the other configuration objects are untouched
        expect(await held('mapping/newMap')).toBeDefined();
        expect(await held('schedule/reconA')).toBeDefined();
        expect(await held('scheduler/mapA')).toBeDefined();
        expect(await held('provisioner.openicf/Zion')).toBeDefined();
      },
      TIMEOUT
    );

    test(
      'the second of four writes is refused: the others are deleted, the summary names it, the exit code is 1, and the mapping is still in the sync configuration',
      async () => {
        const failing = [
          { method: 'PUT', path: '/openidm/config/sync', nth: 2 },
        ];

        const failed = await deleteMappings(['-y'], {
          tenant: { failRequests: failing },
        });

        expect(failed.code).toBe(1);
        expect(failed.output).toContain('1 of 4 mappings failed');
        expect(failed.output).toContain('- mapB');
        expect(failed.output).toContain('Deleted mapping: mapA');
        expect(failed.output).toContain('Deleted mapping: mapC');
        expect(failed.output).toContain('Deleted mapping: mapD');
        expect(failed.output).not.toContain('Deleted mapping: mapB');
        // every write was sent; the refused one (the second) is the removal of mapB, and the third
        // starts from what the tenant holds, which still has mapB: no later write carries that removal
        expect(changes()).toEqual([
          'PUT sync [mapB,mapC,mapD]',
          'PUT sync [mapC,mapD]',
          'PUT sync [mapB,mapD]',
          'PUT sync [mapB]',
        ]);
        expect(await syncNames()).toEqual(['mapB']);

        const allowed = await deleteMappings(['-y', '--allow-failures'], {
          tenant: { failRequests: failing },
        });
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain('1 of 4 mappings failed');
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
        expect(await syncNames()).toEqual(['mapB']);
      },
      TIMEOUT
    );

    test(
      'every write is refused: nothing is deleted, every mapping is named, and the exit code is 1',
      async () => {
        const { code, output } = await deleteMappings(['-y'], {
          tenant: {
            failRequests: [{ method: 'PUT', path: '/openidm/config/sync' }],
          },
        });

        expect(code).toBe(1);
        expect(output).toContain('4 of 4 mappings failed');
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );

    test.each([
      ['no sync configuration', { sync: undefined }],
      [
        'a sync configuration without mappings',
        { sync: { _id: 'sync', mappings: [] } },
      ],
    ])(
      'nothing to delete (%s) exits 0 with a warning, for -y and for -d, and sends no write',
      async (_what, store) => {
        for (const extra of [['-y'], ['-d']]) {
          const { code, output } = await deleteMappings(extra, {
            tenant: { store },
          });

          expect([extra, code]).toEqual([extra, 0]);
          expect(output).toContain('No connector mappings found to delete.');
          expect(changes()).toEqual([]);
        }
      },
      TIMEOUT
    );

    test(
      'a sync configuration that the library cannot read (no mappings key) is a failed list read: exit 1, also with --allow-failures, nothing is written',
      async () => {
        for (const extra of [['-y'], ['-y', '--allow-failures'], ['-d']]) {
          const { code, output } = await deleteMappings(extra, {
            tenant: { store: { sync: { _id: 'sync' } } },
          });

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain('Error reading the mappings');
          expect(changes()).toEqual([]);
        }
      },
      TIMEOUT
    );

    test(
      'a sync configuration that cannot be read exits 1, also with --allow-failures, and nothing is written',
      async () => {
        const { code } = await deleteMappings(['-y', '--allow-failures'], {
          tenant: {
            failRequests: [{ method: 'GET', path: '/openidm/config/sync' }],
          },
        });

        expect(code).toBe(1);
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'the plan of a source that cannot be read is a warning: the plan goes on, says what could not be read, and exits 0',
      async () => {
        const { code, output } = await deleteMappings(['-d'], {
          tenant: {
            failRequests: [
              { method: 'GET', path: '/openidm/managed/alpha_application' },
            ],
          },
        });

        expect(code).toBe(0);
        expect(output).toContain(
          'These could not be read, so this list of objects is not complete: applications.'
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'the plan lists at most 20 holders for a mapping, and counts the rest',
      async () => {
        const schedules = Object.fromEntries(
          Array.from({ length: 25 }, (_, index) => [
            `schedule/recon${String(index).padStart(2, '0')}`,
            reconciliation(`recon${String(index).padStart(2, '0')}`, 'mapA'),
          ])
        );
        const { code, output } = await deleteMappings(['-d'], {
          tenant: { store: schedules },
        });

        expect(code).toBe(0);
        const listed = output
          .split('\n')
          .filter((line) => line.startsWith('    - mapA: schedule'));
        expect(listed).toHaveLength(20);
        expect(output).toContain('    - mapA: and 5 more');
      },
      TIMEOUT
    );
  });

  describe('a mapping that is stored as mapping/<name> is not covered', () => {
    test(
      'a delete of all leaves it where it is, and says nothing to delete when the sync configuration has none',
      async () => {
        const { code, output } = await deleteMappings(['-y'], {
          tenant: {
            store: {
              sync: undefined,
              'mapping/newMap': {
                _id: 'mapping/newMap',
                name: 'newMap',
                source: 'managed/alpha_user',
                target: 'system/Zion/User',
              },
            },
          },
        });

        expect(code).toBe(0);
        expect(output).toContain('No connector mappings found to delete.');
        expect(changes()).toEqual([]);
        expect(await held('mapping/newMap')).toBeDefined();
      },
      TIMEOUT
    );

    test(
      'a name of that store is not found',
      async () => {
        const { code, output } = await deleteMappings(['-i', 'newMap'], {
          tenant: {
            store: {
              'mapping/newMap': {
                _id: 'mapping/newMap',
                name: 'newMap',
              },
            },
          },
        });

        expect(code).toBe(1);
        expect(output).toContain("Mapping 'newMap' not found.");
        expect(changes()).toEqual([]);
        expect(await held('mapping/newMap')).toBeDefined();
      },
      TIMEOUT
    );
  });

  describe('the usage examples run as written', () => {
    /** The examples of the command, as `-hhh` prints them: the arguments after the command and before the connection profile. */
    function examples() {
      const help = cp.spawnSync(
        binaryPath,
        ['config-manager', 'delete', 'connector-mappings', '-hhh'],
        {
          env: { ...process.env, HOME: home, NO_COLOR: '1', NODE_OPTIONS: '' },
          encoding: 'utf8',
        }
      ).stdout;
      return help
        .split('\n')
        .map((line) => line.trim())
        .filter((line) =>
          line.startsWith('$ frodo config-manager delete connector-mappings ')
        )
        .map((line) =>
          line
            .replace('$ frodo config-manager delete connector-mappings ', '')
            .replace(/ matrix$/, '')
            .split(' ')
        );
    }

    test(
      'each runs without a prompt against the sample mapping and exits 0: delete all with -y, preview all, delete one, preview one, delete one with --force -y',
      async () => {
        const found = examples();
        expect(found.map((args) => args.join(' '))).toEqual([
          '-y',
          '-d',
          `-i ${SAMPLE}`,
          `-i ${SAMPLE} -d`,
          `-i ${SAMPLE} --force -y`,
        ]);
        for (const args of found) {
          const store = {
            sync: {
              _id: 'sync',
              mappings: [mapping(SAMPLE), mapping('other')],
            },
          };
          const { code, output } = await deleteMappings(args, {
            tenant: { store },
          });

          expect([args.join(' '), code]).toEqual([args.join(' '), 0]);
          expect(output).not.toMatch(/\bprompt\b|\? /i);
          // a real run changes the sync configuration, a preview does not
          const preview = args.includes('-d');
          expect([args.join(' '), changes().length > 0]).toEqual([
            args.join(' '),
            !preview,
          ]);
        }
      },
      TIMEOUT
    );
  });

  describe('deployments', () => {
    test(
      'a classic deployment is refused with the exit code 1 and nothing is deleted: no request for configuration objects is sent',
      async () => {
        const { code, output } = await deleteMappings(['-i', 'mapA'], {
          deployment: 'classic',
          tenant: { journey: 'password' },
        });

        expect(code).toBe(1);
        expect(output).toContain(
          "Command does not support deployment type 'classic'"
        );
        expect(changes()).toEqual([]);
        expect(reads()).toEqual([]);
        expect(await syncNames()).toEqual(['mapA', 'mapB', 'mapC', 'mapD']);
      },
      TIMEOUT
    );
  });
});
