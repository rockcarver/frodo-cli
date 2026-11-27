import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * The split of the generic agent writer of config-manager into the families `oauth-clients` (the
 * OAuth2 clients) and `agents` (every other agent type that has no command of its own), as the
 * ops functions behind `pull|push oauth-clients`, `pull|push agents` and the deprecated
 * `pull|push oauth2-agents` see it: the ops function takes the family as its last parameter, and
 * without it does what the old command did (both families, the same requests in the same order).
 *
 * Technique (as in ConfigManagerOauth2AgentsCimd.test.js): the library is a fake that logs every
 * call it gets, the module under test is real, and so are OperationRun, ApplicationOwnedObjects
 * and TreeLayout. The working directory is a real temporary directory. No tenant is contacted.
 * The fake-tenant test (ConfigManagerAgentsSplitFakeTenant.test.js) runs the same commands end to
 * end against test/utils/FakeAm.mjs.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

let tmp;
let currentRealm;
let printed;
/** What the commands say only with --verbose. */
let verbose;
/** Every call the fake library got, in order: the request log of the test. */
let calls;
/** The tenant: for each realm the agents and the OAuth2 clients it holds. */
let tenant;
const savedFiles = [];

class FrodoError extends Error {
  constructor(message, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = Array.isArray(originalErrors)
      ? originalErrors
      : originalErrors
        ? [originalErrors]
        : [];
  }
}

const escapePlaceholders = (content) =>
  JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'));

function mergeDeep(obj1, obj2) {
  if (obj1) {
    for (const key of Object.keys(obj2)) {
      if (!obj1.hasOwnProperty(key) || typeof obj2[key] !== 'object') {
        obj1[key] = obj2[key];
      } else {
        mergeDeep(obj1[key], obj2[key]);
      }
    }
  }
  return obj1;
}

const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const where = () => (currentRealm === '/' ? 'root' : currentRealm);

const readAgents = jest.fn(async () => {
  calls.push(`readAgents ${where()}`);
  return (tenant[currentRealm]?.agents ?? []).map(({ id, type }) => ({
    _id: id,
    _type: { _id: type },
  }));
});
const readOAuth2Clients = jest.fn(async () => {
  calls.push(`readOAuth2Clients ${where()}`);
  return (tenant[currentRealm]?.clients ?? []).map((id) => ({ _id: id }));
});
/** The single read: wrapped, with `_rev`, the one property that is set being the id. */
const readAgentByTypeAndId = jest.fn(async (type, id) => {
  calls.push(`read ${where()}/${type}/${id}`);
  if (tenant.failing?.includes(`${type}/${id}`)) {
    throw new FrodoError(`cannot read ${type} ${id}`);
  }
  return {
    _id: id,
    _rev: '-1',
    _type: { _id: type, name: type, collection: true },
    description: { inherited: false, value: `the ${type} ${id}` },
    // a property that is not set: a file leaves it out
    unset: { inherited: false },
  };
});
const importAgent = jest.fn(async (id) => {
  calls.push(`import ${where()}/${id}`);
  if (tenant.failing?.includes(id)) {
    throw new FrodoError(`cannot import ${id}`);
  }
  return {};
});
const readApplicationOwnership = jest.fn(async () => {
  calls.push(`readApplicationOwnership ${where()}`);
  return { entries: tenant[currentRealm]?.owned ?? [] };
});
const getApplicationOwners = jest.fn((index, kind, id) =>
  (index.entries.find((e) => e.kind === kind && e.id === id)?.owners ?? []).map(
    (owner) => ({ ...owner })
  )
);

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  state: {
    getDeploymentType: () => 'cloud',
    setRealm: (realm) => {
      currentRealm = realm;
    },
    getRealm: () => currentRealm,
  },
  frodo: {
    utils: {
      constants: {
        DEFAULT_REALM_KEY: '__default__realm__',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
      },
      getFilePath: (relative, create) => {
        const target = path.join(tmp, relative);
        if (create) fs.mkdirSync(path.dirname(target), { recursive: true });
        return target;
      },
      getWorkingDirectory: () => tmp,
      saveJsonToFile: jest.fn((data, filename) => {
        savedFiles.push(filename);
        const copy = structuredClone(data);
        delete copy._rev;
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, JSON.stringify(copy, null, 2));
      }),
      readJsonFile,
      escapePlaceholders,
      findFilesByName: jest.fn(),
      isBase64Encoded: jest.fn(),
      json: { mergeDeep },
    },
    realm: {
      readRealms: jest.fn(async () => {
        calls.push('readRealms');
        return Object.keys(tenant)
          .filter((realm) => realm !== 'failing')
          .map((name) => ({ name }));
      }),
    },
    agent: { readAgents, readAgentByTypeAndId, importAgent },
    oauth2oidc: { client: { readOAuth2Clients } },
    app: {
      readApplicationOwnership,
      getApplicationOwners,
      // what the tree says: the application records name the OAuth2 clients they own
      getApplicationOwnership: (records) => ({
        entries: records.flatMap((record) =>
          (record.ownedClients ?? []).map((id) => ({
            kind: 'oauth2Client',
            id,
            owners: [{ applicationName: record.name }],
          }))
        ),
      }),
    },
  },
}));

