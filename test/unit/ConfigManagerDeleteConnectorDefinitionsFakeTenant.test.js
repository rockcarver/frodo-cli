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
 * `config-manager delete connector-definitions`, the REAL CLI of this checkout
 * against a fake tenant (test/utils/FakeAm.mjs, in a separate process, with the
 * IDM store of its configuration objects and the application records of two
 * realms) and the real library. What the unit tests stub, this shows in the log
 * of the requests the tenant received, and in what the tenant holds afterwards:
 *
 * - a connector definition is looked up in the list of the tenant, and the id
 *   that the list holds is what is deleted: a selector that is a path, or only
 *   almost an id, sends nothing but reads and deletes nothing (a configuration
 *   object that has the typed path as its id is never read);
 * - a connector definition that a mapping (in either store, once), an
 *   application, a schedule or an authentication module still names is not
 *   deleted, also with `--allow-failures`; with `--force` it is, with one delete
 *   and no write, and every holder is as it was afterwards, byte for byte;
 * - a source that cannot be read stops the delete, and `--force` goes on;
 * - the configuration of a Cloud tenant that has no `serverAuthContext` is no
 *   source of holders and no error;
 * - a delete of all connector definitions: without a terminal and without `-y`
 *   it sends no request at all; a dry run, and nothing else, looks up what names
 *   them, in the same seven reads however many there are; `-y` sends no lookup;
 *   one that fails does not stop the others;
 * - an empty id, a `--force` that has no `-i`, and classic deployments are
 *   refused before anything is sent.
 *
 * No tenant, no secrets, no recordings, no terminal; a temporary HOME and working
 * directory keep it away from real profiles and files. Skipped on Windows: the
 * CLI binary shim is a shell script. What the operation does with each answer of
 * the library is in FrConfigConnectorDefinitionsDelete.test.js, the command line
 * in ConfigManagerDeleteConnectorDefinitionsCommand.test.js.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const connector = (name) => ({
  _id: `provisioner.openicf/${name}`,
  name,
  enabled: false,
  connectorRef: { connectorName: 'org.identityconnectors.ldap.LdapConnector' },
});

/** What the tenant holds before every test: three connector definitions and objects that are none. */
const STORE = {
  'provisioner.openicf/Azure': connector('Azure'),
  'provisioner.openicf/GoogleApps': connector('GoogleApps'),
  'provisioner.openicf/salesforce': connector('salesforce'),
  'provisioner.openicf.connectorinfoprovider': {
    _id: 'provisioner.openicf.connectorinfoprovider',
    remoteConnectorClients: [],
  },
  // a configuration object whose id is what the path selector `../scheduler/Azure` spells
  'scheduler/Azure': { _id: 'scheduler/Azure', note: 'not a connector' },
  // the authentication configuration of a Cloud tenant: no serverAuthContext, no module
  authentication: {
    _id: 'authentication',
    rsFilter: { subjectMapping: [{ queryOnResource: 'managed/alpha_user' }] },
  },
};

const MAPPING_NAME = 'managedAlpha_user_systemAzureUser';
const SYNC = {
  _id: 'sync',
  mappings: [
    {
      name: MAPPING_NAME,
      source: 'managed/alpha_user',
      target: 'system/Azure/User',
    },
  ],
};
const MAPPING = {
  _id: `mapping/${MAPPING_NAME}`,
  name: MAPPING_NAME,
  source: 'managed/alpha_user',
  target: 'system/Azure/User',
};
const SCHEDULE = {
  _id: 'schedule/azure-live-sync',
  enabled: false,
  invokeService: 'provisioner',
  invokeContext: { action: 'liveSync', source: 'system/Azure/User' },
};
const LOGIN_MODULE = {
  _id: 'authentication',
  rsFilter: { subjectMapping: [{ queryOnResource: 'managed/alpha_user' }] },
  serverAuthContext: {
    authModules: [
      {
        name: 'AzurePassthrough',
        enabled: true,
        properties: { queryOnResource: 'system/Azure/User' },
      },
    ],
  },
};
const APPLICATIONS = {
  alpha_application: [
    { _id: 'app-1', _rev: '1', name: 'Azure Directory', connectorId: 'Azure' },
    { _id: 'app-2', _rev: '1', name: 'Other', connectorId: 'elsewhere' },
  ],
};

