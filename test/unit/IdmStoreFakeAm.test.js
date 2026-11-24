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
 * The IDM store of the fake tenant (test/utils/FakeAm.mjs): the configuration
 * objects it serves from `idmEntities` (a list, a delete next to the read and
 * the write that were there) and the managed objects it serves from
 * `managedObjects` (the application records of a realm, by type name). They are
 * what a command needs that looks at several configuration objects before it
 * deletes one: the fake must answer the reads such a command sends, and a
 * request it does not know must fail loudly, never read as "nothing there".
 *
 * Direct HTTP against the fake, which runs as a separate process, and its
 * request log; then the real CLI of this checkout against it for the connector
 * list and the connector delete, which go through the real library. No tenant,
 * no secrets, no recordings.
 */

const TIMEOUT = 120000;

/** The failure that every route of the fake answers an unknown id with. */
const NOT_FOUND = { code: 404, reason: 'Not Found', message: 'Not Found' };

/** What the tenant holds, in this order (the order of the lists). */
const STORE = {
  sync: {
    _id: 'sync',
    mappings: [
      {
        name: 'managedAlpha_user_systemZion',
        source: 'managed/alpha_user',
        target: 'system/zion/account',
      },
    ],
  },
  'provisioner.openicf/zion': {
    _id: 'provisioner.openicf/zion',
    name: 'zion',
    enabled: true,
  },
  'provisioner.openicf/matrix': {
    _id: 'provisioner.openicf/matrix',
    name: 'matrix',
    enabled: false,
  },
  'provisioner.openicf.connectorinfoprovider': {
    _id: 'provisioner.openicf.connectorinfoprovider',
    remoteConnectorClients: [{ name: 'matrix-server', enabled: true }],
  },
  'mapping/managedAlpha_user_systemZion': {
    _id: 'mapping/managedAlpha_user_systemZion',
    source: 'managed/alpha_user',
    target: 'system/zion/account',
  },
  // an id that merely starts with the word, as IDM lists it for a prefix
  mappingOracle: { _id: 'mappingOracle', note: 'starts with the word only' },
  'schedule/zion-live-sync': {
    _id: 'schedule/zion-live-sync',
    enabled: false,
    invokeContext: { source: 'system/zion/account' },
  },
  authentication: {
    _id: 'authentication',
    rsFilter: { subjectMapping: [{ queryOnResource: 'managed/alpha_user' }] },
  },
};

/** The application records of realm alpha, as the list of a managed type answers them. */
const APPLICATIONS = {
  alpha_application: [
    { _id: 'a-1', _rev: '1', name: 'Zion', connectorId: 'zion', icon: 'z.png' },
    { _id: 'a-2', _rev: '1', name: 'Matrix', connectorId: 'matrix' },
    { _id: 'a-3', _rev: '1', name: 'Plain', icon: 'p.png' },
  ],
};

const ids = (answer) => answer.result.map(({ _id }) => _id);