jest.unstable_mockModule(src('utils/Console'), () => ({
  printError: jest.fn((error, message) => {
    printed.push(`ERROR ${message ? `${message}: ` : ''}${error.message}`);
  }),
  printMessage: jest.fn((message, type) => {
    printed.push(`${(type ?? 'text').toUpperCase()} ${message}`);
  }),
  verboseMessage: jest.fn((message) => {
    verbose.push(message);
  }),
  createProgressIndicator: jest.fn(() => 'indicator'),
  stopProgressIndicator: jest.fn((id, message, status) => {
    printed.push(`INDICATOR ${status} ${message}`);
  }),
}));

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'kind-paths',
}));

const { configManagerExportOAuth2Agents, configManagerImportAgents } =
  await import(src('configManagerOps/FrConfigOauth2AgentOps.ts'));

const output = () => printed.join('\n');
const warnings = () => printed.filter((line) => line.startsWith('WARN '));

const write = (relative, content) => {
  const target = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
  return target;
};
const exists = (relative) => fs.existsSync(path.join(tmp, relative));
const AGENT_PATH = (type, id, realm = 'alpha') =>
  `realms/${realm}/realm-config/agents/${type}/${id}.json`;

/** Every file under a folder, relative to it, with its content: what a pull left behind. */
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

/** The decision of `pull all` for a tree that keeps one folder per application. */
const FOLDERS = { tree: 'marked', layout: 'folders', createMarker: false };

const WORLD = () => ({
  alpha: {
    agents: [
      { id: 'web-a', type: 'WebAgent' },
      { id: 'gateway-a', type: 'IdentityGatewayAgent' },
      { id: 'consent-a', type: 'RemoteConsentAgent' },
      { id: 'thing-a', type: 'OAuth2Thing' },
      { id: 'zion-issuer', type: 'TrustedJwtIssuer' },
    ],
    clients: ['zion-client', 'matrix-client'],
    owned: [
      {
        kind: 'oauth2Client',
        id: 'matrix-client',
        owners: [{ applicationName: 'Matrix Portal' }],
      },
    ],
  },
  bravo: {
    agents: [{ id: 'web-b', type: 'WebAgent' }],
    clients: ['bravo-client'],
  },
});

const CLIENT_FILES = [
  AGENT_PATH('OAuth2Client', 'zion-client'),
  AGENT_PATH('OAuth2Client', 'matrix-client'),
  AGENT_PATH('OAuth2Client', 'bravo-client', 'bravo'),
].sort();
const AGENT_FILES = [
  AGENT_PATH('WebAgent', 'web-a'),
  AGENT_PATH('IdentityGatewayAgent', 'gateway-a'),
  AGENT_PATH('RemoteConsentAgent', 'consent-a'),
  AGENT_PATH('OAuth2Thing', 'thing-a'),
  AGENT_PATH('WebAgent', 'web-b', 'bravo'),
].sort();
const filesOf = (dir) => Object.keys(treeOf(dir)).sort();