suite('config-manager delete connector-definitions (fake tenant)', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-connectors-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-connectors-work-'));
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
      idmEntities: structuredClone({ ...STORE, ...store }),
      ...options,
    });
  }

  /** Runs `frodo config-manager delete connector-definitions <args>` once against the running tenant, without a terminal. */
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
          'connector-definitions',
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
  async function deleteConnectors(args, options = {}) {
    await startTenant(options.tenant);
    return runCli(args, options);
  }

  const requests = () => readRequests(record);
  const decoded = (url) => decodeURIComponent(url);
  /** What the tenant was asked to change: every request that is not a read, a login or a session lookup. */
  const changes = () =>
    requests()
      .filter(
        ({ method, url }) =>
          method !== 'GET' &&
          !/\/authenticate|\/sessions|\/oauth2\/|_action=/.test(url)
      )
      .map(
        ({ method, url }) =>
          `${method} ${decoded(url).replace(/^.*\/openidm\/config\//, '')}`
      );
  /** The reads of the configuration, the realms and the application records: what a lookup of holders sends, and the list of connector definitions. */
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
  /** The number of requests of any kind that reached the tenant. */
  const requestCount = () => requests().length;
  /** What the tenant holds for a configuration id now, read straight from the fake. */
  async function held(id) {
    const response = await fetch(
      `http://127.0.0.1:${fakeAm.port}/openidm/config/${id}`
    );
    return response.status === 200 ? response.json() : undefined;
  }

  describe('a named delete', () => {
    test(
      'deletes the connector definition that the list holds with one DELETE, after reading the list and what names it',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure']);

        expect(output).toContain("Deleted connector definition 'Azure'.");
        expect(code).toBe(0);
        expect(changes()).toEqual(['DELETE provisioner.openicf/Azure']);
        // the list is read first, the lookup after it, the delete last
        const idm = requests()
          .filter(({ url }) => url.includes('/openidm/config'))
          .map(({ method, url }) => `${method} ${decoded(url)}`);
        expect(idm[0]).toContain("_queryFilter=_id sw 'provisioner.openicf'");
        expect(idm.at(-1)).toMatch(/DELETE .*provisioner\.openicf\/Azure$/);
        expect(await held('provisioner.openicf/Azure')).toBeUndefined();
        expect(await held('provisioner.openicf/GoogleApps')).toBeDefined();
      },
      TIMEOUT
    );

    test.each([['-i'], ['--connector-id'], ['-n'], ['--name']])(
      '%s names it',
      async (flag) => {
        const { code } = await deleteConnectors([flag, 'salesforce']);

        expect(code).toBe(0);
        expect(changes()).toEqual(['DELETE provisioner.openicf/salesforce']);
      },
      TIMEOUT
    );

    test(
      'works on ForgeOps too, with the application records of the type that a ForgeOps tenant has',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure'], {
          deployment: 'forgeops',
          tenant: {
            journey: 'password',
            // a ForgeOps login asks for an OAuth2 token, which the fake answers with the log API keys
            logApiKeys: [],
            managedObjects: {
              application: [{ _id: 'a1', name: 'Azure', connectorId: 'Azure' }],
            },
          },
        });

        expect(code).toBe(1);
        expect(output).toContain(
          "Connector definition 'Azure' is still named by:"
        );
        expect(output).toContain("application 'Azure' (connectorId), hard");
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test.each([
      ['../scheduler/Azure'],
      ['a/b'],
      ['%2e%2e%2f'],
      ['%2e%2e%2fscheduler%2fAzure'],
      ['..'],
      ['Azure '],
      ['azure'],
      ['provisioner.openicf/Azure'],
    ])(
      'a selector that is not exactly an id of the list (%j) deletes nothing and exits 1, and the typed path never reaches a request',
      async (typed) => {
        const { code, output } = await deleteConnectors(['-i', typed]);

        expect(code).toBe(1);
        expect(output).toContain(`Connector definition '${typed}' not found.`);
        expect(changes()).toEqual([]);
        // no request carries the typed text as a path: the configuration object that has it as an id is never read
        for (const { url } of requests()) {
          expect(decoded(url)).not.toMatch(/openidm\/config\/(\.\.|a\/b|scheduler)/);
          expect(decoded(url)).not.toContain('openidm/config/provisioner.openicf/..');
        }
        expect(await held('scheduler/Azure')).toBeDefined();
        expect(await held('provisioner.openicf/Azure')).toBeDefined();
      },
      TIMEOUT
    );

    test.each([[[]], [['-d']], [['--allow-failures']]])(
      'a connector definition that is not there fails the command (%j), with a dry run and with --allow-failures too',
      async (extra) => {
        const { code, output } = await deleteConnectors(['-i', 'NOPE', ...extra]);

        expect(code).toBe(1);
        expect(output).toContain("Connector definition 'NOPE' not found.");
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'an empty id is refused while the command line is parsed, even with -y: no request at all, exit 1',
      async () => {
        for (const args of [
          ['-n', '', '-y'],
          ['-i', '', '-y'],
          ['--name=', '-y'],
          ['--connector-id=', '-y'],
        ]) {
          const { code, output } = await deleteConnectors(args);

          expect([args, code]).toEqual([args, 1]);
          expect(output).toContain('An empty value never selects all objects');
          expect(requestCount()).toBe(0);
        }
        expect(await held('provisioner.openicf/Azure')).toBeDefined();
      },
      TIMEOUT
    );

    test(
      'an id of blanks is refused before the login too: no request at all, exit 1',
      async () => {
        const { code, output } = await deleteConnectors(['-i', '  ', '-y']);

        expect(code).toBe(1);
        expect(output).toContain('must not be empty');
        expect(requestCount()).toBe(0);
      },
      TIMEOUT
    );

    test(
      'a failed DELETE exits 1 and names the connector definition in the summary; --allow-failures keeps it at 0',
      async () => {
        const failing = [
          {
            method: 'DELETE',
            path: '/openidm/config/provisioner.openicf/Azure',
          },
        ];

        const failed = await deleteConnectors(['-i', 'Azure'], {
          tenant: { failRequests: failing },
        });
        expect(failed.code).toBe(1);
        expect(failed.output).toContain('1 of 1 connector failed');

        const allowed = await deleteConnectors(['-i', 'Azure', '--allow-failures'], {
          tenant: { failRequests: failing },
        });
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
      },
      TIMEOUT
    );

    test(
      'a dry run sends no write, and says what would be deleted',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure', '-d']);

        expect(code).toBe(0);
        expect(output).toContain(
          "Dry run: would delete connector definition 'Azure'."
        );
        expect(changes()).toEqual([]);
        expect(await held('provisioner.openicf/Azure')).toBeDefined();
      },
      TIMEOUT
    );
  });

  describe('what names a connector definition stops the delete', () => {
    test.each([
      [
        'a mapping of the sync configuration (probe 18: a mapping on system/Azure/User)',
        { sync: SYNC },
        {},
        `mapping '${MAPPING_NAME}' (target), hard`,
      ],
      [
        'a mapping configuration',
        { [MAPPING._id]: MAPPING },
        {},
        `mapping '${MAPPING_NAME}' (target), hard`,
      ],
      [
        'an application of a realm',
        {},
        { managedObjects: APPLICATIONS },
        "application 'Azure Directory' of realm 'alpha' (connectorId), hard",
      ],
      [
        'a schedule',
        { [SCHEDULE._id]: SCHEDULE },
        {},
        "schedule 'schedule/azure-live-sync' (invokeContext.source), hard",
      ],
      [
        'an authentication module',
        { authentication: LOGIN_MODULE },
        {},
        "authentication module 'AzurePassthrough' (serverAuthContext.authModules.properties.queryOnResource), hard",
      ],
    ])(
      '%s: exit 1, the holder is named with its field and dependency, nothing was deleted, no DELETE is sent; also with --allow-failures',
      async (_what, store, tenant, line) => {
        for (const extra of [[], ['--allow-failures']]) {
          const { code, output } = await deleteConnectors(['-i', 'Azure', ...extra], {
            tenant: { store, ...tenant },
          });

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain(
            `Connector definition 'Azure' is still named by:\n  - ${line}`
          );
          expect(output).toContain('Nothing was deleted.');
          expect(changes()).toEqual([]);
          expect(await held('provisioner.openicf/Azure')).toBeDefined();
        }
      },
      TIMEOUT
    );

    test(
      'a mapping that is stored in both places is one holder per field, not two (the same mapping under sync/ and mapping/)',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure'], {
          tenant: { store: { sync: SYNC, [MAPPING._id]: MAPPING } },
        });

        expect(code).toBe(1);
        const lines = output
          .split('\n')
          .filter((line) => line.startsWith('  - mapping'));
        expect(lines).toEqual([`  - mapping '${MAPPING_NAME}' (target), hard`]);
      },
      TIMEOUT
    );

    test(
      'a dry run says that the delete would be refused, and sends no write',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure', '-d'], {
          tenant: { store: { sync: SYNC } },
        });

        expect(code).toBe(1);
        expect(output).toContain('Dry run: the delete would be refused.');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a connector definition that nothing names is deleted although other connector definitions are named',
      async () => {
        const { code } = await deleteConnectors(['-i', 'GoogleApps'], {
          tenant: { store: { sync: SYNC } },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual(['DELETE provisioner.openicf/GoogleApps']);
      },
      TIMEOUT
    );

    test(
      'a Cloud tenant whose authentication configuration has only rsFilter is no source of holders and no error',
      async () => {
        // the default store has exactly that: no serverAuthContext and no module
        const { code, output } = await deleteConnectors(['-i', 'Azure']);

        expect(code).toBe(0);
        expect(output).not.toContain('Cannot tell');
      },
      TIMEOUT
    );

    test(
      'a tenant without a sync configuration, without an authentication configuration and without applications names nothing and deletes',
      async () => {
        const { code } = await deleteConnectors(['-i', 'Azure'], {
          tenant: { store: { authentication: undefined } },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual(['DELETE provisioner.openicf/Azure']);
      },
      TIMEOUT
    );
  });

  describe('a source that cannot be read', () => {
    const unreadable = [{ method: 'GET', path: '/openidm/config/sync' }];

    test(
      'stops the delete: it names the source, deletes nothing and exits 1, also with --allow-failures',
      async () => {
        for (const extra of [[], ['--allow-failures']]) {
          const { code, output } = await deleteConnectors(['-i', 'Azure', ...extra], {
            tenant: { failRequests: unreadable },
          });

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain(
            "Cannot tell what still names connector definition 'Azure': these could not be read:"
          );
          expect(output).toContain('Error reading mappings');
          expect(output).toContain(
            'Nothing was deleted. --force deletes the connector definition without that check.'
          );
          expect(changes()).toEqual([]);
        }
      },
      TIMEOUT
    );

    test(
      'with --force it goes on after saying that it was not checked: one DELETE, exit 0',
      async () => {
        const { code, output } = await deleteConnectors(
          ['-i', 'Azure', '--force', '-y'],
          { tenant: { failRequests: unreadable } }
        );

        expect(code).toBe(0);
        expect(output).toContain(
          'Because --force was given, the connector definition is deleted without that check.'
        );
        expect(changes()).toEqual(['DELETE provisioner.openicf/Azure']);
      },
      TIMEOUT
    );
  });

  describe('--force deletes the connector definition and nothing else', () => {
    test(
      'every holder is named, one DELETE and no write is sent, and each holder is exactly as it was afterwards',
      async () => {
        const store = {
          sync: SYNC,
          [MAPPING._id]: MAPPING,
          [SCHEDULE._id]: SCHEDULE,
          authentication: LOGIN_MODULE,
        };
        await startTenant({ store, managedObjects: APPLICATIONS });
        const before = {};
        for (const id of [
          'sync',
          MAPPING._id,
          SCHEDULE._id,
          'authentication',
          'scheduler/Azure',
          'provisioner.openicf/GoogleApps',
        ]) {
          before[id] = await held(id);
          expect(before[id]).toBeDefined();
        }
        fs.rmSync(record, { force: true });

        const { code, output } = await runCli([
          '-i',
          'Azure',
          '--force',
          '-y',
        ]);

        expect(code).toBe(0);
        expect(changes()).toEqual(['DELETE provisioner.openicf/Azure']);
        expect(await held('provisioner.openicf/Azure')).toBeUndefined();
        for (const [id, was] of Object.entries(before)) {
          expect([id, await held(id)]).toEqual([id, was]);
        }
        // and the command says what it left alone
        expect(output).toContain("Deleted connector definition 'Azure'.");
        expect(output).toContain(
          'Left alone, these now name a connector definition that does not exist:'
        );
        expect(output).toContain(`mapping '${MAPPING_NAME}' (target), hard`);
        expect(output).toContain("application 'Azure Directory'");
        expect(output).toContain("schedule 'schedule/azure-live-sync'");
        expect(output).toContain("authentication module 'AzurePassthrough'");
      },
      TIMEOUT
    );

    test(
      'a dry run with --force lists what would be left alone and sends no write',
      async () => {
        const { code, output } = await deleteConnectors(
          ['-i', 'Azure', '--force', '-d'],
          { tenant: { store: { sync: SYNC } } }
        );

        expect(code).toBe(0);
        expect(output).toContain(
          'Leave these alone, they would name a connector definition that does not exist afterwards:'
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'without a terminal and without -y it is refused before the login: no request at all, exit 1',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure', '--force']);

        expect(code).toBe(1);
        expect(output).toContain('Refusing to delete connector definition');
        expect(requestCount()).toBe(0);
      },
      TIMEOUT
    );

    test(
      'without -i it is refused before the login: no request at all, exit 1',
      async () => {
        for (const extra of [[], ['-y'], ['-d']]) {
          const { code, output } = await deleteConnectors(['--force', ...extra]);

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain('--force applies to a named connector definition only');
          expect(requestCount()).toBe(0);
        }
      },
      TIMEOUT
    );
  });

  describe('a delete of all connector definitions', () => {
    test(
      'without a terminal and without -y is refused before the login: no request at all, exit 1',
      async () => {
        const { code, output } = await deleteConnectors([]);

        expect(code).toBe(1);
        expect(output).toContain('Refusing to delete all connector definitions');
        expect(output).toContain('-y/--yes');
        expect(requestCount()).toBe(0);
        expect(await held('provisioner.openicf/Azure')).toBeDefined();
      },
      TIMEOUT
    );

    test(
      '-d sends no write, and its plan lists what names each connector definition from one lookup (the list, and seven reads)',
      async () => {
        const { code, output } = await deleteConnectors(['-d'], {
          tenant: {
            store: { sync: SYNC, [SCHEDULE._id]: SCHEDULE },
            managedObjects: APPLICATIONS,
          },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        expect(output).toContain(
          'Dry run: nothing is deleted. All 3 connector definitions would be deleted: Azure, GoogleApps, salesforce.'
        );
        expect(output).toContain('1 of them is named by other objects.');
        expect(output).toContain(`    - Azure: mapping '${MAPPING_NAME}' (target), hard`);
        expect(output).toContain(
          "    - Azure: application 'Azure Directory' of realm 'alpha' (connectorId), hard"
        );
        expect(output).toContain(
          "    - Azure: schedule 'schedule/azure-live-sync' (invokeContext.source), hard"
        );
        expect(output).not.toContain('- GoogleApps:');
        // the list, then the seven reads of the lookup: the sync configuration, the
        // mapping configurations, the realms, the applications of two realms, the
        // schedules, the authentication configuration
        const found = reads();
        expect(found[0]).toBe('openidm/config');
        expect(found).toHaveLength(8);
        expect(found.slice(1).sort()).toEqual(
          [
            'global-config/realms',
            'openidm/config',
            'openidm/config',
            'openidm/config/authentication',
            'openidm/config/sync',
            'openidm/managed/alpha_application',
            'openidm/managed/bravo_application',
          ].sort()
        );
      },
      TIMEOUT
    );

    test(
      'the lookup is the same seven reads for one connector definition as for three',
      async () => {
        const { code, output } = await deleteConnectors(['-d'], {
          tenant: {
            store: {
              'provisioner.openicf/GoogleApps': undefined,
              'provisioner.openicf/salesforce': undefined,
            },
          },
        });

        expect(code).toBe(0);
        expect(output).toContain(
          'The one connector definition would be deleted: Azure.'
        );
        expect(reads()).toHaveLength(8);
      },
      TIMEOUT
    );

    test(
      '-y deletes every connector definition, with one DELETE each, and sends no lookup at all: only the list is read',
      async () => {
        const { code, output } = await deleteConnectors(['-y'], {
          tenant: { store: { sync: SYNC }, managedObjects: APPLICATIONS },
        });

        expect(code).toBe(0);
        // a delete of all never refuses for what names them
        expect(changes()).toEqual([
          'DELETE provisioner.openicf/Azure',
          'DELETE provisioner.openicf/GoogleApps',
          'DELETE provisioner.openicf/salesforce',
        ]);
        expect(reads()).toEqual(['openidm/config']);
        expect(output).toContain("Deleted connector definition 'GoogleApps'.");
        // the other configuration objects are untouched
        expect(await held('sync')).toEqual(SYNC);
        expect(await held('scheduler/Azure')).toBeDefined();
        expect(await held('provisioner.openicf.connectorinfoprovider')).toBeDefined();
      },
      TIMEOUT
    );

    test(
      'one of three fails: the others are deleted, the summary names it, and the command exits 1; --allow-failures keeps it at 0',
      async () => {
        const failing = [
          {
            method: 'DELETE',
            path: '/openidm/config/provisioner.openicf/GoogleApps',
          },
        ];

        const failed = await deleteConnectors(['-y'], {
          tenant: { failRequests: failing },
        });
        expect(failed.code).toBe(1);
        expect(failed.output).toContain('1 of 3 connectors failed');
        expect(failed.output).toContain('GoogleApps');
        expect(changes()).toEqual([
          'DELETE provisioner.openicf/Azure',
          'DELETE provisioner.openicf/GoogleApps',
          'DELETE provisioner.openicf/salesforce',
        ]);
        expect(await held('provisioner.openicf/GoogleApps')).toBeDefined();
        expect(await held('provisioner.openicf/Azure')).toBeUndefined();
        expect(await held('provisioner.openicf/salesforce')).toBeUndefined();

        const allowed = await deleteConnectors(['-y', '--allow-failures'], {
          tenant: { failRequests: failing },
        });
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain('1 of 3 connectors failed');
      },
      TIMEOUT
    );

    test(
      'a list that cannot be read deletes nothing and exits 1, also with --allow-failures',
      async () => {
        const { code } = await deleteConnectors(['-y', '--allow-failures'], {
          tenant: {
            failRequests: [{ method: 'GET', path: '/openidm/config?' }],
          },
        });

        expect(code).toBe(1);
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'nothing to delete exits 0 with a warning',
      async () => {
        const { code, output } = await deleteConnectors(['-y'], {
          tenant: {
            store: {
              'provisioner.openicf/Azure': undefined,
              'provisioner.openicf/GoogleApps': undefined,
              'provisioner.openicf/salesforce': undefined,
            },
          },
        });

        expect(code).toBe(0);
        expect(output).toContain('No connector definitions found to delete.');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'the plan of a source that cannot be read is a warning: the plan goes on, says what could not be read, and exits 0',
      async () => {
        const { code, output } = await deleteConnectors(['-d'], {
          tenant: {
            store: { sync: SYNC },
            failRequests: [{ method: 'GET', path: '/openidm/config/sync' }],
          },
        });

        expect(code).toBe(0);
        expect(output).toContain(
          'These could not be read, so this list of objects is not complete: mappings.'
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('a tenant that lists an id that is not a plain name', () => {
    // put into the path of a request as they are, each of these would name another object than the one that
    // was listed: `..` the configuration `managed`, `#` and `?` the connector `a`, a slash a deeper path
    const MALFORMED = [
      'provisioner.openicf/../managed',
      'provisioner.openicf/a#b',
      'provisioner.openicf/a?b',
      'provisioner.openicf/x/y',
      'provisioner.openicf/',
      'provisioner.openicf/a%2Fb',
      'provisioner.openicf/a\u0001b',
    ];
    const store = () => ({
      'provisioner.openicf/a': connector('a'),
      managed: { _id: 'managed', objects: [] },
      ...Object.fromEntries(MALFORMED.map((id) => [id, { _id: id }])),
    });

    test(
      'a delete of all sends a DELETE for the plain names only, names each of the others, fails, and the configuration that a path would have reached is still there',
      async () => {
        const { code, output } = await deleteConnectors(['-y'], {
          tenant: { store: store() },
        });

        expect(code).toBe(1);
        expect(changes()).toEqual([
          'DELETE provisioner.openicf/Azure',
          'DELETE provisioner.openicf/GoogleApps',
          'DELETE provisioner.openicf/salesforce',
          'DELETE provisioner.openicf/a',
        ]);
        for (const id of MALFORMED) {
          expect(output).toContain(
            `Connector definition ${JSON.stringify(id)} is listed with an id that is not a plain name`
          );
        }
        expect(output).toContain('7 of 11 connectors failed');
        // no request was sent whose path could name the configuration `managed`
        expect(
          requests().filter(({ method }) => method === 'DELETE')
        ).toHaveLength(4);
        expect(await held('managed')).toEqual({ _id: 'managed', objects: [] });
      },
      TIMEOUT
    );

    test(
      '--allow-failures keeps the exit code at 0, and sends the same four DELETEs',
      async () => {
        const { code, output } = await deleteConnectors(
          ['-y', '--allow-failures'],
          { tenant: { store: store() } }
        );

        expect(code).toBe(0);
        expect(changes()).toHaveLength(4);
        expect(output).toContain('7 of 11 connectors failed');
      },
      TIMEOUT
    );

    test(
      'a plan lists the plain names, names the others, sends no write, and exits 0',
      async () => {
        const { code, output } = await deleteConnectors(['-d'], {
          tenant: { store: store() },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        expect(output).toContain(
          'All 4 connector definitions would be deleted: Azure, GoogleApps, salesforce, a.'
        );
        expect(output).toContain('These listed ids are not plain names');
        expect(output).toContain('"provisioner.openicf/../managed"');
        expect(await held('managed')).toBeDefined();
      },
      TIMEOUT
    );

    test.each([
      ['../managed'],
      ['a#b'],
      ['a?b'],
      ['x/y'],
      ['a%2Fb'],
      ['a\u0001b'],
    ])(
      'a named delete of %j sends no DELETE, exits 1, also with --force -y, and the connector definition and the configuration that a path would have reached are still there',
      async (typed) => {
        for (const extra of [[], ['--force', '-y'], ['--allow-failures']]) {
          const { code, output } = await deleteConnectors(['-i', typed, ...extra], {
            tenant: { store: store() },
          });

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain('is listed with an id that is not a plain name');
          expect(requests().filter(({ method }) => method === 'DELETE')).toEqual(
            []
          );
          expect(await held('managed')).toBeDefined();
          expect(await held('provisioner.openicf/a')).toBeDefined();
        }
      },
      TIMEOUT
    );

    test(
      'a name that is odd but plain is deleted, and is written for the path: one DELETE each, with the escapes of a path',
      async () => {
        const odd = {
          'provisioner.openicf/my connector': connector('my connector'),
          'provisioner.openicf/a+b': connector('a+b'),
          'provisioner.openicf/caf\u00e9': connector('caf\u00e9'),
        };
        const { code, output } = await deleteConnectors(['-y'], {
          tenant: { store: odd },
        });

        expect(code).toBe(0);
        const deletes = requests()
          .filter(({ method }) => method === 'DELETE')
          .map(({ url }) => url.replace(/^.*\/openidm\/config\//, ''));
        expect(deletes).toEqual([
          'provisioner.openicf/Azure',
          'provisioner.openicf/GoogleApps',
          'provisioner.openicf/salesforce',
          'provisioner.openicf/my%20connector',
          'provisioner.openicf/a%2Bb',
          'provisioner.openicf/caf%C3%A9',
        ]);
        expect(output).toContain("Deleted connector definition 'my connector'.");
        for (const id of Object.keys(odd)) {
          expect([id, await held(id)]).toEqual([id, undefined]);
        }
      },
      TIMEOUT
    );

    test.each([
      ['a;b', 'a%3Bb'],
      ['a+b', 'a%2Bb'],
      ['a,b', 'a%2Cb'],
      ['a&b', 'a%26b'],
      ['a=b', 'a%3Db'],
    ])(
      'a named delete of %j sends the name written for a path (%s), as one DELETE, and removes that connector definition only',
      async (name, written) => {
        const { code } = await deleteConnectors(['-i', name], {
          tenant: {
            store: {
              [`provisioner.openicf/${name}`]: connector(name),
              'provisioner.openicf/a': connector('a'),
            },
          },
        });

        expect(code).toBe(0);
        const deletes = requests()
          .filter(({ method }) => method === 'DELETE')
          .map(({ url }) => url.replace(/^.*\/openidm\/config\//, ''));
        expect(deletes).toEqual([`provisioner.openicf/${written}`]);
        expect(await held(`provisioner.openicf/${name}`)).toBeUndefined();
        expect(await held('provisioner.openicf/a')).toBeDefined();
      },
      TIMEOUT
    );

    test(
      'an id with DEL or a control of U+0080 to U+009F is shown written out, not as the raw character, and nothing is sent for it',
      async () => {
        const { code, output } = await deleteConnectors(['-y'], {
          tenant: {
            store: {
              'provisioner.openicf/a\u007fb': {
                _id: 'provisioner.openicf/a\u007fb',
              },
              'provisioner.openicf/a\u0085b': {
                _id: 'provisioner.openicf/a\u0085b',
              },
            },
          },
        });

        expect(code).toBe(1);
        expect(output).toContain('"provisioner.openicf/a\\u007fb"');
        expect(output).toContain('"provisioner.openicf/a\\u0085b"');
        expect(output).toContain('2 of 5 connectors failed');
        expect(/[\u007f-\u009f]/.test(output)).toBe(false);
        expect(changes()).toHaveLength(3);
      },
      TIMEOUT
    );

    test(
      'a named delete of an odd but plain name deletes exactly that connector definition',
      async () => {
        const { code } = await deleteConnectors(['-i', 'my connector'], {
          tenant: {
            store: {
              'provisioner.openicf/my connector': connector('my connector'),
              'provisioner.openicf/my': connector('my'),
            },
          },
        });

        expect(code).toBe(0);
        expect(changes()).toEqual(['DELETE provisioner.openicf/my connector']);
        expect(await held('provisioner.openicf/my')).toBeDefined();
      },
      TIMEOUT
    );
  });

  describe('an application that names the connector definition owns it', () => {
    test(
      'the refusal names the command that removes both',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure'], {
          tenant: { managedObjects: APPLICATIONS },
        });

        expect(code).toBe(1);
        expect(output).toContain(
          'An application owns the connector definition that it names: config-manager delete apps removes both.'
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('deployments', () => {
    test(
      'a classic deployment is refused with the exit code 1 and nothing is deleted: no request for configuration objects is sent',
      async () => {
        const { code, output } = await deleteConnectors(['-i', 'Azure'], {
          deployment: 'classic',
          tenant: { journey: 'password' },
        });

        expect(code).toBe(1);
        expect(output).toContain("Command does not support deployment type 'classic'");
        expect(changes()).toEqual([]);
        expect(reads()).toEqual([]);
        expect(await held('provisioner.openicf/Azure')).toBeDefined();
      },
      TIMEOUT
    );
  });
});