describe('the IDM store of the fake tenant', () => {
  let logDir;
  let recordPath;
  const fakes = [];

  beforeAll(() => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-idm-store-log-'));
    recordPath = path.join(logDir, 'requests.jsonl');
  });

  afterAll(() => {
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.rmSync(recordPath, { force: true });
  });

  afterEach(() => {
    for (const fake of fakes.splice(0)) fake.stop();
  });

  /** Starts a fake AM with the store and whatever else the test gives, stopped after the test. */
  async function tenant(options = {}) {
    const { idmEntities = STORE, ...rest } = options;
    const started = await startFakeAm({
      journey: 'service-account',
      recordPath,
      ...(idmEntities ? { idmEntities: structuredClone(idmEntities) } : {}),
      ...rest,
    });
    fakes.push(started);
    return started;
  }

  /** One request to the fake: the status, and the body as JSON when there is one. */
  async function call(server, method, target, body) {
    const response = await fetch(`http://127.0.0.1:${server.port}${target}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : text };
  }

  /** The query of a list by the id prefix, spelled as the library spells it. */
  const prefixQuery = (prefix) =>
    `/openidm/config?_queryFilter=${encodeURIComponent(`_id sw '${prefix}'`)}`;

  describe('the list of configuration objects', () => {
    test('answers the objects whose id starts with the prefix, in the order the tenant holds them', async () => {
      const server = await tenant();

      const { status, body } = await call(
        server,
        'GET',
        prefixQuery('provisioner.openicf')
      );

      expect(status).toBe(200);
      expect(ids(body)).toEqual([
        'provisioner.openicf/zion',
        'provisioner.openicf/matrix',
        'provisioner.openicf.connectorinfoprovider',
      ]);
      expect(body.result[0]).toEqual(STORE['provisioner.openicf/zion']);
    });

    test('answers the shape of an IDM query, not paged', async () => {
      const server = await tenant();

      const { body } = await call(
        server,
        'GET',
        prefixQuery('provisioner.openicf/')
      );

      expect(ids(body)).toEqual([
        'provisioner.openicf/zion',
        'provisioner.openicf/matrix',
      ]);
      expect(body).toEqual({
        result: body.result,
        resultCount: 2,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'NONE',
        totalPagedResults: -1,
        remainingPagedResults: -1,
      });
    });

    test('is a string prefix, as IDM answers it: the word alone also finds an id that only starts with it', async () => {
      const server = await tenant();

      const { body } = await call(server, 'GET', prefixQuery('mapping'));

      expect(ids(body)).toEqual([
        'mapping/managedAlpha_user_systemZion',
        'mappingOracle',
      ]);
    });

    test('answers every object for the filter true', async () => {
      const server = await tenant();

      const { status, body } = await call(
        server,
        'GET',
        '/openidm/config?_queryFilter=true'
      );

      expect(status).toBe(200);
      expect(ids(body)).toEqual(Object.keys(STORE));
      expect(body.resultCount).toBe(Object.keys(STORE).length);
    });

    test('answers an empty list for a prefix that no id starts with, which is not a failure', async () => {
      const server = await tenant();

      const { status, body } = await call(server, 'GET', prefixQuery('queue'));

      expect(status).toBe(200);
      expect(body.result).toEqual([]);
      expect(body.resultCount).toBe(0);
    });

    test('is the start of an id and not a part of it: some ids hold the word, none starts with it', async () => {
      const server = await tenant();

      const { status, body } = await call(server, 'GET', prefixQuery('zion'));

      expect(Object.keys(STORE).some((id) => id.includes('zion'))).toBe(true);
      expect(status).toBe(200);
      expect(body.result).toEqual([]);
    });

    test('gives an object that was stored without an id the id it is held under', async () => {
      const server = await tenant({ idmEntities: { sync: { mappings: [] } } });

      const { body } = await call(server, 'GET', prefixQuery('sync'));

      expect(body.result).toEqual([{ _id: 'sync', mappings: [] }]);
    });

    test.each([
      ["_id eq 'sync'"],
      ["name sw 'zion'"],
      ['_id sw "mapping"'],
      ["_id sw 'mapping' or _id sw 'sync'"],
      [''],
    ])(
      'refuses the filter %p with a 400, because an empty list would read as "nothing uses it"',
      async (filter) => {
        const server = await tenant();

        const { status, body } = await call(
          server,
          'GET',
          `/openidm/config?_queryFilter=${encodeURIComponent(filter)}`
        );

        expect(status).toBe(400);
        expect(body.code).toBe(400);
        expect(body.message).toContain(
          "by the filter true or _id sw '<prefix>' only"
        );
        expect(body.result).toBeUndefined();
      }
    );

    test('is not there without the store: the request is answered as before, with a 404', async () => {
      const server = await tenant({ idmEntities: null });

      const { status } = await call(server, 'GET', prefixQuery('mapping'));

      expect(status).toBe(404);
    });

    test('is left alone when the request has no filter: the request is answered as before, with a 404', async () => {
      const server = await tenant();

      const { status } = await call(server, 'GET', '/openidm/config');

      expect(status).toBe(404);
    });

    test('lists an object that was written with a PUT, once, also when it is written again', async () => {
      const server = await tenant();

      await call(server, 'PUT', '/openidm/config/mapping/new', { source: 'a' });
      await call(server, 'PUT', '/openidm/config/mapping/new', { source: 'b' });
      const { body } = await call(server, 'GET', prefixQuery('mapping/'));

      expect(body.result).toEqual([
        STORE['mapping/managedAlpha_user_systemZion'],
        { _id: 'mapping/new', source: 'b' },
      ]);
    });

    test('does not list an object that was deleted', async () => {
      const server = await tenant();

      await call(server, 'DELETE', '/openidm/config/provisioner.openicf/zion');
      const { body } = await call(
        server,
        'GET',
        prefixQuery('provisioner.openicf/')
      );

      expect(ids(body)).toEqual(['provisioner.openicf/matrix']);
    });
  });

  describe('the delete of a configuration object', () => {
    test('removes the object and answers it with a 200, as IDM does', async () => {
      const server = await tenant();

      const deleted = await call(
        server,
        'DELETE',
        '/openidm/config/provisioner.openicf/zion'
      );
      const read = await call(
        server,
        'GET',
        '/openidm/config/provisioner.openicf/zion'
      );

      expect(deleted.status).toBe(200);
      expect(deleted.body).toEqual(STORE['provisioner.openicf/zion']);
      expect(read.status).toBe(404);
    });

    test('leaves every other object as it was', async () => {
      const server = await tenant();

      await call(server, 'DELETE', '/openidm/config/provisioner.openicf/zion');
      const { body } = await call(
        server,
        'GET',
        '/openidm/config?_queryFilter=true'
      );

      expect(ids(body)).toEqual(
        Object.keys(STORE).filter((id) => id !== 'provisioner.openicf/zion')
      );
      expect(body.result).toEqual(
        Object.values(STORE).filter(
          ({ _id }) => _id !== 'provisioner.openicf/zion'
        )
      );
    });

    test('answers a 404 with the body of every other 404 for an object that is not there, and removes nothing', async () => {
      const server = await tenant();

      const { status, body } = await call(
        server,
        'DELETE',
        '/openidm/config/provisioner.openicf/neo'
      );
      const list = await call(
        server,
        'GET',
        '/openidm/config?_queryFilter=true'
      );

      expect(status).toBe(404);
      expect(body).toEqual(NOT_FOUND);
      expect(ids(list.body)).toEqual(Object.keys(STORE));
    });

    test('answers a second delete of the same id with a 404', async () => {
      const server = await tenant();

      const first = await call(
        server,
        'DELETE',
        '/openidm/config/mappingOracle'
      );
      const second = await call(
        server,
        'DELETE',
        '/openidm/config/mappingOracle'
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(404);
    });

    test('knows only the objects it holds: a name that every object inherits is not one', async () => {
      const server = await tenant();

      const { status } = await call(
        server,
        'DELETE',
        '/openidm/config/constructor'
      );
      const list = await call(
        server,
        'GET',
        '/openidm/config?_queryFilter=true'
      );

      expect(status).toBe(404);
      expect(ids(list.body)).toEqual(Object.keys(STORE));
    });

    test('is a failure that a test asks for with failRequests, for one id and not for its neighbour', async () => {
      const server = await tenant({
        failRequests: [
          {
            method: 'DELETE',
            path: '/openidm/config/provisioner.openicf/zion',
          },
        ],
      });

      const failed = await call(
        server,
        'DELETE',
        '/openidm/config/provisioner.openicf/zion'
      );
      const neighbour = await call(
        server,
        'DELETE',
        '/openidm/config/provisioner.openicf/matrix'
      );
      const list = await call(
        server,
        'GET',
        prefixQuery('provisioner.openicf/')
      );

      expect(failed.status).toBe(500);
      expect(neighbour.status).toBe(200);
      expect(ids(list.body)).toEqual(['provisioner.openicf/zion']);
    });

    test('does not take the objects that the idmConfig option serves: managed stays as that option has it', async () => {
      const server = await tenant({
        idmEntities: {
          managed: { _id: 'managed', objects: ['from the store'] },
        },
        idmConfig: { managed: { _id: 'managed', objects: [] } },
      });

      const deleted = await call(server, 'DELETE', '/openidm/config/managed');
      const read = await call(server, 'GET', '/openidm/config/managed');

      expect(deleted.status).toBe(500);
      expect(read).toEqual({
        status: 200,
        body: { _id: 'managed', objects: [] },
      });
    });
  });

  describe('what was there before: the read and the write of one object', () => {
    test('reads an object, and answers a 404 for one that is not there', async () => {
      const server = await tenant();

      const found = await call(server, 'GET', '/openidm/config/sync');
      const missing = await call(server, 'GET', '/openidm/config/queue');

      expect(found).toEqual({ status: 200, body: STORE.sync });
      expect(missing).toEqual({ status: 404, body: NOT_FOUND });
    });

    test('replaces an object by what a PUT sends, with the id of the URL, and logs the body', async () => {
      const server = await tenant();

      const written = await call(server, 'PUT', '/openidm/config/sync', {
        mappings: [],
      });
      const read = await call(server, 'GET', '/openidm/config/sync');

      expect(written).toEqual({
        status: 200,
        body: { _id: 'sync', mappings: [] },
      });
      expect(read.body).toEqual({ _id: 'sync', mappings: [] });
      const put = readRequests(recordPath).find(
        ({ method }) => method === 'PUT'
      );
      expect(JSON.parse(put.body)).toEqual({ mappings: [] });
    });

    test('keeps config/managed and config/repo.ds with the idmConfig option when that is given', async () => {
      const server = await tenant({
        idmConfig: { managed: { _id: 'managed', objects: [] } },
      });

      const read = await call(server, 'GET', '/openidm/config/managed');
      const written = await call(server, 'PUT', '/openidm/config/managed', {});

      expect(read.body).toEqual({ _id: 'managed', objects: [] });
      expect(written.status).toBe(500);
    });
  });

  describe('the managed objects of a type', () => {
    const list = (type, query) =>
      `/openidm/managed/${type}?_queryFilter=true${query ? `&${query}` : ''}`;

    test('answers every object of the type without a page size, in order, with no cookie', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const { status, body } = await call(
        server,
        'GET',
        list('alpha_application')
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        result: APPLICATIONS.alpha_application,
        resultCount: 3,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'NONE',
        totalPagedResults: -1,
        remainingPagedResults: -1,
      });
    });

    test('pages with the page size and a cookie that is the next offset, and ends with a null cookie', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const first = await call(
        server,
        'GET',
        list('alpha_application', '_pageSize=2')
      );
      const second = await call(
        server,
        'GET',
        list(
          'alpha_application',
          `_pageSize=2&_pagedResultsCookie=${first.body.pagedResultsCookie}`
        )
      );

      expect(ids(first.body)).toEqual(['a-1', 'a-2']);
      expect(first.body.resultCount).toBe(2);
      expect(first.body.pagedResultsCookie).toBe('2');
      expect(ids(second.body)).toEqual(['a-3']);
      expect(second.body.resultCount).toBe(1);
      expect(second.body.pagedResultsCookie).toBeNull();
    });

    test('ends with a null cookie when the last page is exactly full', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const { body } = await call(
        server,
        'GET',
        list('alpha_application', '_pageSize=3')
      );

      expect(ids(body)).toEqual(['a-1', 'a-2', 'a-3']);
      expect(body.pagedResultsCookie).toBeNull();
    });

    test('reduces the objects to their id and the fields that were asked for', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const { body } = await call(
        server,
        'GET',
        list('alpha_application', '_fields=name,connectorId')
      );

      expect(body.result).toEqual([
        { _id: 'a-1', name: 'Zion', connectorId: 'zion' },
        { _id: 'a-2', name: 'Matrix', connectorId: 'matrix' },
        // a field that the object does not have is not made up
        { _id: 'a-3', name: 'Plain' },
      ]);
    });

    test('refuses a filter other than true, and a page size that is not a positive number, with a 400', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const filtered = await call(
        server,
        'GET',
        `/openidm/managed/alpha_application?_queryFilter=${encodeURIComponent("name eq 'Zion'")}`
      );
      const counted = await call(
        server,
        'GET',
        list('alpha_application', '_pageSize=0')
      );
      const lost = await call(
        server,
        'GET',
        list('alpha_application', '_pageSize=2&_pagedResultsCookie=nonsense')
      );

      for (const answer of [filtered, counted, lost]) {
        expect(answer.status).toBe(400);
        expect(answer.body.result).toBeUndefined();
      }
    });

    test('answers a type that it does not hold as a path it does not know, with a 404', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const { status } = await call(server, 'GET', list('bravo_application'));

      expect(status).toBe(404);
    });

    test('does not serve one object of the type: it is for the list only', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const one = await call(
        server,
        'GET',
        '/openidm/managed/alpha_application/a-1'
      );
      const written = await call(
        server,
        'PUT',
        '/openidm/managed/alpha_application/a-1',
        { name: 'Changed' }
      );
      const { body } = await call(server, 'GET', list('alpha_application'));

      expect(one.status).toBe(404);
      expect(written.status).toBe(404);
      expect(body.result).toEqual(APPLICATIONS.alpha_application);
    });

    test('goes before the users of the fake, which serve the types that it does not hold', async () => {
      const users = [
        {
          _id: 'u-1',
          userName: 'zion-user',
          givenName: 'Z',
          sn: 'User',
        },
      ];
      const server = await tenant({ managedObjects: APPLICATIONS, users });

      const applications = await call(server, 'GET', list('alpha_application'));
      const others = await call(server, 'GET', list('alpha_user'));

      expect(ids(applications.body)).toEqual(['a-1', 'a-2', 'a-3']);
      expect(ids(others.body)).toEqual(['u-1']);
    });

    test('does not change what a read of the store does: the store is separate', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });

      const { body } = await call(
        server,
        'GET',
        '/openidm/config?_queryFilter=true'
      );

      expect(ids(body)).toEqual(Object.keys(STORE));
    });
  });

  describe('the reads that a lookup of the holders of a configuration object sends', () => {
    test('are answered, and the request log holds each of them as it was sent', async () => {
      const server = await tenant({ managedObjects: APPLICATIONS });
      const reads = [
        '/openidm/config/sync',
        '/openidm/config/authentication',
        '/openidm/config/provisioner.openicf.connectorinfoprovider',
        prefixQuery('mapping'),
        prefixQuery('schedule'),
        prefixQuery('provisioner.openicf'),
        '/openidm/managed/alpha_application?_queryFilter=true&_pageSize=50&_fields=name,connectorId',
      ];

      const answers = [];
      for (const read of reads) answers.push(await call(server, 'GET', read));

      expect(answers.map(({ status }) => status)).toEqual([
        200, 200, 200, 200, 200, 200, 200,
      ]);
      expect(answers[0].body).toEqual(STORE.sync);
      expect(answers[1].body).toEqual(STORE.authentication);
      expect(answers[2].body.remoteConnectorClients).toEqual([
        { name: 'matrix-server', enabled: true },
      ]);
      expect(ids(answers[4].body)).toEqual(['schedule/zion-live-sync']);
      expect(ids(answers[6].body)).toEqual(['a-1', 'a-2', 'a-3']);
      // the client writes the URL the way the URL standard does (a quote is escaped)
      const spelled = (read) => {
        const { pathname, search } = new URL(read, 'http://fake');
        return `GET ${pathname}${search}`;
      };
      expect(
        readRequests(recordPath).map(({ method, url }) => `${method} ${url}`)
      ).toEqual(reads.map(spelled));
    });

    test('are answered with a 404 for an object that the tenant does not have, which a lookup reads as none', async () => {
      const server = await tenant({
        idmEntities: { sync: STORE.sync },
        managedObjects: {},
      });

      const authentication = await call(
        server,
        'GET',
        '/openidm/config/authentication'
      );
      const applications = await call(
        server,
        'GET',
        '/openidm/managed/alpha_application?_queryFilter=true'
      );

      expect(authentication.status).toBe(404);
      expect(applications.status).toBe(404);
    });
  });
});

/**
 * The same store, read and written by the real CLI of this checkout and the real
 * library: `frodo connector list` reads the connectors through the list of the
 * configuration objects, `frodo connector delete -i` deletes one with one DELETE.
 * A temporary HOME keeps the run away from real profiles. Skipped on Windows: the
 * CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

suite('the IDM store of the fake tenant, through the real CLI', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-idm-store-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-idm-store-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts the fake with the store and runs `frodo <args>` once against it, without a terminal. */
  async function runAgainst(args) {
    fakeAm = await startFakeAm({
      journey: 'service-account',
      recordPath: record,
      idmEntities: structuredClone(STORE),
    });
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [...args, `http://127.0.0.1:${fakeAm.port}/am`, '--type', 'cloud'],
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

  test(
    'connector list shows the connectors that the store holds, and not the configuration of the connector info provider',
    async () => {
      const { code, output } = await runAgainst(['connector', 'list']);

      expect(code).toBe(0);
      expect(output.split('\n').map((line) => line.trim())).toEqual(
        expect.arrayContaining(['matrix', 'zion'])
      );
      expect(output).not.toContain('connectorinfoprovider');
      const requests = readRequests(record);
      expect(
        requests.filter(({ url }) => url.includes('/openidm/config?')).length
      ).toBeGreaterThan(0);
      expect(requests.filter(({ method }) => method === 'DELETE')).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'connector delete -i sends one DELETE of that connector, and nothing else is deleted',
    async () => {
      const { code, output } = await runAgainst([
        'connector',
        'delete',
        '-i',
        'zion',
      ]);

      expect(output).toContain('Deleted zion.');
      expect(code).toBe(0);
      const deletes = readRequests(record).filter(
        ({ method }) => method === 'DELETE'
      );
      expect(deletes.map(({ url }) => url)).toEqual([
        '/openidm/config/provisioner.openicf/zion',
      ]);
    },
    TIMEOUT
  );

  test(
    'connector delete -i of a connector that the store does not hold fails with exit code 1',
    async () => {
      const { code } = await runAgainst(['connector', 'delete', '-i', 'neo']);

      expect(code).toBe(1);
      const deletes = readRequests(record).filter(
        ({ method }) => method === 'DELETE'
      );
      expect(deletes.map(({ url }) => url)).toEqual([
        '/openidm/config/provisioner.openicf/neo',
      ]);
    },
    TIMEOUT
  );
});