beforeEach(() => {
  currentRealm = undefined;
  printed = [];
  verbose = [];
  calls = [];
  savedFiles.length = 0;
  tenant = WORLD();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-agents-split-'));
  importAgent.mockClear();
  readAgents.mockClear();
  readOAuth2Clients.mockClear();
  readAgentByTypeAndId.mockClear();
  readApplicationOwnership.mockClear();
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('pull without a family is what the old oauth2-agents command did', () => {
  test('reads the agents, then the OAuth2 clients, then each object in the order of the type names, and writes both families', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        undefined
      )
    ).toBe(true);

    expect(calls).toEqual([
      'readAgents alpha',
      'readOAuth2Clients alpha',
      'read alpha/IdentityGatewayAgent/gateway-a',
      'read alpha/OAuth2Client/matrix-client',
      'read alpha/OAuth2Client/zion-client',
      'read alpha/OAuth2Thing/thing-a',
      'read alpha/RemoteConsentAgent/consent-a',
      'read alpha/WebAgent/web-a',
    ]);
    expect(filesOf(tmp)).toEqual(
      [
        ...CLIENT_FILES.filter((f) => f.includes('/alpha/')),
        ...AGENT_FILES.filter((f) => f.includes('/alpha/')),
      ].sort()
    );
  });

  test('says the old words: an error that names an agent or an OAuth2 client and a failure count in agents', async () => {
    tenant.failing = ['WebAgent/web-a'];

    expect(
      await configManagerExportOAuth2Agents(null, false, undefined, 'alpha')
    ).toBe(false);

    expect(output()).toContain('1 of 6 agents failed');
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        undefined,
        'x'
      )
    ).toBe(false);
    expect(output()).toContain(
      'Error: for a named agent or OAuth2 client, specify a single realm'
    );
  });
});

describe('pull oauth-clients', () => {
  test('lists the OAuth2 clients only: no list of agents is asked for, and no agent of the realm is read', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        undefined,
        'oauth-clients'
      )
    ).toBe(true);

    expect(calls).toEqual([
      'readOAuth2Clients alpha',
      'read alpha/OAuth2Client/matrix-client',
      'read alpha/OAuth2Client/zion-client',
    ]);
    expect(readAgents).not.toHaveBeenCalled();
    expect(filesOf(tmp)).toEqual(
      CLIENT_FILES.filter((f) => f.includes('/alpha/'))
    );
  });

  test('visits every realm of the tenant without a realm, and writes only OAuth2Client files', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        undefined,
        undefined,
        'oauth-clients'
      )
    ).toBe(true);

    expect(filesOf(tmp)).toEqual(CLIENT_FILES);
    expect(readAgents).not.toHaveBeenCalled();
  });

  test('-i finds one client in a single realm, and a client that is not there is named as an OAuth2 client', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'zion-client',
        'oauth-clients'
      )
    ).toBe(true);
    expect(filesOf(tmp)).toEqual([AGENT_PATH('OAuth2Client', 'zion-client')]);
    expect(readAgents).not.toHaveBeenCalled();

    printed = [];
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'web-a',
        'oauth-clients'
      )
    ).toBe(false);
    expect(output()).toContain(
      "OAuth2 client 'web-a' not found in realm 'alpha'."
    );
    expect(output()).not.toContain('have a command of their own');
  });

  test('-i needs a single realm and says OAuth2 client', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        undefined,
        'zion-client',
        'oauth-clients'
      )
    ).toBe(false);
    expect(output()).toContain(
      'Error: for a named OAuth2 client, specify a single realm'
    );
    expect(calls).toEqual(['readRealms']);
  });

  test('counts its failures as OAuth2 clients', async () => {
    tenant.failing = ['OAuth2Client/zion-client'];

    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        undefined,
        'oauth-clients'
      )
    ).toBe(false);

    expect(output()).toContain('1 of 2 OAuth2 clients failed');
    expect(
      await configManagerExportOAuth2Agents(
        null,
        true,
        undefined,
        'alpha',
        undefined,
        'oauth-clients'
      )
    ).toBe(true);
  });

  test('in a tree with one folder per application an OAuth2 client that an application owns is named and not pulled', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        FOLDERS,
        'alpha',
        undefined,
        'oauth-clients'
      )
    ).toBe(true);

    expect(filesOf(tmp)).toEqual([AGENT_PATH('OAuth2Client', 'zion-client')]);
    expect(output()).toContain('matrix-client');
    expect(output()).toContain('Matrix Portal');
    expect(
      calls.filter((c) => c.startsWith('readApplicationOwnership'))
    ).toEqual(['readApplicationOwnership alpha']);
  });
});

