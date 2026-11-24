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
 * `config-manager delete remote-servers`, the REAL CLI of this checkout against
 * a fake tenant (test/utils/FakeAm.mjs, in a separate process, with its store of
 * IDM configuration) and the real library. What the unit tests stub, this shows
 * in the log of the requests the tenant received:
 *
 * - a connector server that a server cluster or a connector still names is not
 *   deleted: the run sends reads only, also with `--allow-failures`;
 * - with `--force -y` the run sends exactly one write, the configuration
 *   without the connector server and without its name in the server clusters,
 *   and no other write: a connector is never changed; `--keep-links` leaves the
 *   server clusters; `-n` and `--name` select as `-i` does;
 * - a connector server that is not in the list exits with 1, with
 *   `--allow-failures` and in a dry run too;
 * - the plan of a delete of all connector servers (`-d`) reads the
 *   configuration, then looks up what names the connector servers with two
 *   reads, however many there are, and writes nothing; `-y` sends no lookup
 *   and one write for each connector server;
 * - what is refused before the login sends no request at all, and a classic
 *   deployment, which has no IDM, is refused before any IDM request.
 *
 * No tenant, no secrets, no terminal; a temporary HOME and working directory
 * keep it away from real profiles and files. Skipped on Windows: the CLI binary
 * shim is a shell script. What the operation does is in
 * FrConfigRemoteServersDelete.test.js, against a stub of the library.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const CONFIG = 'provisioner.openicf.connectorinfoprovider';

/** What the tenant holds: four connector servers (none has a `clientId`), two server clusters, one connector that names one of them. */
const STORE = {
  [CONFIG]: {
    _id: CONFIG,
    connectorsLocation: 'connectors',
    remoteConnectorClients: [
      { enabled: true, name: 'asdf', useSSL: true },
      { enabled: true, name: 'rcs', useSSL: true },
      { enabled: false, name: 'third', useSSL: false },
      { enabled: true, name: 'free', useSSL: true },
    ],
    remoteConnectorClientsGroups: [
      {
        algorithm: 'failover',
        name: 'cluster',
        serversList: [{ name: 'asdf' }, { name: 'rcs' }],
      },
      { algorithm: 'roundrobin', name: 'solo', serversList: [{ name: 'rcs' }] },
    ],
    remoteConnectorServers: [],
    remoteConnectorServersGroups: [],
  },
  'provisioner.openicf/zion': {
    _id: 'provisioner.openicf/zion',
    name: 'zion',
    enabled: false,
    connectorRef: { connectorHostRef: 'third' },
  },
};

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

