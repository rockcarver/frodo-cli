import cp from 'child_process';
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
 * `config-manager delete journeys`, the REAL CLI of this checkout against a fake
 * AM (test/utils/FakeAm.mjs, in a separate process) and the real library. What
 * the unit tests stub, this shows in the log of the requests the tenant
 * received:
 *
 * - a dry run, of all journeys or of one, sends no request that changes
 *   anything: orphaned nodes are listed, never deleted (a dry run that deleted
 *   them would also have done it before the question of a terminal was answered);
 * - a journey is looked up in the list of the realm, and the id that the list
 *   holds is what is deleted: an id that is a path, or only almost a journey
 *   name, sends nothing but reads;
 * - a journey that something still names is not deleted (here the default
 *   journeys of the realm), also with `--allow-failures`; with `--force` it is,
 *   and the command says what it left alone;
 * - what is refused before the login sends no request at all: `--force` without
 *   a terminal and without `-y`, `--force` or `--keep-links` where they do not
 *   apply, an empty id;
 * - exit codes: a journey that AM refuses to delete ends with 1, `--allow-failures`
 *   keeps a delete of all journeys at 0 and does not for a named one that is
 *   not there.
 *
 * No tenant, no secrets, no terminal; a temporary HOME and working directory keep
 * it away from real profiles and files. Skipped on Windows: the CLI binary shim
 * is a shell script. What the holders of a journey are cleared with is in
 * ConfigManagerDeleteJourneys.test.js, against a stub of the library.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

// `ldapService` is what the fake names as the default journeys of the realm
const JOURNEYS = {
  ZionLogin: { 'node-1': 'UsernameCollectorNode' },
  Registration: { 'node-2': 'SetStateNode' },
  ldapService: { 'node-3': 'SetStateNode' },
};
const ORPHANS = { 'orphan-1': 'SetStateNode' };