describe('pull agents', () => {
  test('lists the agents only: no OAuth2 client is listed, read or looked up for an owner', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        FOLDERS,
        'alpha',
        undefined,
        'agents'
      )
    ).toBe(true);

    expect(calls).toEqual([
      'readAgents alpha',
      'read alpha/IdentityGatewayAgent/gateway-a',
      'read alpha/OAuth2Thing/thing-a',
      'read alpha/RemoteConsentAgent/consent-a',
      'read alpha/WebAgent/web-a',
    ]);
    expect(readOAuth2Clients).not.toHaveBeenCalled();
    expect(readApplicationOwnership).not.toHaveBeenCalled();
    expect(filesOf(tmp)).toEqual(
      AGENT_FILES.filter((f) => f.includes('/alpha/'))
    );
  });

  test('leaves the three types that have a command of their own alone, as the old command did', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        undefined,
        'agents'
      )
    ).toBe(true);

    expect(exists(AGENT_PATH('TrustedJwtIssuer', 'zion-issuer'))).toBe(false);
    expect(calls.some((c) => c.includes('TrustedJwtIssuer'))).toBe(false);
  });

  test('-i finds one agent; an id that no agent has is named as an agent and says which types are left to their own commands', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'web-a',
        'agents'
      )
    ).toBe(true);
    expect(filesOf(tmp)).toEqual([AGENT_PATH('WebAgent', 'web-a')]);
    expect(readOAuth2Clients).not.toHaveBeenCalled();

    printed = [];
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'zion-client',
        'agents'
      )
    ).toBe(false);
    expect(output()).toContain(
      "Agent 'zion-client' not found in realm 'alpha'."
    );
    expect(output()).toContain(
      'oauth-cimd-profiles, oauth-issuers, oauth-software-publishers'
    );
  });

  test('-i with an id that two agents of different types have fails and names them, and pulls none', async () => {
    tenant.alpha.agents.push({ id: 'web-a', type: 'J2EEAgent' });

    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'web-a',
        'agents'
      )
    ).toBe(false);

    expect(output()).toContain(
      "More than one object of realm 'alpha' has the id 'web-a': J2EEAgent, WebAgent."
    );
    expect(filesOf(tmp)).toEqual([]);
  });

  test('counts its failures as agents and the failure of one agent does not stop the others', async () => {
    tenant.failing = ['WebAgent/web-a'];

    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        undefined,
        'agents'
      )
    ).toBe(false);

    expect(output()).toContain('1 of 4 agents failed');
    expect(filesOf(tmp).filter((f) => f.includes('/alpha/'))).toHaveLength(3);
    printed = [];
    expect(
      await configManagerExportOAuth2Agents(
        null,
        true,
        undefined,
        'alpha',
        undefined,
        'agents'
      )
    ).toBe(true);
  });
});

describe('the verbose line about the properties that a file leaves out', () => {
  const leftOut = () =>
    verbose.filter((line) => line.startsWith('Left '));
  const TAIL = 'written: a file holds only what is set on the object.';

  test('says agents for the old command and for agents, and OAuth2 clients for oauth-clients, in the singular for one object', async () => {
    await configManagerExportOAuth2Agents(null, false, undefined, 'alpha');
    expect(leftOut()).toEqual([
      `Left 6 unset or inherited properties out of 6 agents ${TAIL}`,
    ]);

    verbose = [];
    await configManagerExportOAuth2Agents(
      null,
      false,
      undefined,
      'alpha',
      undefined,
      'oauth-clients'
    );
    expect(leftOut()).toEqual([
      `Left 2 unset or inherited properties out of 2 OAuth2 clients ${TAIL}`,
    ]);

    verbose = [];
    await configManagerExportOAuth2Agents(
      null,
      false,
      undefined,
      'alpha',
      undefined,
      'agents'
    );
    expect(leftOut()).toEqual([
      `Left 4 unset or inherited properties out of 4 agents ${TAIL}`,
    ]);

    verbose = [];
    await configManagerExportOAuth2Agents(
      null,
      false,
      undefined,
      'alpha',
      'zion-client',
      'oauth-clients'
    );
    expect(leftOut()).toEqual([
      `Left 1 unset or inherited property out of 1 OAuth2 client ${TAIL}`,
    ]);
  });
});

