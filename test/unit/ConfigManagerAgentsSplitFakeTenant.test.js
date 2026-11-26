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
 * The commands `frodo config-manager pull|push oauth-clients` and `pull|push agents`, which split
 * the deprecated `pull|push oauth2-agents`, driven as the real CLI of this checkout against a fake
 * AM (test/utils/FakeAm.mjs, journey `password`, in a separate process), through the real library:
 * what the unit tests of the ops stub (ConfigManagerAgentsSplitOps.test.js), this checks end to
 * end, down to the requests that reach the tenant. The fake holds OAuth2 clients and agents of
 * several types in two realms. No tenant, no secrets, no master key, no terminal; a temporary HOME
 * and working directory keep it away from real profiles and files. The tenant is a classic one
 * (`-m classic`), because the fake serves AM only.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

/** An agent or OAuth2 client as the fake serves it: only what the files below need. */
const agent = (id, extra = {}) => ({
  _id: id,
  description: `the object ${id}`,
  ...extra,
});

/** The tenant: for each realm the objects of each agent type. */
const WORLD = () => ({
  alpha: {
    OAuth2Client: [agent('zion-client'), agent('matrix-client')],
    WebAgent: [agent('web-a')],
    IdentityGatewayAgent: [agent('gateway-a')],
    RemoteConsentAgent: [agent('consent-a')],
    J2EEAgent: [agent('java-a')],
    SoapSTSAgent: [agent('sts-a')],
    // a type that has a command of its own: neither family pulls it
    SoftwarePublisher: [agent('zion-publisher')],
  },
  bravo: {
    OAuth2Client: [agent('bravo-client')],
    SharedAgent: [agent('shared-b')],
    '2.2_Agent': [agent('policy-b')],
    OAuth2Thing: [agent('thing-b')],
  },
});

const CLIENT_FILES = [
  'realms/alpha/realm-config/agents/OAuth2Client/matrix-client.json',
  'realms/alpha/realm-config/agents/OAuth2Client/zion-client.json',
  'realms/bravo/realm-config/agents/OAuth2Client/bravo-client.json',
];
const AGENT_FILES = [
  'realms/alpha/realm-config/agents/IdentityGatewayAgent/gateway-a.json',
  'realms/alpha/realm-config/agents/J2EEAgent/java-a.json',
  'realms/alpha/realm-config/agents/RemoteConsentAgent/consent-a.json',
  'realms/alpha/realm-config/agents/SoapSTSAgent/sts-a.json',
  'realms/alpha/realm-config/agents/WebAgent/web-a.json',
  'realms/bravo/realm-config/agents/2.2_Agent/policy-b.json',
  'realms/bravo/realm-config/agents/OAuth2Thing/thing-b.json',
  'realms/bravo/realm-config/agents/SharedAgent/shared-b.json',
];