suite('config-manager delete remote-servers (fake tenant)', () => {
  let home;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-remote-servers-home-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
  });

  /**
   * Starts a fresh fake tenant with the store and runs the CLI once against it.
   * `classic` logs in the way of a classic deployment, with a user name and a
   * password; the default is a Cloud tenant and a service account.
   */
  async function deleteRemoteServers(
    args,
    { classic = false, entities = STORE, fake = {} } = {}
  ) {
    fakeAm?.stop();
    fs.rmSync(record, { force: true });
    fakeAm = await startFakeAm({
      recordPath: record,
      journey: classic ? 'password' : 'service-account',
      idmEntities: structuredClone(entities),
      ...fake,
    });
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          'config-manager',
          'delete',
          'remote-servers',
          ...args,
          ...(classic
            ? ['-m', 'classic', `http://127.0.0.1:${fakeAm.port}/am`]
            : [`http://127.0.0.1:${fakeAm.port}/am`, '--type', 'cloud']),
        ],
        {
          cwd: home,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_REALM: '',
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            FRODO_NO_PROMPT: '1',
            FRODO_NO_UPDATE_CHECK: '1',
            NODE_OPTIONS: '',
            NO_COLOR: '1',
            ...(classic
              ? { FRODO_USERNAME: 'admin', FRODO_PASSWORD: 'secret' }
              : {
                  FRODO_SA_ID: 'test-account',
                  FRODO_SA_JWK: serviceAccountJwk,
                }),
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
  /** The requests for IDM configuration, as `METHOD path`. */
  const idm = () =>
    requests()
      .filter(({ url }) => url.includes('/openidm/config'))
      .map(({ method, url }) => `${method} ${decodeURIComponent(url)}`);
  /** What the tenant was asked to change: every request for IDM configuration that is not a read. */
  const changes = () =>
    requests().filter(
      ({ method, url }) => method !== 'GET' && url.includes('/openidm/config')
    );
  const bodies = () => changes().map(({ body }) => JSON.parse(body));
  const names = (body) => body.remoteConnectorClients.map(({ name }) => name);

  const LIST = "GET /openidm/config?_queryFilter=_id sw 'provisioner.openicf'";
  const ENTITY = `GET /openidm/config/${CONFIG}`;

  describe('a named delete of a connector server that something still names', () => {
    it(
      'a server cluster stops it: the run says which, exits 1 and sends reads only',
      async () => {
        const { code, output } = await deleteRemoteServers(['-i', 'rcs']);

        expect(code).toBe(1);
        expect(output).toContain(
          "Connector server 'rcs' is still named by:\n  - server cluster 'cluster' (serversList), soft\n  - server cluster 'solo' (serversList), soft"
        );
        expect(output).toContain('Nothing was deleted. --force deletes it anyway');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'a connector stops it, with its field and its flag',
      async () => {
        const { code, output } = await deleteRemoteServers(['-i', 'third']);

        expect(code).toBe(1);
        expect(output).toContain(
          "  - connector 'zion' (connectorRef.connectorHostRef), hard"
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      '--allow-failures does not turn the refusal into success, and a dry run says it would be refused',
      async () => {
        const allowed = await deleteRemoteServers(['-i', 'rcs', '--allow-failures']);
        expect(allowed.code).toBe(1);
        expect(changes()).toEqual([]);

        const dry = await deleteRemoteServers(['-i', 'rcs', '-d']);
        expect(dry.code).toBe(1);
        expect(dry.output).toContain('Dry run: the delete would be refused.');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'only reads are sent: the list of the configuration, the lookup of the library (two reads), and the check before a write that does not happen',
      async () => {
        await deleteRemoteServers(['-i', 'rcs']);

        expect(idm()).toEqual([ENTITY, ENTITY, LIST]);
      },
      TIMEOUT
    );
  });

  describe('a named delete of a connector server that nothing names', () => {
    it.each([['-i'], ['-n'], ['--name'], ['--server-id']])(
      '%s deletes it with one write, the configuration without that entry and nothing else changed',
      async (flag) => {
        const { code, output } = await deleteRemoteServers([flag, 'free']);

        expect(code).toBe(0);
        expect(output).toContain("Deleted connector server 'free'.");
        const expected = structuredClone(STORE[CONFIG]);
        expected.remoteConnectorClients.pop();
        expect(bodies()).toEqual([expected]);
        expect(changes().map(({ method }) => method)).toEqual(['PUT']);
      },
      TIMEOUT
    );

    it(
      'a name that only almost matches is not found: exit 1, also with --allow-failures and in a dry run, and nothing is written',
      async () => {
        for (const args of [
          ['-i', 'FREE'],
          ['-i', 'free ', '--allow-failures'],
          ['-i', 'nope', '-d'],
          ['-i', '../free'],
        ]) {
          const { code, output } = await deleteRemoteServers(args);

          expect([args, code]).toEqual([args, 1]);
          expect(output).toContain(`Connector server '${args[1]}' not found.`);
          expect(changes()).toEqual([]);
        }
      },
      TIMEOUT
    );
  });

  describe('a named delete with --force', () => {
    it(
      'sends exactly one write: the configuration without the connector server and its name in the server clusters, and no connector is changed',
      async () => {
        const { code, output } = await deleteRemoteServers([
          '-i',
          'third',
          '--force',
          '-y',
        ]);

        expect(code).toBe(0);
        const expected = structuredClone(STORE[CONFIG]);
        expected.remoteConnectorClients.splice(2, 1);
        expect(bodies()).toEqual([expected]);
        expect(changes().map(({ method, url }) => `${method} ${url}`)).toEqual([
          `PUT /openidm/config/${CONFIG}`,
        ]);
        expect(output).toContain("Deleted connector server 'third'.");
        expect(output).toContain(
          "Left alone, these now name a connector server that does not exist:\n  - connector 'zion' (connectorRef.connectorHostRef), hard"
        );
      },
      TIMEOUT
    );

    it(
      'takes the name out of the server clusters in that one write, and says which has no connector server left',
      async () => {
        const { code, output } = await deleteRemoteServers([
          '-i',
          'rcs',
          '--force',
          '-y',
        ]);

        expect(code).toBe(0);
        const expected = structuredClone(STORE[CONFIG]);
        expected.remoteConnectorClients.splice(1, 1);
        expected.remoteConnectorClientsGroups[0].serversList = [{ name: 'asdf' }];
        expected.remoteConnectorClientsGroups[1].serversList = [];
        expect(bodies()).toEqual([expected]);
        expect(output).toContain(
          "Removed connector server 'rcs' from the server clusters: cluster, solo."
        );
        expect(output).toContain("Server cluster 'solo' has no connector server left.");
      },
      TIMEOUT
    );

    it(
      '--keep-links leaves the server clusters as they are',
      async () => {
        const { code, output } = await deleteRemoteServers([
          '-i',
          'rcs',
          '--force',
          '--keep-links',
          '-y',
        ]);

        expect(code).toBe(0);
        const expected = structuredClone(STORE[CONFIG]);
        expected.remoteConnectorClients.splice(1, 1);
        expect(bodies()).toEqual([expected]);
        expect(output).toContain('Kept the name in these server clusters (--keep-links):');
      },
      TIMEOUT
    );

    it(
      'a dry run sends no write and prints the plan',
      async () => {
        const { code, output } = await deleteRemoteServers([
          '-i',
          'rcs',
          '--force',
          '-d',
        ]);

        expect(code).toBe(0);
        expect(changes()).toEqual([]);
        expect(output).toContain("Dry run: would delete connector server 'rcs'.");
        expect(output).toContain("    - server cluster 'cluster' (serversList)");
      },
      TIMEOUT
    );

    it(
      'a write that the tenant refuses ends with exit 1 and a summary, and --allow-failures keeps it at 0',
      async () => {
        const fake = {
          failRequests: [{ method: 'PUT', path: `/openidm/config/${CONFIG}` }],
        };

        const failed = await deleteRemoteServers(['-i', 'free'], { fake });
        expect(failed.code).toBe(1);
        expect(failed.output).toContain('1 of 1 connector server failed:');
        expect(failed.output).toContain('  - free:');

        const allowed = await deleteRemoteServers(
          ['-i', 'free', '--allow-failures'],
          { fake }
        );
        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
      },
      TIMEOUT
    );
  });

  describe('a delete of all connector servers', () => {
    it(
      '-d reads the configuration, then looks up what names them with two reads, writes nothing, and lists the holders',
      async () => {
        const { code, output } = await deleteRemoteServers(['-d']);

        expect(code).toBe(0);
        // the read of the operation, then the two reads of the lookup
        expect(idm()).toEqual([ENTITY, ENTITY, LIST]);
        expect(changes()).toEqual([]);
        expect(output).toContain(
          'Dry run: nothing is deleted. All 4 connector servers would be deleted: asdf, rcs, third, free.'
        );
        expect(output).toContain("    - asdf: server cluster 'cluster' (serversList), soft");
        expect(output).toContain("    - third: connector 'zion' (connectorRef.connectorHostRef), hard");
        expect(output).toContain("Server cluster 'solo' would have no connector server left.");
      },
      TIMEOUT
    );

    it(
      '-d needs two reads for the lookup however many connector servers there are',
      async () => {
        const many = structuredClone(STORE);
        many[CONFIG].remoteConnectorClients = Array.from(
          { length: 12 },
          (_, index) => ({ enabled: true, name: `rcs-${index}` })
        );
        many[CONFIG].remoteConnectorClientsGroups = [];

        const { code } = await deleteRemoteServers(['-d'], { entities: many });

        expect(code).toBe(0);
        expect(idm()).toEqual([ENTITY, ENTITY, LIST]);
      },
      TIMEOUT
    );

    it(
      '-y sends no lookup, and one write for each connector server, each from the list that the writes before it left',
      async () => {
        const { code, output } = await deleteRemoteServers(['-y']);

        expect(code).toBe(0);
        expect(idm()[0]).toBe(ENTITY);
        expect(idm().filter((line) => line.startsWith('GET /openidm/config?'))).toEqual([]);
        expect(changes().map(({ method }) => method)).toEqual(['PUT', 'PUT', 'PUT', 'PUT']);
        expect(bodies().map(names)).toEqual([
          ['rcs', 'third', 'free'],
          ['third', 'free'],
          ['free'],
          [],
        ]);
        // no server cluster and no connector is changed
        for (const body of bodies()) {
          expect(body.remoteConnectorClientsGroups).toEqual(
            STORE[CONFIG].remoteConnectorClientsGroups
          );
        }
        expect(output).toContain('Deleted connector server: asdf');
        expect(output).toContain('Deleted connector server: free');
      },
      TIMEOUT
    );

    it(
      'without a terminal and without -y is refused before the login: no request at all',
      async () => {
        const { code, output } = await deleteRemoteServers([]);

        expect(code).toBe(1);
        expect(output).toContain('Refusing to delete all connector servers');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'a tenant without connector servers is a success, also without a list in its configuration',
      async () => {
        const none = structuredClone(STORE);
        delete none[CONFIG].remoteConnectorClients;

        const { code, output } = await deleteRemoteServers(['-y'], {
          entities: none,
        });

        expect(code).toBe(0);
        expect(output).toContain('No connector servers found to delete.');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('what is refused before the login sends no request at all', () => {
    it.each([
      [['-i', 'rcs', '--force'], "Refusing to delete connector server 'rcs'"],
      [['--force', '-y'], 'applies to a named connector server only'],
      [['-i', 'rcs', '--keep-links'], '--keep-links applies together with --force only'],
      [['-i', '  '], 'must not be empty'],
    ])('%j', async (args, message) => {
      const { code, output } = await deleteRemoteServers(args);

      expect(code).toBe(1);
      expect(output).toContain(message);
      expect(requests()).toEqual([]);
    }, TIMEOUT);
  });

  describe('a classic deployment has no IDM', () => {
    it(
      'is refused before any request for IDM configuration, with exit code 1',
      async () => {
        const { code, output } = await deleteRemoteServers(['-i', 'rcs'], {
          classic: true,
        });

        expect(code).toBe(1);
        expect(output).toContain("Command does not support deployment type 'classic'");
        expect(idm()).toEqual([]);
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );
  });
});