describe('the two families together are the old command', () => {
  test('oauth-clients and agents into one tree leave the files of the old command, byte for byte, and ask for the same objects', async () => {
    await configManagerExportOAuth2Agents(null, false, FOLDERS, 'alpha');
    const oldTree = treeOf(tmp);
    const oldReads = calls.filter((c) => c.startsWith('read alpha/')).sort();
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);
    calls = [];

    await configManagerExportOAuth2Agents(
      null,
      false,
      FOLDERS,
      'alpha',
      undefined,
      'oauth-clients'
    );
    await configManagerExportOAuth2Agents(
      null,
      false,
      FOLDERS,
      'alpha',
      undefined,
      'agents'
    );

    expect(Object.keys(oldTree).length).toBeGreaterThan(0);
    expect(treeOf(tmp)).toEqual(oldTree);
    expect(calls.filter((c) => c.startsWith('read alpha/')).sort()).toEqual(
      oldReads
    );
  });

  test('every realm, too', async () => {
    await configManagerExportOAuth2Agents(null);
    const oldTree = treeOf(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);

    await configManagerExportOAuth2Agents(
      null,
      false,
      undefined,
      undefined,
      undefined,
      'oauth-clients'
    );
    await configManagerExportOAuth2Agents(
      null,
      false,
      undefined,
      undefined,
      undefined,
      'agents'
    );

    expect(treeOf(tmp)).toEqual(oldTree);
    expect(Object.keys(oldTree)).toHaveLength(
      CLIENT_FILES.length + AGENT_FILES.length
    );
  });
});

