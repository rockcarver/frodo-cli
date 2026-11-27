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
 * `config-manager delete services`, the REAL CLI of this checkout against a fake
 * tenant (test/utils/FakeAm.mjs, in a separate process, with the services of
 * three realms as a store that a delete changes) and the real library. What the
 * unit tests stub, this shows in the log of the requests the tenant received,
 * and in what the tenant holds afterwards (a dry run after the delete lists what
 * is left):
 *
 * - a delete of all services sends exactly the deletes of what `pull services`
 *   covers in every realm, a next descendent before its service, and leaves
 *   DataStoreService alone; one realm limits it; the root realm is skipped on
 *   Cloud and processed on ForgeOps and Classic;
 * - a named delete is looked up in what the realm lists, and the typed text
 *   (another case, a path, a fragment) never reaches a request; one that is not
 *   there deletes nothing and exits 1;
 * - a listed id that is not a plain name is never deleted;
 * - one service that fails does not stop the others: the summary names it, the
 *   exit is 1, and `--allow-failures` keeps it at 0 for a failed delete only;
 * - a service that Cloud does not offer is skipped;
 * - a dry run sends nothing but reads, and without a terminal and without -y the
 *   delete is refused before the login: no request at all;
 * - on a terminal the question follows a plan and a no deletes nothing.
 *
 * No tenant, no secrets, no recordings; a temporary HOME and working directory
 * keep it away from real profiles and files. Skipped on Windows: the CLI binary
 * shim is a shell script. What the operation does with each answer of the
 * library is in FrConfigServicesDelete.test.js, the command line in
 * ConfigManagerDeleteServicesCommand.test.js.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const ptySuite = hasPty ? describe : describe.skip;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

/** A service of the store: its id and its next descendents as `[type, id]`. */
const service = (id, descendents = []) => ({
  _id: id,
  nextDescendents: descendents.map(([type, descendentId]) => ({
    _id: descendentId,
    _type: { _id: type },
  })),
});

/** What the tenant holds before every test: the services of three realms. */
const STORE = () => ({
  realms: {
    '/': [service('session'), service('baseurl'), service('DataStoreService')],
    alpha: [
      service('email', [['smtpTransports', 'SMTP']]),
      service('id-repositories', [['LDAPv3ForForgeRockIAM', 'OpenDJ']]),
      service('session'),
      service('DataStoreService'),
      service('custom'),
    ],
    bravo: [service('session'), service('validation')],
  },
});

/** The deletes that a delete of everything sends for the store above, in the order of the realms. */
const ALL_DELETES = [
  'DELETE /json/realms/root/realm-config/services/session',
  'DELETE /json/realms/root/realm-config/services/baseurl',
  'DELETE /json/realms/root/realms/alpha/realm-config/services/email/smtpTransports/SMTP',
  'DELETE /json/realms/root/realms/alpha/realm-config/services/email',
  'DELETE /json/realms/root/realms/alpha/realm-config/services/id-repositories/LDAPv3ForForgeRockIAM/OpenDJ',
  'DELETE /json/realms/root/realms/alpha/realm-config/services/id-repositories',
  'DELETE /json/realms/root/realms/alpha/realm-config/services/session',
  'DELETE /json/realms/root/realms/alpha/realm-config/services/custom',
  'DELETE /json/realms/root/realms/bravo/realm-config/services/session',
  'DELETE /json/realms/root/realms/bravo/realm-config/services/validation',
];