suite('config-manager delete journeys (fake tenant)', () => {
  let home;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-journeys-home-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
  });

  /** Starts the fake tenant, which keeps its state until the test ends. */
  async function startTenant(options = {}) {
    fakeAm?.stop();
    fs.rmSync(record, { force: true });
    fakeAm = await startFakeAm({
      recordPath: record,
      journey: 'password',
      emptyCollections: true,
      journeys: JOURNEYS,
      nodes: ORPHANS,
      ...options,
    });
  }

  /** Runs the CLI once against the running fake tenant. */
  function runCli(args) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          'config-manager',
          'delete',
          'journeys',
          ...args,
          '-m',
          'classic',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
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
            NODE_OPTIONS: '',
            NO_COLOR: '1',
            FRODO_USERNAME: 'admin',
            FRODO_PASSWORD: 'secret',
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
  async function deleteJourneys(args, options = {}) {
    await startTenant(options);
    return runCli(args);
  }

  const requests = () => readRequests(record);
  /** What the tenant was asked to change: every request that is not a read, a login or a session lookup. */
  const changes = () =>
    requests()
      .filter(
        ({ method, url }) =>
          method !== 'GET' &&
          !/\/authenticate|\/sessions\/|_action=(getAllTypes|nextdescendents)/.test(
            url
          )
      )
      .map(
        ({ method, url }) =>
          `${method} ${url.split('?')[0].split('/').slice(-2).join('/')}`
      );

  describe('a delete of all journeys', () => {
    it(
      'a dry run lists the journeys and the orphaned nodes and changes nothing',
      async () => {
        const { code, output } = await deleteJourneys(['-d']);

        expect(code).toBe(0);
        expect(output).toContain(
          "Dry run: would delete journey 'ZionLogin' in realm 'alpha'."
        );
        expect(output).toContain(
          "Dry run: would delete orphaned node 'orphan-1' (SetStateNode) in realm 'alpha'."
        );
        expect(output).toContain('Journeys that would be deleted: 3');
        expect(output).toContain('Orphaned nodes that would be deleted: 1');
        expect(changes()).toEqual([]);
        // the orphaned node was looked at: its type was read
        expect(
          requests().some(({ url }) => url.includes('/nodes/SetStateNode'))
        ).toBe(true);
      },
      TIMEOUT
    );

    it(
      'with -y deletes every journey and then the orphaned node, and says so',
      async () => {
        const { code, output } = await deleteJourneys(['-y']);

        expect(code).toBe(0);
        expect(output).toContain(
          "Deleted journey 'ZionLogin' in realm 'alpha'."
        );
        expect(output).toContain(
          "Deleted orphaned node 'orphan-1' (SetStateNode) in realm 'alpha'."
        );
        expect(output).toContain('Journeys deleted: 3');
        expect(output).toContain('Orphaned nodes deleted: 1');
        expect(changes()).toEqual([
          'DELETE trees/ZionLogin',
          'DELETE trees/Registration',
          'DELETE trees/ldapService',
          'DELETE SetStateNode/orphan-1',
        ]);
      },
      TIMEOUT
    );

    it(
      'without a terminal and without -y is refused before the login: no request at all',
      async () => {
        const { code, output } = await deleteJourneys([]);

        expect(code).toBe(1);
        expect(output).toContain('-y/--yes');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'a journey that AM refuses to delete fails the command with the cause, the others are deleted, and --allow-failures keeps it at 0',
      async () => {
        const failRequests = [{ method: 'DELETE', path: 'trees/Registration' }];

        const failed = await deleteJourneys(['-y'], { failRequests });

        expect(failed.code).toBe(1);
        expect(failed.output).toContain("Deleted journey 'ZionLogin'");
        expect(failed.output).toContain("Deleted journey 'ldapService'");
        expect(failed.output).toMatch(
          /1 of \d+ deletions failed:\n {2}- journey 'Registration' in realm 'alpha': /
        );
        fakeAm.stop();
        fs.rmSync(record, { force: true });

        const allowed = await deleteJourneys(['-y', '--allow-failures'], {
          failRequests,
        });

        expect(allowed.code).toBe(0);
        expect(allowed.output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
      },
      TIMEOUT * 2
    );

    it(
      'a realm without journeys says so and succeeds',
      async () => {
        const { code, output } = await deleteJourneys(['-y'], {
          journeys: {},
          nodes: {},
        });

        expect(code).toBe(0);
        expect(output).toContain(
          "No journeys found to delete in realm 'alpha'."
        );
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('a named delete', () => {
    it(
      'looks the journey up in the list and deletes the listed id, with one request that changes anything',
      async () => {
        const { code, output } = await deleteJourneys(['-i', 'ZionLogin']);

        expect(code).toBe(0);
        expect(output).toContain(
          "Deleted journey 'ZionLogin' in realm 'alpha'."
        );
        expect(changes()).toEqual(['DELETE trees/ZionLogin']);
        const urls = requests().map(({ method, url }) => `${method} ${url}`);
        const list = urls.findIndex((url) =>
          url.includes('trees?_queryFilter=true')
        );
        const del = urls.findIndex((url) => url.startsWith('DELETE'));
        expect(list).toBeGreaterThan(-1);
        expect(list).toBeLessThan(del);
      },
      TIMEOUT
    );

    it(
      'the alias -n and --name are the same selector',
      async () => {
        for (const flag of ['-n', '--name']) {
          const { code } = await deleteJourneys([flag, 'Registration']);

          expect([flag, code]).toEqual([flag, 0]);
          expect([flag, changes()]).toEqual([
            flag,
            ['DELETE trees/Registration'],
          ]);
          fakeAm.stop();
          fs.rmSync(record, { force: true });
        }
      },
      TIMEOUT * 2
    );

    it(
      'an id that is a path, or is only almost a journey name, is never sent: no change, exit 1 even with --allow-failures and --force',
      async () => {
        await startTenant();
        const hostile =
          '../../../../../../am/json/realms/root/realms/alpha/realm-config/agents/OAuth2Client/zion-client';
        const attempts = [
          ...['a/b?x=1', 'zionlogin', 'Zion '].map((id) => [id, []]),
          // the beginning of a journey name is not the journey (the fake holds
          // ZionLogin, Registration and ldapService), nor is a name that begins
          // with a journey's
          ...[
            'Zion',
            'ZionLogi',
            'Z',
            'Registrat',
            'ldapServic',
            'ZionLoginX',
          ].map((id) => [id, []]),
          ...['Zion', 'Registrat'].map((id) => [id, ['--force', '-y']]),
          // the path that would reach an OAuth2 client, with every option that
          // could let a delete through
          ...[[], ['-d'], ['--allow-failures'], ['--force', '-y']].map(
            (extra) => [hostile, extra]
          ),
          ['zionlogin', ['--force', '-y']],
        ];
        for (const [id, extra] of attempts) {
          const { code, output } = await runCli(['-i', id, ...extra]);

          expect([id, extra, code]).toEqual([id, extra, 1]);
          expect(output).toContain(
            `Journey '${id}' not found in realm 'alpha'.`
          );
        }
        // after all of them the tenant was asked to change nothing
        expect(changes()).toEqual([]);
      },
      TIMEOUT * 6
    );

    it(
      'a journey that something still names is not deleted, also with --allow-failures: the default journeys of the realm name ldapService',
      async () => {
        for (const extra of [[], ['--allow-failures'], ['-d']]) {
          const { code, output } = await deleteJourneys([
            '-i',
            'ldapService',
            ...extra,
          ]);

          expect([extra, code]).toEqual([extra, 1]);
          expect(output).toContain(
            "Journey 'ldapService' in realm 'alpha' is still named by:"
          );
          expect(output).toContain(
            'authentication settings (core.orgConfig), hard'
          );
          expect(output).toContain(
            'Nothing was deleted. --force deletes it anyway'
          );
          expect([extra, changes()]).toEqual([extra, []]);
          fakeAm.stop();
          fs.rmSync(record, { force: true });
        }
      },
      TIMEOUT * 4
    );

    it(
      '--force -y deletes it anyway and says what it left alone',
      async () => {
        const { code, output } = await deleteJourneys([
          '-i',
          'ldapService',
          '--force',
          '-y',
        ]);

        expect(code).toBe(0);
        expect(output).toContain(
          "Deleted journey 'ldapService' in realm 'alpha'."
        );
        expect(output).toContain(
          'Left alone, these now name a journey that does not exist:\n  - authentication settings (core.orgConfig), hard'
        );
        expect(changes()).toEqual(['DELETE trees/ldapService']);
      },
      TIMEOUT
    );

    it(
      '--force -d says what would be done and changes nothing',
      async () => {
        const { code, output } = await deleteJourneys([
          '-i',
          'ldapService',
          '--force',
          '-d',
        ]);

        expect(code).toBe(0);
        expect(output).toContain("Dry run: would delete journey 'ldapService'");
        expect(output).toContain('Leave these alone');
        expect(changes()).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'a journey that AM refuses to delete ends with 1, with the cause, whatever --allow-failures says for the realm',
      async () => {
        const failRequests = [{ method: 'DELETE', path: 'trees/ZionLogin' }];

        const { code, output } = await deleteJourneys(['-i', 'ZionLogin'], {
          failRequests,
        });

        expect(code).toBe(1);
        expect(output).toMatch(
          /1 of 1 step failed:\n {2}- delete journey 'ZionLogin': /
        );
      },
      TIMEOUT
    );
  });

  describe('what is refused before the login: no request at all', () => {
    it.each([
      [['-i', 'ZionLogin', '--force'], '-y/--yes'],
      [['--force', '-y'], 'applies to a named journey only'],
      [['--keep-links', '-y'], 'applies to a named journey only'],
      [
        ['-i', 'ZionLogin', '--keep-links'],
        '--keep-links applies together with --force only',
      ],
      [['-i', ''], 'An empty value never selects all objects'],
      [['--name', ''], 'An empty value never selects all objects'],
    ])(
      '%j',
      async (args, message) => {
        const { code, output } = await deleteJourneys(args);

        expect(code).toBe(1);
        expect(output).toContain(message);
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('a journey that SAML providers and an AI agent name: the real library against holders served the way AM serves them', () => {
    const id64 = (entityId) => Buffer.from(entityId).toString('base64url');
    const REMOTE = {
      location: 'remote',
      entityId: 'urn:zion:sp',
      config: {
        serviceProvider: {
          assertionContent: { nameIdFormat: { nameIdFormatList: [] } },
          services: { serviceAttributes: {} },
          advanced: {
            idpProxy: {},
            treeConfiguration: { treeName: 'ZionLogin' },
          },
        },
      },
    };
    const HOSTED = {
      location: 'hosted',
      entityId: 'urn:zion:hosted',
      config: {
        serviceProvider: {
          assertionProcessing: {
            attributeMapper: {},
            redirectTreeConfiguration: { redirectTreeName: 'ZionLogin' },
          },
          services: { metaAlias: '/zion-hosted', serviceAttributes: {} },
        },
      },
    };
    const puts = () =>
      requests()
        .filter(({ method }) => method === 'PUT')
        .map(({ url, body }) => ({
          path: url.split('?')[0].split('/realm-config/')[1],
          body: JSON.parse(body),
        }));

    it(
      '--force -y clears a remote and a hosted provider: each is read, then written whole to `saml2/<its location>/<id>` (never `undefined`), without a revision, and only then is the journey deleted',
      async () => {
        const { code, output } = await deleteJourneys(
          ['-i', 'ZionLogin', '--force', '-y'],
          { samlProviders: [REMOTE, HOSTED] }
        );

        expect(output).toContain(
          "Cleared the journey in SAML provider 'urn:zion:sp' (serviceProvider.advanced.treeConfiguration.treeName)"
        );
        expect(output).toContain(
          "Cleared the journey in SAML provider 'urn:zion:hosted' (serviceProvider.assertionProcessing.redirectTreeConfiguration.redirectTreeName)"
        );
        expect(code).toBe(0);
        expect(
          requests().some(({ url }) => url.includes('saml2/undefined'))
        ).toBe(false);
        // the references come ordered by their id: the hosted provider first
        expect(changes()).toEqual([
          `PUT hosted/${id64('urn:zion:hosted')}`,
          `PUT remote/${id64('urn:zion:sp')}`,
          'DELETE trees/ZionLogin',
        ]);
        const written = puts();
        expect(written.map(({ path }) => path)).toEqual([
          `saml2/hosted/${id64('urn:zion:hosted')}`,
          `saml2/remote/${id64('urn:zion:sp')}`,
        ]);
        // the whole provider, as it was read, with only the field changed
        const hosted = structuredClone(HOSTED.config);
        hosted.serviceProvider.assertionProcessing.redirectTreeConfiguration.redirectTreeName =
          '[Empty]';
        expect(written[0].body).toEqual({
          _id: id64('urn:zion:hosted'),
          entityId: 'urn:zion:hosted',
          ...hosted,
        });
        const remote = structuredClone(REMOTE.config);
        remote.serviceProvider.advanced.treeConfiguration.treeName = '[Empty]';
        expect(written[1].body).toEqual({
          _id: id64('urn:zion:sp'),
          entityId: 'urn:zion:sp',
          ...remote,
        });
      },
      TIMEOUT
    );

    const AGENT = {
      _id: 'zion-agent',
      _type: { _id: 'AIAgent', name: 'AI Agent', collection: true },
      advancedOAuth2ClientConfig: {
        treeName: { inherited: false, value: 'ZionLogin' },
        grantTypes: { inherited: false, value: ['client_credentials'] },
      },
      coreOAuth2ClientConfig: {
        clientName: { inherited: false, value: ['Zion Agent'] },
      },
      aiAgentIdentityUid: { inherited: false, value: 'uid-1' },
      aiAgentIdentityAttributes: { inherited: false, value: { a: 1 } },
    };

    it(
      '--force -y clears an AI agent with the whole agent, identity attributes included, and a PUT that replaces the object keeps everything else: the journey is deleted after it',
      async () => {
        const { code, output } = await deleteJourneys(
          ['-i', 'ZionLogin', '--force', '-y'],
          { aiAgents: [AGENT], agentTypes: ['AIAgent'] }
        );

        expect(output).toContain(
          "Cleared the journey in AI agent 'zion-agent'"
        );
        expect(code).toBe(0);
        expect(changes()).toEqual([
          'PUT AIAgent/zion-agent',
          'DELETE trees/ZionLogin',
        ]);
        const [written] = puts();
        const cleared = structuredClone(AGENT);
        cleared.advancedOAuth2ClientConfig.treeName.value = '[Empty]';
        expect(written.body).toEqual(cleared);
      },
      TIMEOUT
    );

    it(
      'an AI agent whose write loses an attribute (the library does not write the encrypted ones, a PUT that replaces drops them) is caught by the read-back: it is written back, the loss is named without its value, the journey is not deleted, exit 1',
      async () => {
        const damaged = structuredClone(AGENT);
        damaged.coreOAuth2ClientConfig['userpassword-encrypted'] = {
          inherited: false,
          value: 'not-a-real-secret',
        };

        const { code, output } = await deleteJourneys(
          ['-i', 'ZionLogin', '--force', '-y'],
          { aiAgents: [damaged], agentTypes: ['AIAgent'] }
        );

        expect(code).toBe(1);
        expect(output).toContain('changed in more than that field');
        // the path of what was lost, never a value
        expect(output).toContain(
          'it differs from the original in coreOAuth2ClientConfig.userpassword-encrypted.'
        );
        expect(output).toContain(
          'The library never writes an attribute whose name has -encrypted in it, so no restore can put it back.'
        );
        expect(output).not.toContain('not-a-real-secret');
        // the agent was written and could not be put back: the closing text says so
        expect(output).toContain(
          "Changed by the step that failed, and NOT restored: AI agent 'zion-agent' (advancedOAuth2ClientConfig.treeName)."
        );
        // it tried to put the agent back as it was, which the library cannot do for that attribute
        expect(output).toContain(
          'It could NOT be written back as it was before'
        );
        expect(output).toContain('The journey is not deleted');
        expect(puts().length).toBe(2);
        expect(changes().some((change) => change.startsWith('DELETE'))).toBe(
          false
        );
      },
      TIMEOUT
    );
  });
});