describe('a config file that lists entries of the other family', () => {
  const FILE = () => ({
    alpha: {
      OAuth2Client: [{ id: 'zion-client' }, { id: 'matrix-client' }],
      WebAgent: [{ id: 'web-a', overrides: { description: 'from the file' } }],
      TrustedJwtIssuer: [{ id: 'zion-issuer' }],
    },
    bravo: {
      WebAgent: [{ id: 'web-b' }],
      OAuth2Client: [{ id: 'bravo-client' }],
    },
  });
  const fileOf = () => write('config/oauth2-agents.json', FILE());

  test('oauth-clients pulls the client entries and skips the agent entries with one warning per realm and type that names agents', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        fileOf(),
        false,
        undefined,
        undefined,
        undefined,
        'oauth-clients'
      )
    ).toBe(true);

    expect(filesOf(tmp).filter((f) => f.startsWith('realms/'))).toEqual(
      CLIENT_FILES
    );
    expect(warnings()).toEqual([
      `WARN Skipping 1 WebAgent entry of realm 'alpha' (web-a): agents are pulled by "frodo config pull agents". Its overrides are not applied here: move them to the overrides file of that command (--config-file).`,
      `WARN Skipping 1 TrustedJwtIssuer entry of realm 'alpha' (zion-issuer): trusted JWT issuers are pulled by "frodo config pull oauth-issuers".`,
      `WARN Skipping 1 WebAgent entry of realm 'bravo' (web-b): agents are pulled by "frodo config pull agents".`,
    ]);
    expect(calls.some((c) => c.includes('WebAgent'))).toBe(false);
  });

  test('agents pulls the agent entries, with their overrides, and skips the client entries with one warning per realm that names oauth-clients', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        fileOf(),
        false,
        undefined,
        undefined,
        undefined,
        'agents'
      )
    ).toBe(true);

    expect(filesOf(tmp).filter((f) => f.startsWith('realms/'))).toEqual(
      [
        AGENT_PATH('WebAgent', 'web-a'),
        AGENT_PATH('WebAgent', 'web-b', 'bravo'),
      ].sort()
    );
    expect(
      JSON.parse(
        fs.readFileSync(path.join(tmp, AGENT_PATH('WebAgent', 'web-a')), 'utf8')
      ).description
    ).toBe('from the file');
    expect(warnings()).toEqual([
      `WARN Skipping 2 OAuth2Client entries of realm 'alpha' (zion-client, matrix-client): OAuth2 clients are pulled by "frodo config pull oauth-clients".`,
      `WARN Skipping 1 TrustedJwtIssuer entry of realm 'alpha' (zion-issuer): trusted JWT issuers are pulled by "frodo config pull oauth-issuers".`,
      `WARN Skipping 1 OAuth2Client entry of realm 'bravo' (bravo-client): OAuth2 clients are pulled by "frodo config pull oauth-clients".`,
    ]);
    expect(readOAuth2Clients).not.toHaveBeenCalled();
  });

  test('a skip is not a failure and not an operation: exit status true, nothing counted, --allow-failures changes nothing', async () => {
    const onlyOther = write('config/other.json', {
      alpha: { WebAgent: [{ id: 'web-a' }] },
    });
    tenant.failing = ['WebAgent/web-a'];

    expect(
      await configManagerExportOAuth2Agents(
        onlyOther,
        false,
        undefined,
        undefined,
        undefined,
        'oauth-clients'
      )
    ).toBe(true);
    const first = output();
    printed = [];
    expect(
      await configManagerExportOAuth2Agents(
        onlyOther,
        true,
        undefined,
        undefined,
        undefined,
        'oauth-clients'
      )
    ).toBe(true);

    expect(output()).toBe(first);
    expect(first).not.toContain('failed');
    expect(readAgentByTypeAndId).not.toHaveBeenCalled();
  });

  test('an empty list or an empty realm of the other family gives no warning', async () => {
    const empty = write('config/empty.json', {
      alpha: { OAuth2Client: [], WebAgent: [{ id: 'web-a' }] },
      bravo: { WebAgent: [], OAuth2Client: [{ id: 'bravo-client' }] },
    });

    expect(
      await configManagerExportOAuth2Agents(
        empty,
        false,
        undefined,
        undefined,
        undefined,
        'agents'
      )
    ).toBe(true);
    // bravo's client entry is the only entry of the other family
    expect(warnings()).toEqual([
      `WARN Skipping 1 OAuth2Client entry of realm 'bravo' (bravo-client): OAuth2 clients are pulled by "frodo config pull oauth-clients".`,
    ]);

    printed = [];
    expect(
      await configManagerExportOAuth2Agents(
        empty,
        false,
        undefined,
        undefined,
        undefined,
        'oauth-clients'
      )
    ).toBe(true);
    expect(warnings()).toEqual([
      `WARN Skipping 1 WebAgent entry of realm 'alpha' (web-a): agents are pulled by "frodo config pull agents".`,
    ]);
  });

  test('the old command skips nothing of the two families: it pulls the client entries and the agent entries', async () => {
    expect(await configManagerExportOAuth2Agents(fileOf())).toBe(true);

    expect(filesOf(tmp).filter((f) => f.startsWith('realms/'))).toEqual(
      [
        ...CLIENT_FILES,
        ...AGENT_FILES.filter((f) => f.includes('WebAgent')),
      ].sort()
    );
    expect(warnings().every((w) => w.includes('TrustedJwtIssuer'))).toBe(true);
  });

  test('the ownership of a realm is not read for entries of the other family alone', async () => {
    write('frodo-config-manager.json', {
      applications: 'folders',
      formatVersion: 1,
    });
    const onlyClients = write('config/only-clients.json', {
      alpha: { OAuth2Client: [{ id: 'zion-client' }] },
    });

    expect(
      await configManagerExportOAuth2Agents(
        onlyClients,
        false,
        FOLDERS,
        undefined,
        undefined,
        'agents'
      )
    ).toBe(true);

    expect(readApplicationOwnership).not.toHaveBeenCalled();
    expect(warnings()).toHaveLength(1);
  });

  test('oauth-clients reads the ownership of a realm only for a realm whose entries include a client, and an application that owns a client keeps it out of the pull', async () => {
    const onlyAgents = write('config/only-agents.json', {
      alpha: { WebAgent: [{ id: 'web-a' }] },
    });

    expect(
      await configManagerExportOAuth2Agents(
        onlyAgents,
        false,
        FOLDERS,
        undefined,
        undefined,
        'oauth-clients'
      )
    ).toBe(true);
    expect(readApplicationOwnership).not.toHaveBeenCalled();

    const withClients = write('config/with-clients.json', {
      alpha: {
        WebAgent: [{ id: 'web-a' }],
        OAuth2Client: [{ id: 'zion-client' }, { id: 'matrix-client' }],
      },
      bravo: { WebAgent: [{ id: 'web-b' }] },
    });
    printed = [];
    expect(
      await configManagerExportOAuth2Agents(
        withClients,
        false,
        FOLDERS,
        undefined,
        undefined,
        'oauth-clients'
      )
    ).toBe(true);

    // alpha holds a client entry, bravo only an agent entry
    expect(
      calls.filter((c) => c.startsWith('readApplicationOwnership'))
    ).toEqual(['readApplicationOwnership alpha']);
    expect(filesOf(tmp).filter((f) => f.startsWith('realms/'))).toEqual([
      AGENT_PATH('OAuth2Client', 'zion-client'),
    ]);
    expect(output()).toContain('Matrix Portal');
  });
});