suite('config-manager delete services (fake tenant)', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-services-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-services-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a tenant with the store and whatever else the test gives; it keeps its state until the test ends. */
  async function startTenant({
    store = STORE(),
    realms = ['/', 'alpha', 'bravo'],
    cloud = false,
    ...options
  } = {}) {
    fakeAm?.stop();
    fs.rmSync(record, { force: true });
    fakeAm = await startFakeAm({
      recordPath: record,
      // a Cloud tenant logs in with a service account, ForgeOps (the default here) needs the OAuth2 answers
      journey: cloud ? 'service-account' : 'password',
      logApiKeys: cloud ? undefined : [],
      realms,
      realmServices: store,
      ...options,
    });
  }

  /** Runs `frodo config-manager delete services <args>` once against the running tenant, without a terminal. */
  function runCli(args, { mode = 'forgeops', realm } = {}) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          'config-manager',
          'delete',
          'services',
          ...args,
          `http://127.0.0.1:${fakeAm.port}/am`,
          ...(realm ? [realm] : []),
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
  /** Every request for a service, as `METHOD path` without the `/am` of the host. */
  const serviceRequests = () =>
    requests()
      .filter(({ url }) => url.includes('/services'))
      .map(({ method, url }) => `${method} ${url.replace(/^\/am/, '')}`);
  /** What the tenant was asked to delete, as `DELETE path`. */
  const deletes = () =>
    serviceRequests().filter((request) => request.startsWith('DELETE'));
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

  describe('a delete of all services', () => {
    test(
      'sends exactly the deletes of what pull services covers in every realm, a next descendent before its service, and nothing for DataStoreService',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-y']);

        expect(code).toBe(0);
        expect(deletes()).toEqual(ALL_DELETES);
        expect(output).toContain(
          "Deleted service 'email' in realm 'alpha' (with next descendents: smtpTransports/SMTP)."
        );
        expect(output).toContain("Deleted service 'session' in realm '/'.");
        expect(output).toContain(
          "Deleted service 'validation' in realm 'bravo'."
        );
        expect(output).not.toContain('failed');
        // the store afterwards: a dry run finds nothing to delete, and still sees DataStoreService
        fs.rmSync(record, { force: true });
        const after = await runCli(['-d']);
        expect(after.code).toBe(0);
        expect(after.output).toContain(
          "No services found to delete in realm 'alpha'."
        );
        expect(after.output).toContain(
          'DataStoreService is never deleted by a delete of all services.'
        );
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a next descendent is deleted before its service, and a service is deleted after the read of every realm',
      async () => {
        await startTenant();

        await runCli(['-y']);

        const log = serviceRequests();
        const smtp = log.findIndex((request) =>
          request.endsWith('/email/smtpTransports/SMTP')
        );
        const email = log.findIndex(
          (request) =>
            request.startsWith('DELETE') && request.endsWith('/services/email')
        );
        expect(smtp).toBeGreaterThan(-1);
        expect(smtp).toBeLessThan(email);
        // every realm was read before the first delete
        const firstDelete = log.findIndex((request) =>
          request.startsWith('DELETE')
        );
        const lastRead = log.findLastIndex((request) =>
          request.startsWith('GET')
        );
        expect(lastRead).toBeLessThan(firstDelete);
      },
      TIMEOUT
    );

    test(
      'a realm limits it to that realm: the other realms are not even read',
      async () => {
        await startTenant();

        const { code } = await runCli(['-y'], { realm: 'bravo' });

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/bravo/realm-config/services/session',
          'DELETE /json/realms/root/realms/bravo/realm-config/services/validation',
        ]);
        expect(
          serviceRequests().filter(
            (request) => !request.includes('/realms/bravo/')
          )
        ).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a dry run sends nothing but reads, and lists the realms, the services, the next descendents and what a realm depends on',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-d']);

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        expect(deletes()).toEqual([]);
        expect(output).toContain(
          'Dry run: nothing is deleted. 8 services in 3 realms (/, alpha, bravo) would be deleted, each with its next descendents.'
        );
        expect(output).toContain(
          '- id-repositories (1 next descendent): the identity stores of the realm go with it'
        );
        expect(output).toContain('- custom');
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
          'Refusing to delete all services in the selected realms without confirmation'
        );
        expect(output).toContain('-y/--yes');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    test.each([
      ['ForgeOps', 'forgeops', {}],
      ['Classic', 'classic', { logApiKeys: undefined }],
    ])(
      'on %s the root realm is processed',
      async (_name, mode, options) => {
        await startTenant(options);

        const { code } = await runCli(['-y'], { mode });

        expect(code).toBe(0);
        expect(deletes()).toEqual(ALL_DELETES);
      },
      TIMEOUT
    );

    test(
      'on Cloud the root realm is skipped, and not even read',
      async () => {
        await startTenant({ cloud: true, realms: ['/', 'alpha', 'bravo'] });

        const { code } = await runCli(['-y'], { mode: 'cloud' });

        expect(code).toBe(0);
        expect(deletes()).toEqual(ALL_DELETES.slice(2));
        expect(
          serviceRequests().filter((request) =>
            request.includes('/realms/root/realm-config/')
          )
        ).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'on Cloud a service that the tenant does not offer is skipped, and the rest is deleted',
      async () => {
        await startTenant({
          cloud: true,
          store: { ...STORE(), unavailable: ['session'] },
        });

        const { code, output } = await runCli(['-y'], { mode: 'cloud' });

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/email/smtpTransports/SMTP',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/email',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/id-repositories/LDAPv3ForForgeRockIAM/OpenDJ',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/id-repositories',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/custom',
          'DELETE /json/realms/root/realms/bravo/realm-config/services/validation',
        ]);
        expect(output).not.toContain('failed');
      },
      TIMEOUT
    );

    test(
      'one service that fails does not stop the others: the summary names it, the exit is 1, and --allow-failures keeps the exit at 0',
      async () => {
        await startTenant({
          failRequests: [
            { method: 'DELETE', path: '/realm-config/services/session' },
            { method: 'DELETE', path: '/alpha/realm-config/services/custom' },
          ],
        });

        const failed = await runCli(['-y']);

        expect(failed.code).toBe(1);
        // the others were deleted, and the failed ones were tried
        expect(deletes()).toEqual(ALL_DELETES);
        expect(failed.output).toContain('4 of 8 services failed:');
        expect(failed.output).toContain(
          '- root/session: fake tenant operation failed'
        );
        expect(failed.output).toContain(
          '- alpha/session: fake tenant operation failed'
        );
        expect(failed.output).toContain(
          '- alpha/custom: fake tenant operation failed'
        );
        expect(failed.output).toContain(
          '- bravo/session: fake tenant operation failed'
        );
        expect(failed.output).toContain(
          "Deleted service 'validation' in realm 'bravo'."
        );

        // the failed ones are still there: a second run finds exactly them
        await startTenant({
          failRequests: [
            { method: 'DELETE', path: '/realm-config/services/session' },
          ],
        });
        const allowed = await runCli(['-y', '--allow-failures']);
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain('3 of 8 services failed:');
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
      },
      TIMEOUT
    );

    test(
      'a realm whose services cannot be listed is one failed operation, and the other realms are deleted; --allow-failures keeps the exit at 0 for it, like for any failed operation',
      async () => {
        // the tenant lists the realm bravo, and the store does not hold it: the list answers 404
        const store = STORE();
        delete store.realms.bravo;
        await startTenant({ store });

        const failed = await runCli(['-y']);
        expect(failed.code).toBe(1);
        expect(deletes()).toEqual(ALL_DELETES.slice(0, 8));
        expect(failed.output).toContain('1 of 7 services failed:');
        expect(failed.output).toContain('- realm bravo:');

        await startTenant({ store });
        const allowed = await runCli(['-y', '--allow-failures']);
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain('- realm bravo:');
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
        expect(allowed.output).not.toContain('does not apply');
      },
      TIMEOUT
    );

    test(
      'a service that cannot be read is failed and not deleted, and the others are deleted',
      async () => {
        await startTenant({
          failRequests: [
            { method: 'GET', path: '/alpha/realm-config/services/custom' },
          ],
        });

        const { code, output } = await runCli(['-y'], { realm: 'alpha' });

        expect(code).toBe(1);
        expect(
          deletes().some((request) => request.endsWith('/services/custom'))
        ).toBe(false);
        expect(
          deletes().some((request) => request.endsWith('/services/email'))
        ).toBe(true);
        expect(output).toContain('1 of 4 services failed:');
        expect(output).toContain('- alpha/custom');
      },
      TIMEOUT
    );

    test(
      'a listed id that is not a plain name is never deleted: the others are, the exit is 1, and the summary names each',
      async () => {
        await startTenant({
          store: {
            realms: {
              alpha: [
                service('email'),
                service('../realms/root'),
                service('a#b'),
                service('x/y'),
              ],
            },
          },
          realms: ['alpha'],
        });

        const { code, output } = await runCli(['-y'], { realm: 'alpha' });

        expect(code).toBe(1);
        // only a plain name was deleted, and no delete carries any of the others
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/email',
        ]);
        expect(output).toContain('3 of 4 services failed:');
        for (const hostile of ['../realms/root', 'a#b', 'x/y']) {
          expect(output).toContain(`- alpha/${hostile}`);
        }
        // the tenant can read the service with the slash, so it is the plain-name rule that stops it
        expect(output).toContain(
          "Service 'x/y' is listed in realm 'alpha' with an id that is not a plain name"
        );
        expect(output).toContain('- alpha/x/y: its id is not a plain name');
        expect(
          requests().some(({ url }) => url.endsWith('/services/x/y'))
        ).toBe(true);
      },
      TIMEOUT
    );
  });

  describe('a next descendent that is not a plain name', () => {
    // the library builds the delete of a next descendent from its type and its id as the realm lists them
    const HOSTILE = [
      [
        ['smtpTransports', '../../session'],
        'an id that climbs out of the service',
      ],
      [['../session', 'x'], 'a type that climbs out of the service'],
      [['smtpTransports', 'a#b'], 'an id with a fragment'],
      [['smtpTransports', 'q?x'], 'an id with a query'],
    ];
    const storeWith = (descendent) => ({
      realms: {
        alpha: [
          service('custom'),
          service('email', [descendent, ['smtpTransports', 'SMTP']]),
          service('session'),
        ],
      },
    });

    test.each(HOSTILE)(
      'a delete of all services with the next descendent %j (%s) sends not one delete for that service, nor for another one that the descendent names',
      async (descendent) => {
        await startTenant({ store: storeWith(descendent), realms: ['alpha'] });

        const { code, output } = await runCli(['-y'], { realm: 'alpha' });

        expect(code).toBe(1);
        // exactly the deletes of the two other services: a delete built from the descendent would
        // be one more request, and would name the service session or a path below it
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/custom',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/session',
        ]);
        expect(output).toContain('1 of 3 services failed:');
        expect(output).toContain(
          `- alpha/email: its next descendent ${descendent[0]}/${descendent[1]} has a type or an id that is not a plain name`
        );
        expect(output).toContain('is listed in realm');
      },
      TIMEOUT
    );

    test.each(HOSTILE)(
      'a named delete of a service with the next descendent %j (%s) sends no delete, with a dry run and with --allow-failures too, and exits 1',
      async (descendent) => {
        await startTenant({ store: storeWith(descendent), realms: ['alpha'] });

        for (const extra of [[], ['-d'], ['--allow-failures']]) {
          const { code, output } = await runCli(['-i', 'email', ...extra], {
            realm: 'alpha',
          });
          expect([extra.join(' '), code]).toEqual([extra.join(' '), 1]);
          expect(output).toContain(
            `Next descendent '${descendent[0]}/${descendent[1]}' of service 'email'`
          );
        }
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a dry run of all services fails like the real run for it, and sends nothing but reads',
      async () => {
        await startTenant({
          store: storeWith(['smtpTransports', '../../session']),
          realms: ['alpha'],
        });

        const { code, output } = await runCli(['-d'], { realm: 'alpha' });

        expect(code).toBe(1);
        expect(changes()).toEqual([]);
        expect(output).toContain('1 of 3 services failed:');
        expect(output).toContain('- alpha/email: its next descendent');
        expect(output).toContain('smtpTransports/../../session');
      },
      TIMEOUT
    );

    test(
      'a service with two of them is one failed service, and the tenant is asked to delete only the others',
      async () => {
        await startTenant({
          store: {
            realms: {
              alpha: [
                service('custom'),
                service('email', [
                  ['smtpTransports', '../../session'],
                  ['smtpTransports', 'a#b'],
                ]),
                service('session'),
              ],
            },
          },
          realms: ['alpha'],
        });

        const { code, output } = await runCli(['-y'], { realm: 'alpha' });

        expect(code).toBe(1);
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/custom',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/session',
        ]);
        expect(output).toContain('1 of 3 services failed:');
        expect(output).not.toContain('2 of 3 services failed');
        expect(output).toContain(
          '- alpha/email: its next descendents smtpTransports/../../session, smtpTransports/a#b have a type or an id that is not a plain name'
        );
      },
      TIMEOUT
    );
  });

  describe('a realm that the tenant lists with a name that is not a realm name', () => {
    test(
      'is one failed operation, no request carries it, and the services of the other realm are deleted',
      async () => {
        await startTenant({
          store: {
            realms: {
              alpha: [service('custom')],
              beta: [service('session')],
            },
          },
          realms: ['alpha', '../beta'],
        });

        const { code, output } = await runCli(['-y']);

        expect(code).toBe(1);
        expect(output).toContain('- realm ../beta:');
        expect(output).toContain('1 of 2 services failed:');
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/custom',
        ]);
        // nothing at all went to a path of that realm: not a read, not a delete
        expect(requests().some(({ url }) => url.includes('beta'))).toBe(false);
      },
      TIMEOUT
    );
  });

  describe('a named delete', () => {
    test(
      'deletes the listed service with its next descendents and says what went with it',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-i', 'email'], {
          realm: 'alpha',
        });

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/email/smtpTransports/SMTP',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/email',
        ]);
        expect(output).toContain(
          "Deleted service 'email' in realm 'alpha' (with next descendents: smtpTransports/SMTP)."
        );
        expect(output).toContain(
          "Service 'email' is one that a realm commonly depends on"
        );
      },
      TIMEOUT
    );

    test.each([['-i'], ['-n'], ['--name'], ['--service-id']])(
      '%s names the service, and the terminal is never asked',
      async (flag) => {
        await startTenant();

        const { code } = await runCli([flag, 'custom'], { realm: 'alpha' });

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/custom',
        ]);
      },
      TIMEOUT
    );

    test.each([
      ['NOPE'],
      ['Email'],
      [' email'],
      ['email/'],
      ['../realms/root'],
      ['a#b'],
      ['x/y'],
      ['ema'],
      ['%65mail'],
    ])(
      '%j is not a service of the realm: nothing is deleted, the command exits 1, and the typed text never reaches the tenant',
      async (typed) => {
        await startTenant();

        const { code, output } = await runCli(['-i', typed], {
          realm: 'alpha',
        });

        expect(code).toBe(1);
        expect(output).toContain(
          `Service '${typed}' not found in realm 'alpha'.`
        );
        expect(deletes()).toEqual([]);
        expect(changes()).toEqual([]);
        // not one request, read or write, carries the typed text, in any of its spellings (unless it is a part of an id that the realm lists, which the reads name)
        if (
          !['email', 'session', 'custom', 'id-repositories'].some((id) =>
            id.includes(typed)
          )
        ) {
          for (const request of requests()) {
            expect(request.url).not.toContain(typed);
            expect(request.url).not.toContain(encodeURIComponent(typed));
          }
        }
      },
      TIMEOUT
    );

    test.each([
      ['a real run', []],
      ['a dry run', ['-d']],
      ['--allow-failures', ['--allow-failures']],
    ])(
      'a service that is not there exits 1 in %s',
      async (_name, extra) => {
        await startTenant();

        const { code, output } = await runCli(['-i', 'nope', ...extra], {
          realm: 'alpha',
        });

        expect(code).toBe(1);
        expect(output).toContain("Service 'nope' not found in realm 'alpha'.");
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a service of another realm is not found in this one',
      async () => {
        await startTenant();

        const { code } = await runCli(['-i', 'validation'], { realm: 'alpha' });

        expect(code).toBe(1);
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a dry run sends nothing but reads, and says what would be deleted',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-i', 'email', '-d'], {
          realm: 'alpha',
        });

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        expect(output).toContain(
          "Dry run: Deleting service 'email' in realm 'alpha'."
        );
        expect(output).toContain(
          'Next descendents that go with it: smtpTransports/SMTP'
        );
      },
      TIMEOUT
    );

    test.each([
      ['a real run', []],
      ['a dry run', ['-d']],
      ['--allow-failures', ['--allow-failures']],
    ])(
      'a service that is not there exits 1 in %s even when another service of the realm cannot be read',
      async (_name, extra) => {
        await startTenant({
          failRequests: [
            { method: 'GET', path: '/alpha/realm-config/services/custom' },
          ],
        });

        const { code, output } = await runCli(['-i', 'nope', ...extra], {
          realm: 'alpha',
        });

        expect(code).toBe(1);
        expect(output).toContain("Service 'nope' not found in realm 'alpha'.");
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'another service of the realm that cannot be read is a warning: the named service is deleted and the exit is 0',
      async () => {
        await startTenant({
          failRequests: [
            { method: 'GET', path: '/alpha/realm-config/services/custom' },
          ],
        });

        const { code, output } = await runCli(['-i', 'email'], {
          realm: 'alpha',
        });

        expect(code).toBe(0);
        expect(deletes()).toEqual([
          'DELETE /json/realms/root/realms/alpha/realm-config/services/email/smtpTransports/SMTP',
          'DELETE /json/realms/root/realms/alpha/realm-config/services/email',
        ]);
        expect(output).toContain(
          "Service 'custom' of realm 'alpha' could not be read, and was not named"
        );
        expect(output).not.toContain('services failed');
      },
      TIMEOUT
    );

    test(
      'a named service that cannot be read is a failure, which --allow-failures keeps at exit 0',
      async () => {
        await startTenant({
          failRequests: [
            { method: 'GET', path: '/alpha/realm-config/services/custom' },
          ],
        });

        const failed = await runCli(['-i', 'custom'], { realm: 'alpha' });
        expect(failed.code).toBe(1);
        expect(failed.output).toContain('1 of 1 service failed:');
        expect(failed.output).toContain('- alpha/custom');
        const allowed = await runCli(['-i', 'custom', '--allow-failures'], {
          realm: 'alpha',
        });
        expect(allowed.code).toBe(0);
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a service that the tenant does not offer is not read, so it is not found, as with pull services',
      async () => {
        await startTenant({
          cloud: true,
          store: { ...STORE(), unavailable: ['session'] },
        });

        const { code, output } = await runCli(['-i', 'session'], {
          mode: 'cloud',
          realm: 'alpha',
        });

        expect(code).toBe(1);
        expect(output).toContain(
          "Service 'session' not found in realm 'alpha'."
        );
        expect(deletes()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'a delete that the tenant refuses exits 1, names the service, and --allow-failures keeps the exit at 0',
      async () => {
        await startTenant({
          failRequests: [
            { method: 'DELETE', path: '/alpha/realm-config/services/custom' },
          ],
        });

        const failed = await runCli(['-i', 'custom'], { realm: 'alpha' });
        expect(failed.code).toBe(1);
        expect(failed.output).toContain('1 of 1 service failed:');
        expect(failed.output).toContain(
          '- alpha/custom: fake tenant operation failed'
        );

        const allowed = await runCli(['-i', 'custom', '--allow-failures'], {
          realm: 'alpha',
        });
        expect(allowed.code).toBe(0);
      },
      TIMEOUT
    );

    test(
      'without a realm it is an error before the login, and prints the error only',
      async () => {
        await startTenant();

        const { code, output } = await runCli(['-i', 'email', '-y']);

        expect(code).toBe(1);
        expect(output).toContain(
          'The -i, --service-id option requires a realm argument to be specified.'
        );
        expect(output).not.toContain('Usage:');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    test.each([
      [`' '`, ' '],
      [`'  '`, '  '],
    ])(
      'a blank id (%s) is refused before the login and is never "all"',
      async (_shown, blank) => {
        await startTenant();

        const { code, output } = await runCli(['-i', blank, '-y'], {
          realm: 'alpha',
        });

        expect(code).toBe(1);
        expect(output).toContain('The service id (-i) must not be empty');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    test(
      'an empty id is refused while the command line is parsed, even with -y: no request',
      async () => {
        await startTenant();

        for (const args of [
          ['-i', ''],
          ['-n', ''],
          ['--name', ''],
          ['--name='],
        ]) {
          const { code, output } = await runCli([...args, '-y'], {
            realm: 'alpha',
          });
          expect([args.join(' '), code]).toEqual([args.join(' '), 1]);
          expect(output).toContain('An empty value never selects all objects');
        }
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });
});

ptySuite('config-manager delete services, on a real terminal', () => {
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
      realmServices: {
        realms: {
          alpha: [
            service('email', [['smtpTransports', 'SMTP']]),
            service('session'),
          ],
          bravo: [service('validation')],
        },
      },
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  /** Runs the command on a terminal with the given answers and says what happened. */
  function onTerminal(actions, { realm } = {}) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { FRODO_SA_ID: 'test-account', FRODO_SA_JWK: serviceAccountJwk },
      args: [
        'config',
        'delete',
        'services',
        `http://127.0.0.1:${fakeAm.port}/am`,
        ...(realm ? [realm] : []),
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
  const ENDED = { type: 'wait_exit', timeoutMs: 60000 };
  const deletesSent = () =>
    readRequests(recordPath).filter(({ method }) => method === 'DELETE');

  test(
    'the question follows a plan that names the realms, the count and the services, and a no deletes nothing',
    () => {
      const result = onTerminal([
        QUESTION,
        { type: 'send_line', text: 'n' },
        ENDED,
      ]);

      const plain = result.plainOutput;
      expect(plain).toContain(
        'Plan: 3 services in 2 realms (alpha, bravo) would be deleted, each with its next descendents.'
      );
      expect(plain).toContain("Realm 'alpha' (2 services):");
      expect(plain).toContain(
        '- email (1 next descendent): the sender address and the mail transports of the realm go with it'
      );
      expect(plain).toContain("Realm 'bravo' (1 service):");
      // the plan comes before the question, which asks about all services of the selected realms
      expect(plain.indexOf('Plan: 3 services')).toBeLessThan(
        plain.indexOf(
          'This permanently deletes all services in the selected realms'
        )
      );
      expect(plain).toContain('Delete aborted.');
      expect(deletesSent()).toEqual([]);
      expect(result.exitCode).toBe(1);
    },
    TIMEOUT
  );

  test(
    'the question of a run over every realm names the realms of the plan and no realm of its own',
    () => {
      const result = onTerminal([
        QUESTION,
        { type: 'send_line', text: 'n' },
        ENDED,
      ]);

      const question = result.plainOutput
        .split('\n')
        .find((line) =>
          line.includes(
            'This permanently deletes all services in the selected realms'
          )
        );
      expect(question).toMatch(/from http:\/\/127\.0\.0\.1:\d+\/am\.\s*$/);
      expect(question).not.toContain('(realm');
      expect(deletesSent()).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'the question of a run over one realm names that realm',
    () => {
      const result = onTerminal(
        [QUESTION, { type: 'send_line', text: 'n' }, ENDED],
        { realm: 'alpha' }
      );

      const question = result.plainOutput
        .split('\n')
        .find((line) =>
          line.includes(
            'This permanently deletes all services in the selected realms'
          )
        );
      expect(question).toMatch(/\(realm alpha\)\.\s*$/);
      expect(result.plainOutput).toContain(
        'Plan: 2 services in 1 realm (alpha) would be deleted'
      );
    },
    TIMEOUT
  );

  test(
    'a plan with an id that is not a plain name stops before the question, and says so: nothing is asked, nothing is deleted, exit 1',
    async () => {
      fakeAm.stop();
      fakeAm = await startFakeAm({
        journey: 'service-account',
        recordPath,
        realms: ['alpha'],
        realmServices: {
          realms: {
            alpha: [service('email'), service('x/y'), service('session')],
          },
        },
      });

      const result = onTerminal([{ type: 'wait_exit', timeoutMs: 60000 }]);

      const plain = result.plainOutput;
      expect(plain).toContain(
        'Plan: 2 services in 1 realm (alpha) would be deleted'
      );
      // the refused id is named, and the one sentence says what stops the delete and what to do
      expect(plain).toContain('alpha/x/y');
      expect(plain).toContain('Nothing was asked');
      expect(plain).toContain('nothing was deleted');
      expect(plain).not.toContain('Continue?');
      expect(plain).not.toContain('This permanently deletes');
      expect(deletesSent()).toEqual([]);
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

      expect(deletesSent()).toEqual([]);
      expect(result.exitCode).toBe(1);
    },
    TIMEOUT
  );

  test(
    'a yes deletes every service of the realms it named',
    () => {
      const result = onTerminal([
        QUESTION,
        { type: 'send_line', text: 'y' },
        ENDED,
      ]);

      expect(deletesSent().map(({ url }) => url.replace(/^\/am/, ''))).toEqual([
        '/json/realms/root/realms/alpha/realm-config/services/email/smtpTransports/SMTP',
        '/json/realms/root/realms/alpha/realm-config/services/email',
        '/json/realms/root/realms/alpha/realm-config/services/session',
        '/json/realms/root/realms/bravo/realm-config/services/validation',
      ]);
      expect(result.plainOutput).toContain(
        "Deleted service 'validation' in realm 'bravo'."
      );
      expect(result.exitCode).toBe(0);
    },
    TIMEOUT
  );
});
