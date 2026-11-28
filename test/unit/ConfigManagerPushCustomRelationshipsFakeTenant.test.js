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
 * `frodo config-manager push managed-objects` writes the managed configuration, and then the custom
 * relationship schema files that `pull managed-objects --custom-relationships` leaves in the `schema`
 * folder of each object, one write for each file (FrConfigManagedObjectsImport.test.js has the
 * operation with a mocked library). Here the REAL CLI of this checkout is run against a fake tenant
 * (test/utils/FakeAm.mjs, in a separate process) through the real library, and the log of the
 * requests the tenant received says what would have reached it: what was written, in which order,
 * with which body, and what was not sent at all.
 *
 * The fake tenant keeps the managed configuration (`idmEntities`) and the relationship properties of
 * the v2 schema API (`idmSchemaProperties`) as a store that a write changes, so a push of a pulled
 * tree can be compared with what the tenant held before.
 *
 * No tenant, no secrets, no master key, no terminal; a temporary HOME and working directory keep it
 * away from real profiles and files. Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

/** A relationship schema as a real read answers it: `_id` and `required` included. */
const schemaOf = (object, property, reverse) => ({
  _id: property,
  description: `The ${property} of ${object}`,
  id: property,
  notifySelf: true,
  properties: { _ref: { type: 'string' } },
  required: false,
  resourceCollection: [
    {
      path: `managed/${reverse}`,
      label: reverse,
      query: { queryFilter: 'true', fields: ['userName'], sortKeys: [] },
    },
  ],
  returnByDefault: false,
  reversePropertyName: `${property}Of${object}`,
  reverseRelationship: true,
  searchable: false,
  title: property,
  type: 'relationship',
  userEditable: false,
  validate: true,
  viewable: true,
});

/** A managed object as the managed configuration holds it. */
const managedObject = (name, extra = {}) => ({
  name,
  schema: { type: 'object', properties: {} },
  ...extra,
});

const MANAGER = schemaOf('alpha_user', 'manager', 'alpha_user');
const REPORTS = schemaOf('alpha_user', 'reports', 'alpha_user');

/** The tree of a pull: alpha_role has no schema folder, alpha_user has two files. */
const TREE = {
  'managed-objects/alpha_role/alpha_role.json': managedObject('alpha_role'),
  'managed-objects/alpha_user/alpha_user.json': managedObject('alpha_user'),
  'managed-objects/alpha_user/schema/alpha_user.schema.manager.json': MANAGER,
  'managed-objects/alpha_user/schema/alpha_user.schema.reports.json': REPORTS,
};

/** What the tenant holds before: an object that the tree does not name, and no relationship property. */
const seedManaged = () => ({
  _id: 'managed',
  objects: [managedObject('alpha_group')],
});