describe('push', () => {
  /** A tree as a pull of both families writes it, plus the folders of the three types with a command of their own. */
  function writeTree() {
    for (const [type, id, realm] of [
      ['OAuth2Client', 'zion-client', 'alpha'],
      ['OAuth2Client', 'matrix-client', 'alpha'],
      ['WebAgent', 'web-a', 'alpha'],
      ['RemoteConsentAgent', 'consent-a', 'alpha'],
      ['OAuth2Thing', 'thing-a', 'alpha'],
      ['OAuth2Client', 'bravo-client', 'bravo'],
      ['SharedAgent', 'shared-b', 'bravo'],
      ['TrustedJwtIssuer', 'zion-issuer', 'alpha'],
      ['CIMDProfile', 'zion-profile', 'bravo'],
    ]) {
      write(AGENT_PATH(type, id, realm), {
        _id: id,
        description: `the ${type}`,
      });
    }
  }
  const imported = () =>
    calls
      .filter((c) => c.startsWith('import '))
      .map((c) => c.slice(7))
      .sort();

  test('without a family pushes the files of both families and says the old words', async () => {
    writeTree();

    expect(await configManagerImportAgents()).toBe(true);

    expect(imported()).toEqual(
      [
        'zion-client',
        'matrix-client',
        'web-a',
        'consent-a',
        'thing-a',
        'bravo-client',
        'shared-b',
      ]
        .map(
          (id) =>
            `${['bravo-client', 'shared-b'].includes(id) ? 'bravo' : 'alpha'}/${id}`
        )
        .sort()
    );
    expect(output()).toContain(
      'INDICATOR success Oauth2 Agents import completed.'
    );
    expect(warnings()).toEqual([
      'WARN Skipping the 1 TrustedJwtIssuer file(s) of realm \'alpha\': they are pushed by "frodo config push oauth-issuers".',
      'WARN Skipping the 1 CIMDProfile file(s) of realm \'bravo\': they are pushed by "frodo config push oauth-cimd-profiles".',
    ]);
  });

  test('oauth-clients pushes the OAuth2Client files only, says nothing about the folders of the other family, and says OAuth2 clients', async () => {
    writeTree();

    expect(await configManagerImportAgents(false, 'oauth-clients')).toBe(true);

    expect(imported()).toEqual([
      'alpha/matrix-client',
      'alpha/zion-client',
      'bravo/bravo-client',
    ]);
    expect(output()).toContain(
      'INDICATOR success OAuth2 clients import completed.'
    );
    expect(
      warnings().filter(
        (w) => !w.includes('TrustedJwtIssuer') && !w.includes('CIMDProfile')
      )
    ).toEqual([]);
  });

  test('agents pushes the files of the other types only, and reads no application folder', async () => {
    writeTree();
    write('realms/alpha/applications/zion/application.json', {
      name: 'Zion',
    });

    expect(await configManagerImportAgents(false, 'agents')).toBe(true);

    expect(imported()).toEqual([
      'alpha/consent-a',
      'alpha/thing-a',
      'alpha/web-a',
      'bravo/shared-b',
    ]);
    expect(output()).toContain('INDICATOR success Agents import completed.');
  });

  test('a file without an _id is one failed file, also when an application owns a client that is named like the file: it is not skipped as owned', async () => {
    writeTree();
    write('frodo-config-manager.json', {
      applications: 'folders',
      formatVersion: 1,
    });
    write('realms/alpha/applications/matrix/application.json', {
      name: 'Matrix Portal',
      ownedClients: ['matrix-client'],
    });
    // the file of the owned client name, without the id that names it
    write(AGENT_PATH('OAuth2Client', 'matrix-client'), {
      description: 'a file that holds no id',
    });
    write(AGENT_PATH('OAuth2Client', 'extra-client'), { description: 'none' });

    expect(await configManagerImportAgents(false, 'oauth-clients')).toBe(false);

    // nothing was sent for either file, and the file of the owned name is no "owned by an application" skip
    expect(imported()).toEqual(['alpha/zion-client', 'bravo/bravo-client']);
    expect(output()).not.toContain('Matrix Portal');
    expect(output()).toContain('2 of 4 OAuth2 clients failed');
    expect(output()).toContain('alpha/OAuth2Client/matrix-client.json');
    expect(output()).toContain('alpha/OAuth2Client/extra-client.json');
    expect(output()).toContain(
      "it has no '_id': the id of an object is the id that its file holds, not the name of the file"
    );
    // the canary: the id that a missing _id would have become never reaches the library
    expect(calls.join('\n')).not.toContain('undefined');

    // the same run with --allow-failures succeeds, and still sends nothing for them
    printed = [];
    calls = [];
    expect(await configManagerImportAgents(true, 'oauth-clients')).toBe(true);
    expect(imported()).toEqual(['alpha/zion-client', 'bravo/bravo-client']);
  });

  test('a file of the other family without an _id is a failed file too', async () => {
    writeTree();
    write(AGENT_PATH('WebAgent', 'no-id'), { description: 'none' });

    expect(await configManagerImportAgents(false, 'agents')).toBe(false);

    expect(imported()).toEqual([
      'alpha/consent-a',
      'alpha/thing-a',
      'alpha/web-a',
      'bravo/shared-b',
    ]);
    expect(output()).toContain('alpha/WebAgent/no-id.json');
  });

  test('oauth-clients does not read the application folders of a realm that holds no client, and agents does not read those of any realm', async () => {
    write('frodo-config-manager.json', {
      applications: 'folders',
      formatVersion: 1,
    });
    write(AGENT_PATH('OAuth2Client', 'zion-client'), { _id: 'zion-client' });
    write(AGENT_PATH('SharedAgent', 'shared-b', 'bravo'), { _id: 'shared-b' });
    // bravo holds agents only, and an application folder that cannot be read
    write('realms/bravo/applications/broken/application.json', 'not json');

    expect(await configManagerImportAgents(false, 'oauth-clients')).toBe(true);

    expect(imported()).toEqual(['alpha/zion-client']);
    expect(output()).not.toContain('application folders');
    printed = [];
    expect(await configManagerImportAgents(false, 'agents')).toBe(true);
    expect(output()).not.toContain('application folders');
  });

  test('the two families together push what the old command pushed, no file twice and none missed', async () => {
    writeTree();
    await configManagerImportAgents();
    const oldImports = imported();
    calls = [];

    await configManagerImportAgents(false, 'oauth-clients');
    await configManagerImportAgents(false, 'agents');

    expect(imported()).toEqual(oldImports);
    expect(new Set(imported()).size).toBe(imported().length);
  });

  test('a file that fails is counted in the unit of the family, and --allow-failures lets the push succeed', async () => {
    writeTree();
    tenant.failing = ['zion-client', 'web-a'];

    expect(await configManagerImportAgents(false, 'oauth-clients')).toBe(false);
    expect(output()).toContain('1 of 3 OAuth2 clients failed');
    printed = [];
    expect(await configManagerImportAgents(false, 'agents')).toBe(false);
    expect(output()).toContain('1 of 4 agents failed');
    expect(await configManagerImportAgents(true, 'agents')).toBe(true);
  });

  test('without a realms folder says what is missing, in the words of the family', async () => {
    expect(await configManagerImportAgents(false, 'oauth-clients')).toBe(false);
    expect(output()).toContain(
      'No realms folder found to import OAuth2 clients from'
    );
    printed = [];
    expect(await configManagerImportAgents(false, 'agents')).toBe(false);
    expect(output()).toContain('No realms folder found to import agents from');
    printed = [];
    expect(await configManagerImportAgents()).toBe(false);
    expect(output()).toContain(
      'No realms folder found to import OAuth2 agents from'
    );
  });

  test('an OAuth2 client that an application owns is skipped by oauth-clients in a tree with one folder per application', async () => {
    writeTree();
    write('frodo-config-manager.json', {
      applications: 'folders',
      formatVersion: 1,
    });
    write('realms/alpha/applications/matrix/application.json', {
      name: 'Matrix Portal',
      ownedClients: ['matrix-client'],
    });

    expect(await configManagerImportAgents(false, 'oauth-clients')).toBe(true);

    expect(imported()).toEqual(['alpha/zion-client', 'bravo/bravo-client']);
    expect(output()).toContain('matrix-client');
    expect(output()).toContain('Matrix Portal');

    // the agents family has nothing an application can own: it never reads the application folders
    // (a folder it could not read would fail the push of the clients, not of the agents)
    write('realms/alpha/applications/broken/application.json', 'not json');
    printed = [];
    calls = [];
    expect(await configManagerImportAgents(false, 'agents')).toBe(true);
    expect(imported()).toEqual([
      'alpha/consent-a',
      'alpha/thing-a',
      'alpha/web-a',
      'bravo/shared-b',
    ]);
    expect(output()).not.toContain('application folders');
    printed = [];
    expect(await configManagerImportAgents(false, 'oauth-clients')).toBe(false);
    expect(output()).toContain('application folders');
  });
});