/** Every file under a folder, relative to it, with its content. */
function treeOf(dir) {
  const result = {};
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else result[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return result;
}

suite('config-manager oauth-clients and agents against a fake tenant', () => {
  let home;
  let work;
  let record;
  let fakeAm;
  /** How many requests of the log the test has taken already. */
  let seen = 0;
  const dirs = [];

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-agents-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-agents-work-'));
    record = path.join(home, 'requests.jsonl');
    seen = 0;
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    for (const dir of [home, work, ...dirs.splice(0)]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  /** Starts the fake with the given options and returns a function that runs the CLI once against it. */
  async function tenant(options = {}) {
    fakeAm = await startFakeAm({
      journey: 'password',
      recordPath: record,
      realms: ['alpha', 'bravo'],
      agents: WORLD(),
      ...options,
    });
    return (args, { cwd = work } = {}) =>
      new Promise((resolve, reject) => {
        const child = cp.spawn(binaryPath, [...args, '-m', 'classic'], {
          cwd,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_HOST: `http://127.0.0.1:${fakeAm.port}/am`,
            FRODO_USERNAME: 'someone',
            FRODO_PASSWORD: 'secret',
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            FRODO_NO_PROMPT: '1',
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
        child.once('close', (code) =>
          resolve({ code, stdout, stderr, output: stdout + stderr })
        );
      });
  }

  /** The requests that the last runs made, and forget them. */
  const taken = () => {
    const all = readRequests(record);
    const fresh = all.slice(seen);
    seen = all.length;
    return fresh;
  };
  /** `METHOD /path-from-realm-config` of the requests for agents, in the order they came. */
  const agentRequests = (requests) =>
    requests
      .filter((r) => r.url.includes('/realm-config/agents'))
      .map(
        (r) =>
          `${r.method} ${r.url
            .replace(/^.*\/realms\/root\/(realms\/)?/, '')
            .replace('/realm-config/agents', '')}`
      );
  const target = () => [`http://127.0.0.1:${fakeAm.port}/am`, 'alpha'];
  const files = (dir = work) =>
    Object.keys(treeOf(dir))
      .filter((file) => file.startsWith('realms/'))
      .sort();
  const pull = (run, word, ...more) =>
    run(['config-manager', 'pull', word, ...more]);
  const push = (run, word, ...more) =>
    run(['config-manager', 'push', word, ...more]);

  describe('pull', () => {
    it(
      'oauth-clients writes the OAuth2 clients of every realm only, and asks the tenant for them only',
      async () => {
        const run = await tenant();

        const { code, output } = await pull(run, 'oauth-clients');

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        expect(files()).toEqual(CLIENT_FILES);
        const asked = agentRequests(taken());
        // no agent type list, no list and no read of any other type
        expect(asked.length).toBeGreaterThan(0);
        expect(asked.filter((r) => !r.includes('/OAuth2Client'))).toEqual([]);
        // one list per realm, one read per client
        expect(asked.filter((r) => r.includes('?_queryFilter'))).toHaveLength(
          2
        );
        expect(asked.filter((r) => !r.includes('?_queryFilter'))).toHaveLength(
          3
        );
      },
      TIMEOUT
    );

    it(
      'agents writes the eight other types of every realm only, never a client or a type that has a command of its own, and never asks for a client',
      async () => {
        const run = await tenant();

        const { code, output } = await pull(run, 'agents');

        expect(output).not.toMatch(/Error|failed/);
        expect(code).toBe(0);
        expect(files()).toEqual(AGENT_FILES);
        const asked = agentRequests(taken());
        expect(asked.some((r) => r.includes('/OAuth2Client'))).toBe(false);
        // the type list of each realm is asked for; the publishers are listed (the library lists every
        // type it is offered) but never read
        expect(asked.filter((r) => r.startsWith('POST '))).toHaveLength(2);
        expect(asked.some((r) => r.includes('/SoftwarePublisher/'))).toBe(
          false
        );
      },
      TIMEOUT
    );

    it(
      'the two together leave the tree of the deprecated oauth2-agents, byte for byte, and the same objects are asked for',
      async () => {
        const run = await tenant();
        const old = await pull(run, 'oauth2-agents');
        expect(old.code).toBe(0);
        const oldTree = treeOf(work);
        const oldAsked = agentRequests(taken());
        fs.rmSync(path.join(work, 'realms'), { recursive: true });

        await pull(run, 'oauth-clients');
        await pull(run, 'agents');

        expect(Object.keys(oldTree).sort()).toEqual(
          [...CLIENT_FILES, ...AGENT_FILES].sort()
        );
        expect(treeOf(work)).toEqual(oldTree);
        // the same requests, as a set (the types of a realm are listed at once, in no fixed order)
        expect([...new Set(agentRequests(taken()))].sort()).toEqual(
          [...new Set(oldAsked)].sort()
        );
      },
      TIMEOUT
    );

    it(
      'the deprecated oauth2-agents asks the tenant for what it asked before the split (recorded on the main branch before the change), in the same order',
      async () => {
        const run = await tenant();

        const { code } = await pull(run, 'oauth2-agents');

        expect(code).toBe(0);
        const asked = agentRequests(taken());
        // as recorded: the realms in turn, each with the type list, the list of each type (these are sent
        // at once, so their order is not pinned) and the list of the OAuth2 clients last; then every read
        const lists = (realm) =>
          [
            'WebAgent',
            'IdentityGatewayAgent',
            'RemoteConsentAgent',
            'J2EEAgent',
            'SoapSTSAgent',
            'SoftwarePublisher',
            'OAuth2Client',
            'SharedAgent',
            '2.2_Agent',
            'OAuth2Thing',
          ].filter((type) => WORLD()[realm][type]);
        const expectedLists = ['alpha', 'bravo'].flatMap((realm) => [
          `POST ${realm}?_action=getAllTypes`,
          ...lists(realm).map(
            (type) => `GET ${realm}/${type}?_queryFilter=true`
          ),
        ]);
        const reads = asked.filter((r) => !r.includes('?'));
        const discovery = asked.filter((r) => r.includes('?'));
        expect(asked).toEqual([...discovery, ...reads]);
        expect([...discovery].sort()).toEqual([...expectedLists].sort());
        // the type list opens a realm, the list of the OAuth2 clients closes it, and bravo follows alpha
        const at = (text) => discovery.indexOf(text);
        expect(at('POST alpha?_action=getAllTypes')).toBe(0);
        expect(at('GET alpha/OAuth2Client?_queryFilter=true')).toBe(7);
        expect(at('POST bravo?_action=getAllTypes')).toBe(8);
        expect(at('GET bravo/OAuth2Client?_queryFilter=true')).toBe(12);
        expect(reads).toEqual([
          'GET alpha/IdentityGatewayAgent/gateway-a',
          'GET alpha/J2EEAgent/java-a',
          'GET alpha/OAuth2Client/matrix-client',
          'GET alpha/OAuth2Client/zion-client',
          'GET alpha/RemoteConsentAgent/consent-a',
          'GET alpha/SoapSTSAgent/sts-a',
          'GET alpha/WebAgent/web-a',
          'GET bravo/2.2_Agent/policy-b',
          'GET bravo/OAuth2Client/bravo-client',
          'GET bravo/OAuth2Thing/thing-b',
          'GET bravo/SharedAgent/shared-b',
        ]);
      },
      TIMEOUT
    );

    it(
      'the deprecated oauth2-agents says it is deprecated once on stderr, names the two commands, and still writes both families',
      async () => {
        const run = await tenant();

        const { code, stderr } = await pull(run, 'oauth2-agents');

        expect(code).toBe(0);
        expect(
          stderr.match(
            /Deprecated feature in use: 'frodo config-manager pull oauth2-agents'/g
          )
        ).toHaveLength(1);
        expect(stderr).toContain(
          'It does what "frodo config-manager pull oauth-clients" and "frodo config-manager pull agents" do together; use them instead.'
        );
        expect(files()).toEqual([...CLIENT_FILES, ...AGENT_FILES].sort());
      },
      TIMEOUT
    );

    it(
      'narrows to the realm that is given',
      async () => {
        const run = await tenant();

        await pull(run, 'oauth-clients', ...target());
        await pull(run, 'agents', ...target());

        expect(files()).toEqual(
          [...CLIENT_FILES, ...AGENT_FILES]
            .filter((f) => f.includes('/alpha/'))
            .sort()
        );
      },
      TIMEOUT
    );

    it(
      '-i pulls one object of one realm and asks for that family only; an id of the other family is not found',
      async () => {
        const run = await tenant();

        const client = await pull(
          run,
          'oauth-clients',
          '-i',
          'zion-client',
          ...target()
        );
        expect(client.code).toBe(0);
        expect(files()).toEqual([CLIENT_FILES[1]]);
        expect(
          agentRequests(taken()).every((r) => r.includes('/OAuth2Client'))
        ).toBe(true);

        const one = await pull(run, 'agents', '-i', 'web-a', ...target());
        expect(one.code).toBe(0);
        expect(files()).toEqual([
          CLIENT_FILES[1],
          'realms/alpha/realm-config/agents/WebAgent/web-a.json',
        ]);
        expect(
          agentRequests(taken()).some((r) => r.includes('/OAuth2Client'))
        ).toBe(false);

        const wrongClient = await pull(
          run,
          'oauth-clients',
          '-i',
          'web-a',
          ...target()
        );
        expect(wrongClient.code).toBe(1);
        expect(wrongClient.output).toContain(
          "OAuth2 client 'web-a' not found in realm 'alpha'."
        );
        const wrongAgent = await pull(
          run,
          'agents',
          '-i',
          'zion-client',
          ...target()
        );
        expect(wrongAgent.code).toBe(1);
        expect(wrongAgent.output).toContain(
          "Agent 'zion-client' not found in realm 'alpha'."
        );
      },
      TIMEOUT
    );

    it(
      'a config file that lists entries of both families is split between the two commands, each skipping the entries of the other with one warning that names the right command, and neither changes the file',
      async () => {
        const run = await tenant();
        const configFile = path.join(work, 'oauth2-agents.json');
        fs.writeFileSync(
          configFile,
          JSON.stringify({
            alpha: {
              OAuth2Client: [{ id: 'zion-client' }],
              WebAgent: [{ id: 'web-a' }],
              SoftwarePublisher: [{ id: 'zion-publisher' }],
            },
          })
        );
        const before = fs.readFileSync(configFile);

        const clients = await pull(
          run,
          'oauth-clients',
          '--config-file',
          'oauth2-agents.json'
        );
        expect(clients.code).toBe(0);
        expect(files()).toEqual([CLIENT_FILES[1]]);
        expect(clients.output).toContain(
          `Skipping 1 WebAgent entry of realm 'alpha' (web-a): agents are pulled by "frodo config-manager pull agents".`
        );
        expect(clients.output).toContain(
          'pulled by "frodo config-manager pull oauth-software-publishers"'
        );

        const agents = await pull(
          run,
          'agents',
          '--config-file',
          'oauth2-agents.json'
        );
        expect(agents.code).toBe(0);
        expect(files()).toEqual([
          CLIENT_FILES[1],
          'realms/alpha/realm-config/agents/WebAgent/web-a.json',
        ]);
        expect(agents.output).toContain(
          `Skipping 1 OAuth2Client entry of realm 'alpha' (zion-client): OAuth2 clients are pulled by "frodo config-manager pull oauth-clients".`
        );
        expect(fs.readFileSync(configFile).equals(before)).toBe(true);

        // the deprecated command skips no entry of the two families
        fs.rmSync(path.join(work, 'realms'), { recursive: true });
        const both = await pull(
          run,
          'oauth2-agents',
          '--config-file',
          'oauth2-agents.json'
        );
        expect(both.code).toBe(0);
        expect(files()).toEqual([
          CLIENT_FILES[1],
          'realms/alpha/realm-config/agents/WebAgent/web-a.json',
        ]);
        expect(both.output).not.toContain('Skipping 1 WebAgent');
        expect(both.output).not.toContain('Skipping 1 OAuth2Client');
      },
      TIMEOUT
    );

    it(
      'an agent that cannot be read fails the command and is named in one summary, the other agents are still pulled, and --allow-failures lets the command succeed',
      async () => {
        const run = await tenant({
          failRequests: [{ method: 'GET', path: '/agents/WebAgent/web-a' }],
        });

        const failing = await pull(run, 'agents', ...target());
        expect(failing.code).toBe(1);
        expect(failing.output).toMatch(/1 of 5 agents failed/);
        expect(failing.output).toContain('alpha/WebAgent/web-a');
        expect(files()).toEqual(
          AGENT_FILES.filter(
            (f) => f.includes('/alpha/') && !f.includes('web-a')
          )
        );

        const allowed = await pull(
          run,
          'agents',
          '--allow-failures',
          ...target()
        );
        expect(allowed.code).toBe(0);
        expect(allowed.output).toMatch(/1 of 5 agents failed/);

        // the clients are not asked for the agent, so the same tenant is fine for them
        const clients = await pull(run, 'oauth-clients', ...target());
        expect(clients.code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'pull oauth-clients ends with exit code 1 when a client cannot be read, names it in one summary of OAuth2 clients, still pulls the other clients, and ends with 0 with --allow-failures',
      async () => {
        const run = await tenant({
          failRequests: [
            { method: 'GET', path: '/agents/OAuth2Client/zion-client' },
          ],
        });

        const refused = await pull(run, 'oauth-clients', ...target());
        expect(refused.code).toBe(1);
        expect(refused.output).toMatch(/1 of 2 OAuth2 clients failed/);
        expect(refused.output).toContain('alpha/OAuth2Client/zion-client');
        expect(files()).toEqual([CLIENT_FILES[0]]);

        const allowed = await pull(
          run,
          'oauth-clients',
          '--allow-failures',
          ...target()
        );
        expect(allowed.code).toBe(0);
        expect(allowed.output).toMatch(/1 of 2 OAuth2 clients failed/);
      },
      TIMEOUT
    );
  });

  describe('push', () => {
    /** Pulls the whole world into the working directory, then starts a tenant that holds the types but no object. */
    async function pulledTree(extra = {}) {
      const first = await tenant();
      expect((await pull(first, 'oauth2-agents')).code).toBe(0);
      fakeAm.stop();
      const empty = Object.fromEntries(
        Object.entries(WORLD()).map(([realm, types]) => [
          realm,
          Object.fromEntries(Object.keys(types).map((type) => [type, []])),
        ])
      );
      const second = await tenant({ agents: empty, ...extra });
      seen = readRequests(record).length;
      return second;
    }
    /** The objects the PUT requests wrote: `<realm>/<Type>/<id>`. */
    const puts = (requests) =>
      requests
        .filter((r) => r.method === 'PUT')
        .map((r) =>
          decodeURIComponent(
            r.url
              .replace(/^.*\/json\/realms\/root\/(realms\/)?/, '')
              .replace('/realm-config/agents', '')
          )
        )
        .sort();
    /** The same objects, from the files of the tree: `realms/<realm>/realm-config/agents/<Type>/<id>.json`. */
    const objectsOf = (list) =>
      list
        .map((file) => {
          const [, realm, type, id] = file.match(
            /^realms\/([^/]+)\/realm-config\/agents\/([^/]+)\/(.+)\.json$/
          );
          return `${realm}/${type}/${id}`;
        })
        .sort();

    it(
      'oauth-clients sends the OAuth2 client files only, and agents the files of the other types only, none of them the folder of a type that has a command of its own',
      async () => {
        const run = await pulledTree();
        fs.mkdirSync(
          path.join(work, 'realms/alpha/realm-config/agents/SoftwarePublisher'),
          { recursive: true }
        );
        fs.writeFileSync(
          path.join(
            work,
            'realms/alpha/realm-config/agents/SoftwarePublisher/zion-publisher.json'
          ),
          JSON.stringify(agent('zion-publisher'))
        );

        const clients = await push(run, 'oauth-clients');
        expect(clients.code).toBe(0);
        expect(puts(taken())).toEqual(objectsOf(CLIENT_FILES));
        expect(clients.output).toContain('OAuth2 clients import completed.');

        const agents = await push(run, 'agents');
        expect(agents.code).toBe(0);
        const agentPuts = puts(taken());
        expect(agentPuts).toEqual(objectsOf(AGENT_FILES));
        expect(agents.output).toContain('Agents import completed.');
        expect(agents.output).toContain(
          `Skipping the 1 SoftwarePublisher file(s) of realm 'alpha': they are pushed by "frodo config-manager push oauth-software-publishers".`
        );
      },
      TIMEOUT
    );

    it(
      'the deprecated oauth2-agents sends what the two send together, and says it is deprecated',
      async () => {
        const run = await pulledTree();

        const { code, stderr } = await push(run, 'oauth2-agents');

        expect(code).toBe(0);
        expect(puts(taken())).toEqual(
          objectsOf([...CLIENT_FILES, ...AGENT_FILES])
        );
        expect(stderr).toContain(
          "Deprecated feature in use: 'frodo config-manager push oauth2-agents'."
        );
      },
      TIMEOUT
    );

    it(
      'a file that the tenant refuses fails the command and is named in one summary, and --allow-failures lets it succeed',
      async () => {
        const run = await pulledTree({
          failRequests: [{ method: 'PUT', path: '/agents/WebAgent/web-a' }],
        });

        const refused = await push(run, 'agents');
        expect(refused.code).toBe(1);
        expect(refused.output).toMatch(/1 of 8 agents failed/);
        expect(refused.output).toContain('alpha/WebAgent/web-a.json');

        const allowed = await push(run, 'agents', '--allow-failures');
        expect(allowed.code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'push oauth-clients ends with exit code 1 when the tenant refuses a client, names it in one summary of OAuth2 clients, still sends the other clients, and ends with 0 with --allow-failures',
      async () => {
        const run = await pulledTree({
          failRequests: [
            { method: 'PUT', path: '/agents/OAuth2Client/zion-client' },
          ],
        });

        const refused = await push(run, 'oauth-clients');
        expect(refused.code).toBe(1);
        expect(refused.output).toMatch(/1 of 3 OAuth2 clients failed/);
        expect(refused.output).toContain('alpha/OAuth2Client/zion-client.json');
        // every client was sent, the refused one included
        expect(puts(taken())).toEqual(objectsOf(CLIENT_FILES));

        const allowed = await push(run, 'oauth-clients', '--allow-failures');
        expect(allowed.code).toBe(0);
        expect(allowed.output).toMatch(/1 of 3 OAuth2 clients failed/);
      },
      TIMEOUT
    );
  });
});