suite(
  'push managed-objects pushes custom relationship schemas (fake tenant)',
  () => {
    let home;
    let work;
    let record;
    let fakeAm;

    beforeAll(() => {
      ensureFrodoArtifact();
    });

    beforeEach(() => {
      home = fs.mkdtempSync(
        path.join(os.tmpdir(), 'frodo-relationships-home-')
      );
      work = fs.mkdtempSync(
        path.join(os.tmpdir(), 'frodo-relationships-work-')
      );
      record = path.join(home, 'requests.jsonl');
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(work, { recursive: true, force: true });
    });

    /** Starts a fake tenant that holds the managed configuration and, unless `schemas` is false, the v2 schema API. */
    async function startTenant({
      managed = seedManaged(),
      schemas = {},
      failRequests,
      repoDs,
    } = {}) {
      fakeAm = await startFakeAm({
        journey: 'service-account',
        recordPath: record,
        idmEntities: {
          managed: structuredClone(managed),
          ...(repoDs ? { 'repo.ds': structuredClone(repoDs) } : {}),
        },
        ...(schemas === false ? {} : { idmSchemaProperties: schemas }),
        ...(failRequests ? { failRequests } : {}),
      });
    }

    /** Runs the CLI once against the tenant, without a terminal. */
    function runCli(args, { cwd = work, env = {} } = {}) {
      return new Promise((resolve, reject) => {
        const child = cp.spawn(
          binaryPath,
          [
            'config',
            ...args,
            `http://127.0.0.1:${fakeAm.port}/am`,
            'alpha',
            '--type',
            'cloud',
          ],
          {
            cwd,
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
              ...env,
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

    const push = (...args) => runCli(['push', 'managed-objects', ...args]);
    const pull = (...args) => runCli(['pull', 'managed-objects', ...args]);

    const write = (files, folder = work) => {
      for (const [relative, content] of Object.entries(files)) {
        const target = path.join(folder, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(
          target,
          typeof content === 'string' ? content : JSON.stringify(content)
        );
      }
    };

    /**
     * The requests that reached IDM, as `METHOD path-after-/openidm`, in order, with their bodies. The
     * read of the service account that a login makes is not one of the command.
     */
    const idm = () =>
      readRequests(record)
        .filter(
          ({ url }) =>
            url.includes('/openidm/') && !url.includes('/managed/svcacct/')
        )
        .map(({ method, url, body }) => ({
          method,
          url: url.split('/openidm')[1],
          body,
        }));
    const idmLines = () => idm().map(({ method, url }) => `${method} ${url}`);
    const configWrites = () =>
      idm().filter(
        ({ method, url }) => method === 'PUT' && url === '/config/managed'
      );
    const propertyWrites = () =>
      idm().filter(
        ({ method, url }) =>
          method === 'PUT' && url.startsWith('/schema/managed/')
      );
    const propertyPath = (type, property) =>
      `/schema/managed/${type}/properties/${property}?waitForCompletion=true`;

    /** What the tenant holds now, read through its own routes. */
    async function held() {
      const get = async (route) => {
        const response = await fetch(
          `http://127.0.0.1:${fakeAm.port}${route}`,
          {
            headers: { 'accept-api-version': 'resource=2.0' },
          }
        );
        return response.status === 200 ? response.json() : undefined;
      };
      return {
        managed: await get('/openidm/config/managed'),
        manager: await get(
          '/openidm/schema/managed/alpha_user/properties/manager'
        ),
        reports: await get(
          '/openidm/schema/managed/alpha_user/properties/reports'
        ),
      };
    }

    describe('every object', () => {
      it(
        'writes the configuration, then one schema write for each file, with the file as the body and the v2 header',
        async () => {
          write(TREE);
          await startTenant();

          const { code, output } = await push();

          expect(code).toBe(0);
          expect(output).not.toContain('failed');
          // the configuration first (one write), then the properties of alpha_user in the order of their file names
          expect(idmLines().filter((line) => line.startsWith('PUT'))).toEqual([
            'PUT /config/managed',
            `PUT ${propertyPath('alpha_user', 'manager')}`,
            `PUT ${propertyPath('alpha_user', 'reports')}`,
          ]);
          expect(
            JSON.parse(configWrites()[0].body).objects.map(({ name }) => name)
          ).toEqual(['alpha_role', 'alpha_user']);
          // the body is the file as pull wrote it, `_id` and `required` included
          expect(propertyWrites().map(({ body }) => JSON.parse(body))).toEqual([
            MANAGER,
            REPORTS,
          ]);
          // the fake answers a request without `accept-api-version: resource=2.0` with 400: the writes were stored
          expect(await held()).toMatchObject({
            manager: MANAGER,
            reports: REPORTS,
          });
        },
        TIMEOUT
      );

      it(
        'a tree without a schema folder is pushed as before: one write, and no schema request',
        async () => {
          write({
            'managed-objects/alpha_role/alpha_role.json':
              managedObject('alpha_role'),
          });
          await startTenant({ schemas: false });

          const { code } = await push();

          expect(code).toBe(0);
          expect(idmLines().filter((line) => line.startsWith('PUT'))).toEqual([
            'PUT /config/managed',
          ]);
          expect(idmLines().join('\n')).not.toContain('/schema/');
        },
        TIMEOUT
      );
    });

    describe('-i', () => {
      it(
        'writes that object and its own files only',
        async () => {
          write({
            ...TREE,
            'managed-objects/alpha_group/alpha_group.json':
              managedObject('alpha_group'),
            'managed-objects/alpha_group/schema/alpha_group.schema.owner.json':
              schemaOf('alpha_group', 'owner', 'alpha_user'),
          });
          await startTenant();

          const { code } = await push('-i', 'alpha_user');

          expect(code).toBe(0);
          expect(idmLines().filter((line) => line.startsWith('PUT'))).toEqual([
            'PUT /config/managed',
            `PUT ${propertyPath('alpha_user', 'manager')}`,
            `PUT ${propertyPath('alpha_user', 'reports')}`,
          ]);
          // the other objects of the tenant stay: one object was merged into the configuration
          expect(
            JSON.parse(configWrites()[0].body).objects.map(({ name }) => name)
          ).toEqual(['alpha_group', 'alpha_user']);
        },
        TIMEOUT
      );

      it(
        'an object without a schema folder writes no property',
        async () => {
          write(TREE);
          await startTenant();

          const { code } = await push('-i', 'alpha_role');

          expect(code).toBe(0);
          expect(propertyWrites()).toEqual([]);
          expect(configWrites()).toHaveLength(1);
        },
        TIMEOUT
      );

      it(
        'a name that matches no folder exits 1 and sends nothing, also with --allow-failures',
        async () => {
          write(TREE);
          await startTenant();

          const plain = await push('-i', 'nosuch');
          const allowed = await push('-i', 'nosuch', '--allow-failures');

          expect(plain.code).toBe(1);
          expect(allowed.code).toBe(1);
          expect(plain.output).toContain('nosuch');
          expect(idm()).toEqual([]);
        },
        TIMEOUT
      );

      it.each([
        ['..', `'..' does not name an object: an id or a name is not a path`],
        ['.', `'.' does not name an object: an id or a name is not a path`],
        ['../managed-objects/alpha_user', 'managed-objects%2Falpha_user'],
        ['a/b', 'a%2Fb'],
      ])(
        'the selector %j is no path: exit 1, nothing is sent, and nothing outside the folder is read',
        async (selector, says) => {
          write(TREE);
          // a decoy that the path would reach
          write({
            'decoy/decoy.json': managedObject('decoy-marker-5c1e'),
            'managed-objects/a/b/b.json': managedObject('decoy-marker-5c1e'),
          });
          await startTenant();

          const { code, output } = await push('-i', selector);

          expect(code).toBe(1);
          expect(output).toContain(says);
          expect(idm()).toEqual([]);
          expect(JSON.stringify(readRequests(record))).not.toContain(
            'decoy-marker-5c1e'
          );
        },
        TIMEOUT
      );
    });

    describe('placeholders', () => {
      const WITH_PLACEHOLDERS = {
        'managed-objects/alpha_user/alpha_user.json': managedObject(
          'alpha_user',
          {
            description: '${MO_DESC}',
          }
        ),
        'managed-objects/alpha_user/schema/alpha_user.schema.manager.json': {
          ...MANAGER,
          title: '${MO_TITLE}',
        },
      };

      it(
        'are filled from -E in the object and in a schema file',
        async () => {
          write(WITH_PLACEHOLDERS);
          await startTenant();

          const { code } = await push(
            '-E',
            'MO_DESC=hello',
            '-E',
            'MO_TITLE=Boss'
          );

          expect(code).toBe(0);
          expect(
            JSON.parse(configWrites()[0].body).objects.at(-1).description
          ).toBe('hello');
          expect(JSON.parse(propertyWrites()[0].body).title).toBe('Boss');
        },
        TIMEOUT
      );

      it.each([
        ['an object', ['-E', 'MO_TITLE=Boss']],
        ['a schema file', ['-E', 'MO_DESC=hello']],
      ])(
        'a missing variable in %s: exit 1, and nothing is sent, the configuration included',
        async (_where, args) => {
          write(WITH_PLACEHOLDERS);
          await startTenant();

          const { code, output } = await push(...args);

          expect(code).toBe(1);
          expect(output).toMatch(
            /No value found for placeholder "MO_(DESC|TITLE)"/
          );
          expect(idm()).toEqual([]);
        },
        TIMEOUT
      );
    });

    describe('a property that is refused', () => {
      it(
        'the others are still written, one summary names it, the command exits 1; --allow-failures exits 0',
        async () => {
          write(TREE);
          await startTenant({
            failRequests: [{ method: 'PUT', path: '/properties/manager' }],
          });

          const plain = await push();

          expect(plain.code).toBe(1);
          expect(propertyWrites().map(({ url }) => url)).toEqual([
            propertyPath('alpha_user', 'manager'),
            propertyPath('alpha_user', 'reports'),
          ]);
          expect(plain.output).toContain(
            'Error pushing relationship schema alpha_user.manager'
          );
          expect(plain.output).toContain('1 of 2 relationship schemas failed:');
          expect(plain.output).toContain(
            '- alpha_user.manager: fake tenant operation failed'
          );
          expect(plain.output).not.toContain('--allow-failures was given');
          expect((await held()).reports).toEqual(REPORTS);

          const allowed = await push('--allow-failures');

          expect(allowed.code).toBe(0);
          expect(allowed.output).toContain(
            '1 of 2 relationship schemas failed:'
          );
          expect(allowed.output).toContain(
            'The exit code stays 0 because --allow-failures was given.'
          );
        },
        TIMEOUT
      );

      it(
        'a tenant without the endpoint refuses every property: the configuration was written, exit 1, every file is named',
        async () => {
          write(TREE);
          await startTenant({ schemas: false });

          const { code, output } = await push();

          expect(code).toBe(1);
          expect(configWrites()).toHaveLength(1);
          expect(propertyWrites()).toHaveLength(2);
          expect(output).toContain('2 of 2 relationship schemas failed:');
          expect(output).toContain('- alpha_user.manager');
          expect(output).toContain('- alpha_user.reports');
        },
        TIMEOUT
      );

      it(
        'a refused configuration ends the command before any property, also with --allow-failures',
        async () => {
          write(TREE);
          await startTenant({
            failRequests: [{ method: 'PUT', path: '/config/managed' }],
          });

          const { code, output } = await push('--allow-failures');

          expect(code).toBe(1);
          expect(propertyWrites()).toEqual([]);
          expect(output).not.toContain('relationship schemas failed');
        },
        TIMEOUT
      );
    });

    describe('a file name that a request cannot carry', () => {
      it(
        'is one failed operation that names the file; a name that decodes to a plain one is written decoded',
        async () => {
          write({
            ...TREE,
            'managed-objects/alpha_user/schema/alpha_user.schema.custom%2Frel.json':
              MANAGER,
            'managed-objects/alpha_user/schema/alpha_user.schema.%2E%2E.json':
              MANAGER,
            'managed-objects/alpha_user/schema/alpha_user.schema.a%20b.json':
              MANAGER,
          });
          await startTenant();

          const { code, output } = await push();

          expect(code).toBe(1);
          expect(output).toContain('2 of 5 relationship schemas failed:');
          expect(output).toContain(
            'alpha_user/schema/alpha_user.schema.custom%2Frel.json'
          );
          expect(output).toContain(
            'alpha_user/schema/alpha_user.schema.%2E%2E.json'
          );
          // nothing was sent for the two names, and the other three were written
          expect(
            propertyWrites().map(({ url }) => url.split('/properties/')[1])
          ).toEqual([
            'a%20b?waitForCompletion=true',
            'manager?waitForCompletion=true',
            'reports?waitForCompletion=true',
          ]);
          expect(idmLines().join('\n')).not.toContain('custom');
          expect(idmLines().join('\n')).not.toContain('..');
        },
        TIMEOUT
      );
    });

    describe('a schema file that holds JSON that is not an object', () => {
      it(
        'is one failed operation that names the file: no write carries it, the others are written, and the exit is 1 (0 with --allow-failures)',
        async () => {
          write({
            ...TREE,
            'managed-objects/alpha_user/schema/alpha_user.schema.broken.json':
              'null',
            'managed-objects/alpha_user/schema/alpha_user.schema.list.json':
              '[1,2]',
          });
          await startTenant();

          const { code, output } = await push();

          expect(code).toBe(1);
          expect(output).toContain('2 of 4 relationship schemas failed:');
          expect(output).toContain(
            'alpha_user/schema/alpha_user.schema.broken.json: the file does not hold a JSON object'
          );
          expect(output).toContain(
            'alpha_user/schema/alpha_user.schema.list.json: the file does not hold a JSON object'
          );
          // the canary: nothing was sent for the two, the two others were written
          expect(
            propertyWrites().map(({ url }) => url.split('/properties/')[1])
          ).toEqual([
            'manager?waitForCompletion=true',
            'reports?waitForCompletion=true',
          ]);

          fs.rmSync(record, { force: true });
          const forgiven = await push('--allow-failures');
          expect(forgiven.code).toBe(0);
          expect(forgiven.output).toContain(
            'The exit code stays 0 because --allow-failures was given.'
          );
        },
        TIMEOUT
      );
    });

    describe('a folder that holds no managed object', () => {
      it(
        'sends nothing to the tenant, says why, and exits 1: an empty list would remove its managed objects',
        async () => {
          fs.mkdirSync(path.join(work, 'managed-objects'));
          await startTenant();

          const { code, output } = await push();

          expect(code).toBe(1);
          expect(output).toContain(
            'The managed-objects folder holds no managed object: nothing was sent'
          );
          expect(idm()).toEqual([]);
          // what the tenant holds is what it held
          expect(
            (await held()).managed.objects.map(({ name }) => name)
          ).toEqual(['alpha_group']);
        },
        TIMEOUT
      );
    });

    describe('a pull and a push of what it wrote', () => {
      /** A tenant that holds two relationship properties of alpha_user, with the mapping that makes them custom relationships. */
      const tenant = () => ({
        managed: {
          _id: 'managed',
          objects: [
            managedObject('alpha_role'),
            managedObject('alpha_user', {
              schema: {
                type: 'object',
                properties: {
                  manager: { type: 'relationship' },
                  reports: { type: 'relationship' },
                },
              },
            }),
          ],
        },
        schemas: { alpha_user: { manager: MANAGER, reports: REPORTS } },
        repoDs: {
          _id: 'repo.ds',
          resourceMapping: {
            genericMapping: {
              'managed/alpha_user': {
                properties: {
                  manager: {
                    type: 'reference',
                    ldapAttribute: 'fr-idm-reference-1',
                  },
                  reports: {
                    type: 'reference',
                    ldapAttribute: 'fr-idm-reference-2',
                  },
                },
              },
            },
          },
        },
      });

      /** Every file below a folder, with its content, by path. */
      const filesOf = (folder) => {
        const found = {};
        const visit = (current) => {
          for (const entry of fs.readdirSync(current, {
            withFileTypes: true,
          })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) visit(full);
            else
              found[path.relative(folder, full)] = fs.readFileSync(
                full,
                'utf8'
              );
          }
        };
        visit(folder);
        return found;
      };

      it(
        'pull with --custom-relationships writes the files, a second pull writes the same, and the push of that tree leaves the tenant as it was',
        async () => {
          await startTenant(tenant());
          const before = await held();

          const first = await pull('--custom-relationships');
          expect(first.code).toBe(0);
          expect(Object.keys(filesOf(work)).sort()).toEqual([
            'managed-objects/alpha_role/alpha_role.json',
            'managed-objects/alpha_user/alpha_user.json',
            'managed-objects/alpha_user/schema/alpha_user.schema.manager.json',
            'managed-objects/alpha_user/schema/alpha_user.schema.reports.json',
          ]);

          const second = fs.mkdtempSync(
            path.join(os.tmpdir(), 'frodo-relationships-second-')
          );
          try {
            expect(
              (
                await runCli(
                  ['pull', 'managed-objects', '--custom-relationships'],
                  { cwd: second }
                )
              ).code
            ).toBe(0);
            expect(filesOf(second)).toEqual(filesOf(work));
          } finally {
            fs.rmSync(second, { recursive: true, force: true });
          }

          const pushed = await push();

          expect(pushed.code).toBe(0);
          expect(propertyWrites()).toHaveLength(2);
          const after = await held();
          expect(after.manager).toEqual(before.manager);
          expect(after.reports).toEqual(before.reports);
          expect(after.managed.objects).toEqual(before.managed.objects);
        },
        TIMEOUT
      );
    });

    describe('the fake tenant route', () => {
      const route = (type, property) =>
        `http://127.0.0.1:${fakeAm.port}/openidm/schema/managed/${type}/properties/${property}`;
      const v2 = { 'accept-api-version': 'resource=2.0' };

      it(
        'stores a write and answers it, 404 for what it does not hold, 400 without the v2 header',
        async () => {
          await startTenant();

          expect(
            (await fetch(route('alpha_user', 'manager'), { headers: v2 }))
              .status
          ).toBe(404);
          const put = await fetch(
            `${route('alpha_user', 'manager')}?waitForCompletion=true`,
            {
              method: 'PUT',
              headers: { ...v2, 'content-type': 'application/json' },
              body: JSON.stringify(MANAGER),
            }
          );
          expect(put.status).toBe(200);
          expect(await put.json()).toEqual(MANAGER);
          expect(
            await (
              await fetch(route('alpha_user', 'manager'), { headers: v2 })
            ).json()
          ).toEqual(MANAGER);
          expect((await fetch(route('alpha_user', 'manager'))).status).toBe(
            400
          );
          expect(
            (
              await fetch(route('alpha_user', 'manager'), {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: '{}',
              })
            ).status
          ).toBe(400);
        },
        TIMEOUT
      );

      it(
        'answers 404 to every request when it holds no store, as an IDM below 7.5 does',
        async () => {
          await startTenant({ schemas: false });

          expect(
            (await fetch(route('alpha_user', 'manager'), { headers: v2 }))
              .status
          ).toBe(404);
          expect(
            (
              await fetch(route('alpha_user', 'manager'), {
                method: 'PUT',
                headers: { ...v2, 'content-type': 'application/json' },
                body: JSON.stringify(MANAGER),
              })
            ).status
          ).toBe(404);
        },
        TIMEOUT
      );
    });
  }
);
