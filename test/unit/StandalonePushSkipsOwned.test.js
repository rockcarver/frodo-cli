import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * The standalone push kinds (`oauth2-agents`, `saml`, `connector-definitions`,
 * `connector-mappings`) in a tree that uses the application layout (decision
 * record 0042, slice S4b of frodo-cli#1101): an object that an application
 * folder of the tree owns is named and skipped, because `push applications`
 * pushes it from the folder of the application. The ownership comes from the
 * `application.json` files of the tree, never from the tenant. A tree without
 * the layout marker is pushed exactly as it was, and its application folders are
 * not even looked at.
 *
 * The library is a set of fakes, the files are real, in a temporary folder. The
 * per-user settings are a fake too: nothing here may touch the real home.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

let tmp;
let deployment;
let currentRealm;

const mkdirFor = (rel) => {
  const target = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
};

// The two pure functions of the library that build the ownership index from application records,
// with the semantics of the library: the OAuth2 client of `ssoEntities.oidcId`, the SAML providers
// of `ssoEntities.idpPrivateId` / `spPrivateId` (base64 of the entity id), the connector of
// `connectorId` and the mappings of `mappingNames`.
const decode = (encoded) => Buffer.from(encoded, 'base64').toString();
const referencesOf = (record) => [
  ...(record.ssoEntities?.oidcId
    ? [{ kind: 'oauth2Client', id: record.ssoEntities.oidcId }]
    : []),
  ...(record.ssoEntities?.idpPrivateId
    ? [
        {
          kind: 'saml2Provider',
          id: decode(record.ssoEntities.idpPrivateId),
        },
      ]
    : []),
  ...(record.ssoEntities?.spPrivateId
    ? [
        {
          kind: 'saml2Provider',
          id: decode(record.ssoEntities.spPrivateId),
        },
      ]
    : []),
  ...(record.connectorId
    ? [{ kind: 'connector', id: record.connectorId }]
    : []),
  ...(record.mappingNames ?? []).map((id) => ({ kind: 'mapping', id })),
];

jest.unstable_mockModule('@rockcarver/frodo-lib', () => {
  class FrodoError extends Error {
    constructor(message, original) {
      super(message);
      this.original = original;
    }
  }
  return {
    FrodoError,
    state: {
      getDeploymentType: () => deployment,
      getRealm: () => currentRealm,
      setRealm: (realm) => {
        currentRealm = realm;
      },
    },
    frodo: {
      utils: {
        constants: {
          DEFAULT_REALM_KEY: '__default__realm__',
          CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
          FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        },
        getWorkingDirectory: () => tmp,
        getFilePath: (rel, create = false) =>
          create ? mkdirFor(rel) : path.join(tmp, rel),
        saveJsonToFile: (data, file) =>
          fs.writeFileSync(file, JSON.stringify(data, null, 2)),
        // like the library: a placeholder without a value is an error that names it
        readJsonFile: (file) => {
          const text = fs.readFileSync(file, 'utf8');
          const missing = [...text.matchAll(/\$\{([A-Z0-9_]+)\}/g)]
            .map((m) => m[1])
            .find((name) => process.env[name] === undefined);
          if (missing) {
            throw new Error(`No value found for placeholder "${missing}"`);
          }
          return JSON.parse(text);
        },
        escapePlaceholders: (content) => content,
        findFilesByName: () => [],
        isBase64Encoded: () => false,
        json: { mergeDeep: (a, b) => ({ ...a, ...b }) },
      },
      realm: { readRealms: async () => [] },
      app: {
        // a push never asks the tenant: these are the only application calls it may make
        getApplicationOwnership: jest.fn((records) => {
          const entries = new Map();
          for (const record of records) {
            for (const ref of referencesOf(record)) {
              const key = `${ref.kind}\u0000${ref.id}`;
              if (!entries.has(key)) entries.set(key, { ...ref, owners: [] });
              entries.get(key).owners.push({ applicationName: record.name });
            }
          }
          return { entries: [...entries.values()] };
        }),
        getApplicationOwners: (index, kind, id) =>
          (
            index.entries.find((e) => e.kind === kind && e.id === id)?.owners ??
            []
          ).map((owner) => ({ ...owner })),
        readApplicationOwnership: jest.fn(async () => {
          throw new Error('a push must not read the ownership from a tenant');
        }),
      },
      agent: { importAgent: jest.fn() },
      saml2: {
        entityProvider: { importSaml2Providers: jest.fn() },
        circlesOfTrust: { importCirclesOfTrust: jest.fn() },
      },
      idm: {
        connector: { importConnectors: jest.fn() },
        config: {
          importConfigEntities: jest.fn(),
          importSubConfigEntity: jest.fn(),
        },
      },
    },
  };
});

const console_ = {
  printError: jest.fn(),
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
  createProgressIndicator: jest.fn(() => 'indicator'),
  updateProgressIndicator: jest.fn(),
  stopProgressIndicator: jest.fn(),
};
jest.unstable_mockModule(src('utils/Console'), () => console_);
jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  IS_THE_FAKE_SETTINGS_STORE: true,
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'folders',
}));
jest.unstable_mockModule(src('utils/Config'), () => ({
  extractFrConfigDataToFile: () => {},
}));

const { configManagerImportAgents } = await import(
  src('configManagerOps/FrConfigOauth2AgentOps.ts')
);
const { configManagerImportSaml } = await import(
  src('configManagerOps/FrConfigSamlOps.ts')
);
const { configManagerImportConnectors } = await import(
  src('configManagerOps/FrConfigConnectorDefinitionsOps.ts')
);
const { configManagerImportMappings } = await import(
  src('configManagerOps/FrConfigConnectorMappingOps.ts')
);
const { OwnedObjects, ownedObjectMessage } = await import(
  src('ops/ApplicationOwnedObjects.ts')
);
const settingsStore = await import(src('utils/SettingsStore.ts'));
const { frodo } = await import('@rockcarver/frodo-lib');

beforeAll(() => {
  // abort before anything runs if the fake did not replace the settings of the real home
  if (settingsStore.IS_THE_FAKE_SETTINGS_STORE !== true) {
    throw new Error(
      `the settings store is not the fake: refusing to run against ${os.homedir()}`
    );
  }
});

// ---- helpers --------------------------------------------------------------

const MARKER = 'frodo-config-manager.json';
const mark = (layout = 'folders') =>
  fs.writeFileSync(
    path.join(tmp, MARKER),
    JSON.stringify({ applications: layout, formatVersion: 1 })
  );
const write = (rel, content) => {
  fs.writeFileSync(
    mkdirFor(rel),
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
};
const encode = (id) => Buffer.from(id).toString('base64url');
const messages = () =>
  console_.printMessage.mock.calls.map(([text]) => String(text)).join('\n');
const errors = () =>
  console_.printError.mock.calls
    .map(([error, text]) => `${text ?? ''} ${error?.message ?? error}`)
    .join('\n');

/** Every file of the tree with its content: to prove a push changed nothing in it. */
const treeFiles = () => {
  const found = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found[path.relative(tmp, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(tmp);
  return found;
};

/** What the push looked at in the application folders: reads of the directories and of the records. */
const watchApplicationFolders = () => {
  const reads = { directories: [], records: [] };
  const readdir = fs.readdirSync;
  const readFile = fs.readFileSync;
  const spies = [
    jest.spyOn(fs, 'readdirSync').mockImplementation((...args) => {
      if (String(args[0]).includes(`${path.sep}applications`)) {
        reads.directories.push(String(args[0]));
      }
      return readdir(...args);
    }),
    jest.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      if (String(args[0]).endsWith('application.json')) {
        reads.records.push(String(args[0]));
      }
      return readFile(...args);
    }),
  ];
  reads.stop = () => spies.forEach((spy) => spy.mockRestore());
  return reads;
};

const applicationRecord = (realmFolder, folder, record) =>
  write(
    `realms/${realmFolder}/applications/${folder}/application.json`,
    record
  );

const zionPortal = {
  name: 'Zion Portal',
  ssoEntities: { oidcId: 'portal-client' },
};
const zionSso = {
  name: 'Zion SSO',
  ssoEntities: {
    idpPrivateId: encode('https://idp.zion.example.com'),
    spPrivateId: encode('https://sp.zion.example.com'),
  },
};
const zionHr = {
  name: 'Zion HR',
  connectorId: 'Entra',
  mappingNames: ['systemEntraUser_managedBravo_user'],
};

const clientFile = (realmFolder, type, id, extra = {}) =>
  write(`realms/${realmFolder}/realm-config/agents/${type}/${id}.json`, {
    _id: id,
    ...extra,
  });
const providerFile = (realmFolder, location, entityId) =>
  write(
    `realms/${realmFolder}/realm-config/saml/${location}/${entityId.replace(/[^a-z0-9]+/gi, '_')}.json`,
    { config: { entityId }, metadata: `<md ${entityId}/>` }
  );
const connectorFile = (name) =>
  write(`sync/connectors/${name}.json`, {
    _id: `provisioner.openicf/${name}`,
    name,
  });
const mappingFile = (name, extra = {}) =>
  write(`sync/mappings/${name}/${name}.json`, { name, ...extra });

const importedAgentIds = () =>
  frodo.agent.importAgent.mock.calls.map(([id]) => id).sort();
const importedEntityIds = () =>
  frodo.saml2.entityProvider.importSaml2Providers.mock.calls
    .flatMap(([data]) => [
      ...Object.keys(data.saml.hosted),
      ...Object.keys(data.saml.remote),
    ])
    .sort();
const importedConnectorIds = () =>
  frodo.idm.connector.importConnectors.mock.calls
    .flatMap(([data]) => Object.keys(data.connector))
    .sort();
const subImportedMappingNames = () =>
  frodo.idm.config.importSubConfigEntity.mock.calls
    .map(([, mapping]) => mapping.name)
    .sort();

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-standalone-push-skip-'));
  deployment = 'cloud';
  currentRealm = '/';
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- oauth2-agents --------------------------------------------------------------

describe('push oauth2-agents', () => {
  const tree = () => {
    applicationRecord('alpha', 'Zion_Portal', zionPortal);
    clientFile('alpha', 'OAuth2Client', 'portal-client');
    clientFile('alpha', 'OAuth2Client', 'other-client');
    clientFile('alpha', 'IdentityGatewayAgent', 'portal-client');
    clientFile('bravo', 'OAuth2Client', 'portal-client');
  };

  test('a client that an application folder owns is named and skipped, the others are pushed, no file of the tree changes', async () => {
    mark();
    tree();
    const before = treeFiles();

    const outcome = await configManagerImportAgents();

    expect(outcome).toBe(true);
    // alpha/other-client, alpha/IdentityGatewayAgent/portal-client, bravo/portal-client
    expect(importedAgentIds()).toEqual([
      'other-client',
      'portal-client',
      'portal-client',
    ]);
    expect(messages()).toContain(
      'OAuth2 client portal-client is owned by application "Zion Portal" and is pushed by "push applications".'
    );
    expect(treeFiles()).toEqual(before);
    expect(errors()).toBe('');
  });

  test('only the clients of the realm of the application are owned: the same id in another realm is pushed, and so is an agent of another type', async () => {
    mark();
    tree();
    clientFile('alpha', 'IdentityGatewayAgent', 'portal-client', {
      is: 'gateway',
    });
    clientFile('bravo', 'OAuth2Client', 'portal-client', {
      is: 'bravo client',
    });

    await configManagerImportAgents();

    const pushed = frodo.agent.importAgent.mock.calls
      .map(([id, data]) => [id, data.agent[id].is])
      .sort();
    expect(pushed).toEqual([
      ['other-client', undefined],
      ['portal-client', 'bravo client'],
      ['portal-client', 'gateway'],
    ]);
    expect(
      messages().match(/OAuth2 client portal-client is owned by/g)
    ).toHaveLength(1);
  });

  test('a client with two owners is skipped and both are named', async () => {
    mark();
    tree();
    applicationRecord('alpha', 'Zion_Mobile', {
      name: 'Zion Mobile',
      ssoEntities: { oidcId: 'portal-client' },
    });

    await configManagerImportAgents();

    expect(messages()).toContain(
      'is owned by applications "Zion Mobile" and "Zion Portal" and is pushed by "push applications".'
    );
  });

  test('the file is not read to decide: an owned client whose secret placeholder has no value is skipped, not a failure', async () => {
    mark();
    applicationRecord('alpha', 'Zion_Portal', zionPortal);
    clientFile('alpha', 'OAuth2Client', 'portal-client', {
      userpassword: '${PORTAL_CLIENT_SECRET_NOT_SET_ANYWHERE}',
    });
    clientFile('alpha', 'OAuth2Client', 'other-client', {
      userpassword: '${OTHER_CLIENT_SECRET_NOT_SET_ANYWHERE}',
    });

    const outcome = await configManagerImportAgents();

    // the owned client is skipped; the other one still needs its secret and fails as before
    expect(outcome).toBe(false);
    expect(messages()).toContain('OAuth2 client portal-client is owned by');
    expect(errors()).toContain('OTHER_CLIENT_SECRET_NOT_SET_ANYWHERE');
    expect(errors()).not.toContain('PORTAL_CLIENT_SECRET_NOT_SET_ANYWHERE');
  });

  test('the id is the _id of the file, not the name it is kept under', async () => {
    mark();
    applicationRecord('alpha', 'Zion_Portal', zionPortal);
    write('realms/alpha/realm-config/agents/OAuth2Client/renamed.json', {
      _id: 'portal-client',
    });

    await configManagerImportAgents();

    expect(importedAgentIds()).toEqual([]);
    expect(messages()).toContain('OAuth2 client portal-client is owned by');
  });

  test('a tree without the marker, and one with the kind-paths layout, push everything and do not look at the application folders', async () => {
    tree();
    const reads = watchApplicationFolders();
    try {
      expect(await configManagerImportAgents()).toBe(true);
      expect(importedAgentIds()).toHaveLength(4);
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);
      expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();

      jest.clearAllMocks();
      mark('kind-paths');
      expect(await configManagerImportAgents()).toBe(true);
      expect(importedAgentIds()).toHaveLength(4);
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);
      expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();
    } finally {
      reads.stop();
    }
    expect(messages()).not.toContain('is owned by');
  });

  test('a deployment without applications is pushed in full even in a marked tree', async () => {
    deployment = 'classic';
    mark();
    tree();

    await configManagerImportAgents();

    expect(importedAgentIds()).toHaveLength(4);
    expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();
  });

  test('the application folders of a realm are read once, however many clients ask', async () => {
    mark();
    tree();
    applicationRecord('bravo', 'Zion_Other', {
      name: 'Zion Other',
      ssoEntities: { oidcId: 'other-client' },
    });
    clientFile('bravo', 'OAuth2Client', 'a');
    clientFile('bravo', 'OAuth2Client', 'b');
    const reads = watchApplicationFolders();
    try {
      await configManagerImportAgents();
    } finally {
      reads.stop();
    }

    // one ownership index per realm that has agents and application folders
    expect(frodo.app.getApplicationOwnership).toHaveBeenCalledTimes(2);
    expect(
      reads.directories.filter((d) =>
        d.endsWith(`${path.sep}alpha${path.sep}applications`)
      )
    ).toHaveLength(1);
    expect(
      reads.directories.filter((d) =>
        d.endsWith(`${path.sep}bravo${path.sep}applications`)
      )
    ).toHaveLength(1);
    expect(reads.records).toHaveLength(2);
    expect(frodo.app.readApplicationOwnership).not.toHaveBeenCalled();
  });

  test('a realm without application folders owns nothing: its clients are all pushed', async () => {
    mark();
    clientFile('bravo', 'OAuth2Client', 'portal-client');

    expect(await configManagerImportAgents()).toBe(true);

    expect(importedAgentIds()).toEqual(['portal-client']);
    expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();
  });

  test('an application folder that cannot be read fails the clients of its realm as one operation naming the folder; its other agents and the other realms are pushed', async () => {
    mark();
    tree();
    write('realms/alpha/applications/Broken/application.json', '{ not json');
    write('realms/alpha/applications/Empty/readme.txt', 'no record here');

    const outcome = await configManagerImportAgents();

    expect(outcome).toBe(false);
    // the gateway agent of alpha and the client of bravo; nothing from alpha's OAuth2Client folder
    expect(importedAgentIds()).toEqual(['portal-client', 'portal-client']);
    expect(errors()).toContain('realms/alpha/applications/Broken');
    expect(errors()).toContain(
      'realms/alpha/applications/Empty (the folder has no application.json)'
    );
    expect(messages()).toContain('application folders of realm alpha');
    expect(messages()).toMatch(/1 of \d+ agents failed/);
    // nothing was owned by a guess
    expect(messages()).not.toContain('is owned by');
  });

  test('with --allow-failures the unreadable folder is reported and the command still succeeds', async () => {
    mark();
    tree();
    write('realms/alpha/applications/Broken/application.json', '[]');

    expect(await configManagerImportAgents(true)).toBe(true);
    expect(errors()).toContain('realms/alpha/applications/Broken');
  });

  test('a record without a name cannot name an owner: that is an unreadable folder too', async () => {
    mark();
    tree();
    write('realms/alpha/applications/Nameless/application.json', {
      ssoEntities: { oidcId: 'other-client' },
    });

    expect(await configManagerImportAgents()).toBe(false);
    expect(errors()).toContain('realms/alpha/applications/Nameless');
  });

  test('the root realm of a ForgeOps deployment has its own application folders, kept under root', async () => {
    deployment = 'forgeops';
    mark();
    applicationRecord('root', 'Zion_Portal', zionPortal);
    clientFile('root', 'OAuth2Client', 'portal-client');
    clientFile('root', 'OAuth2Client', 'other-client');
    clientFile('alpha', 'OAuth2Client', 'portal-client');

    await configManagerImportAgents();

    // the root client is owned; the alpha client of the same id is not
    expect(importedAgentIds()).toEqual(['other-client', 'portal-client']);
    expect(
      messages().match(/is owned by application "Zion Portal"/g)
    ).toHaveLength(1);
  });

  test('a marker that cannot be read fails the command', async () => {
    fs.writeFileSync(path.join(tmp, MARKER), '{ not json');
    tree();

    expect(await configManagerImportAgents()).toBe(false);
    expect(errors()).toMatch(/layout marker/);
    expect(importedAgentIds()).toEqual([]);
  });
});

// ---- saml ------------------------------------------------------------------------

describe('push saml', () => {
  const tree = () => {
    applicationRecord('alpha', 'Zion_SSO', zionSso);
    providerFile('alpha', 'hosted', 'https://idp.zion.example.com');
    providerFile('alpha', 'remote', 'https://sp.zion.example.com');
    providerFile('alpha', 'remote', 'https://other.example.com');
    write('realms/alpha/realm-config/saml/COT/ZionCot.json', {
      _id: 'ZionCot',
      trustedProviders: ['https://idp.zion.example.com|saml2'],
    });
  };

  test('the providers that an application folder owns are named and skipped; the other provider and the circle of trust are pushed; no file changes', async () => {
    mark();
    tree();
    const before = treeFiles();

    const outcome = await configManagerImportSaml();

    expect(outcome).toBe(true);
    expect(importedEntityIds()).toEqual(['https://other.example.com']);
    expect(messages()).toContain(
      'SAML provider https://idp.zion.example.com is owned by application "Zion SSO" and is pushed by "push applications".'
    );
    expect(messages()).toContain(
      'SAML provider https://sp.zion.example.com is owned by application "Zion SSO" and is pushed by "push applications".'
    );
    expect(
      frodo.saml2.circlesOfTrust.importCirclesOfTrust
    ).toHaveBeenCalledTimes(1);
    expect(treeFiles()).toEqual(before);
    expect(errors()).toBe('');
  });

  test('the entity id is the one inside the file, not the name the file is kept under', async () => {
    mark();
    applicationRecord('alpha', 'Zion_SSO', zionSso);
    write('realms/alpha/realm-config/saml/hosted/whatever.json', {
      config: { entityId: 'https://idp.zion.example.com' },
      metadata: '<md/>',
    });

    await configManagerImportSaml();

    expect(importedEntityIds()).toEqual([]);
    expect(messages()).toContain('is owned by application "Zion SSO"');
  });

  test('a named entity that an application owns is skipped, which is neither a failure nor "not found"', async () => {
    mark();
    tree();

    const outcome = await configManagerImportSaml(
      'alpha',
      'https://sp.zion.example.com'
    );

    expect(outcome).toBe(true);
    expect(importedEntityIds()).toEqual([]);
    expect(messages()).toContain(
      'SAML provider https://sp.zion.example.com is owned by'
    );
    expect(messages()).not.toContain('not found');
  });

  test('a tree without the marker, and one with the kind-paths layout, push every provider and do not look at the application folders', async () => {
    tree();
    const reads = watchApplicationFolders();
    try {
      expect(await configManagerImportSaml()).toBe(true);
      expect(importedEntityIds()).toHaveLength(3);
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);

      jest.clearAllMocks();
      mark('kind-paths');
      expect(await configManagerImportSaml()).toBe(true);
      expect(importedEntityIds()).toHaveLength(3);
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);
    } finally {
      reads.stop();
    }
    expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();
    expect(messages()).not.toContain('is owned by');
  });

  test('the application folders of a realm are read once for its hosted and its remote providers', async () => {
    mark();
    tree();
    const reads = watchApplicationFolders();
    try {
      await configManagerImportSaml();
    } finally {
      reads.stop();
    }

    expect(frodo.app.getApplicationOwnership).toHaveBeenCalledTimes(1);
    expect(reads.directories).toHaveLength(1);
    expect(reads.records).toHaveLength(1);
  });

  test('an application folder that cannot be read fails the providers of its realm as one operation naming the folder, and its circle of trust is still pushed', async () => {
    mark();
    tree();
    write('realms/alpha/applications/Broken/application.json', '{ not json');

    const outcome = await configManagerImportSaml();

    expect(outcome).toBe(false);
    expect(importedEntityIds()).toEqual([]);
    expect(
      frodo.saml2.circlesOfTrust.importCirclesOfTrust
    ).toHaveBeenCalledTimes(1);
    expect(errors()).toContain('realms/alpha/applications/Broken');
    expect(messages()).toContain('application folders of realm alpha');

    jest.clearAllMocks();
    expect(await configManagerImportSaml(undefined, undefined, true)).toBe(
      true
    );
  });

  test('the root realm of a ForgeOps deployment has its own application folders, kept under root', async () => {
    deployment = 'forgeops';
    mark();
    applicationRecord('root', 'Zion_SSO', zionSso);
    providerFile('root', 'hosted', 'https://idp.zion.example.com');
    providerFile('root', 'remote', 'https://other.example.com');
    providerFile('alpha', 'hosted', 'https://idp.zion.example.com');

    expect(await configManagerImportSaml()).toBe(true);

    // only the root provider of the application is owned
    expect(importedEntityIds()).toEqual([
      'https://idp.zion.example.com',
      'https://other.example.com',
    ]);
    expect(
      messages().match(/is owned by application "Zion SSO"/g)
    ).toHaveLength(1);
  });

  test('a marker that cannot be read fails the command', async () => {
    fs.writeFileSync(path.join(tmp, MARKER), '{ not json');
    tree();

    expect(await configManagerImportSaml()).toBe(false);
    expect(errors()).toMatch(/layout marker/);
    expect(importedEntityIds()).toEqual([]);
  });
});

// ---- connector definitions -------------------------------------------------------------

describe('push connector-definitions', () => {
  const tree = () => {
    applicationRecord('bravo', 'Zion_HR', zionHr);
    connectorFile('Entra');
    connectorFile('Workday');
  };

  test('a connector that an application folder of any realm owns is named with its realm and skipped; the other is pushed; no file changes', async () => {
    mark();
    tree();
    const before = treeFiles();

    const outcome = await configManagerImportConnectors();

    expect(outcome).toBe(true);
    expect(importedConnectorIds()).toEqual(['Workday']);
    expect(messages()).toContain(
      'connector Entra is owned by application "Zion HR" (realm bravo) and is pushed by "push applications".'
    );
    expect(treeFiles()).toEqual(before);
    expect(errors()).toBe('');
  });

  test('when an application owns every connector nothing is pushed and nothing fails', async () => {
    mark();
    applicationRecord('bravo', 'Zion_HR', zionHr);
    connectorFile('Entra');

    expect(await configManagerImportConnectors()).toBe(true);

    expect(frodo.idm.connector.importConnectors).not.toHaveBeenCalled();
    expect(errors()).toBe('');
  });

  test('a named connector that an application owns is skipped, which is not a failure', async () => {
    mark();
    tree();

    expect(await configManagerImportConnectors('Entra')).toBe(true);

    expect(frodo.idm.connector.importConnectors).not.toHaveBeenCalled();
    expect(messages()).toContain('connector Entra is owned by');
  });

  test('the name is the one inside the file, not the name it is kept under', async () => {
    mark();
    applicationRecord('bravo', 'Zion_HR', zionHr);
    write('sync/connectors/renamed.json', {
      _id: 'provisioner.openicf/Entra',
    });

    await configManagerImportConnectors();

    expect(frodo.idm.connector.importConnectors).not.toHaveBeenCalled();
    expect(messages()).toContain('connector Entra is owned by');
  });

  test('a tree without the marker, and one with the kind-paths layout, push every connector and do not look at the application folders', async () => {
    tree();
    const reads = watchApplicationFolders();
    try {
      expect(await configManagerImportConnectors()).toBe(true);
      expect(importedConnectorIds()).toEqual(['Entra', 'Workday']);
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);

      jest.clearAllMocks();
      mark('kind-paths');
      expect(await configManagerImportConnectors()).toBe(true);
      expect(importedConnectorIds()).toEqual(['Entra', 'Workday']);
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);
    } finally {
      reads.stop();
    }
    expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();
  });

  test('the application folders of every realm are read once, and the root realm of a Cloud tenant is not', async () => {
    mark();
    tree();
    applicationRecord('alpha', 'Zion_Portal', zionPortal);
    applicationRecord('root', 'Not_Possible', {
      name: 'Not Possible',
      connectorId: 'Workday',
    });
    const reads = watchApplicationFolders();
    try {
      await configManagerImportConnectors();
    } finally {
      reads.stop();
    }

    expect(frodo.app.getApplicationOwnership).toHaveBeenCalledTimes(2);
    expect(reads.directories).toHaveLength(2);
    expect(reads.records).toHaveLength(2);
    // the record under root is not read, so Workday is not owned
    expect(importedConnectorIds()).toEqual(['Workday']);
  });

  test('an application folder of any realm that cannot be read fails the command naming the folder, whatever --allow-failures says, and nothing is pushed', async () => {
    mark();
    tree();
    write('realms/alpha/applications/Broken/application.json', '{ not json');

    expect(await configManagerImportConnectors()).toBe(false);
    expect(await configManagerImportConnectors(undefined, true)).toBe(false);

    expect(errors()).toContain('realms/alpha/applications/Broken');
    expect(frodo.idm.connector.importConnectors).not.toHaveBeenCalled();
  });

  test('a marker that cannot be read fails the command', async () => {
    fs.writeFileSync(path.join(tmp, MARKER), '{ not json');
    tree();

    expect(await configManagerImportConnectors()).toBe(false);
    expect(errors()).toMatch(/layout marker/);
    expect(frodo.idm.connector.importConnectors).not.toHaveBeenCalled();
  });
});

// ---- connector mappings ----------------------------------------------------------------

describe('push connector-mappings', () => {
  const tree = () => {
    applicationRecord('bravo', 'Zion_HR', zionHr);
    mappingFile('systemEntraUser_managedBravo_user');
    mappingFile('managedBravo_user_systemWorkdayUser', {
      onCreate: { type: 'text/javascript', file: 'create.js' },
    });
    write(
      'sync/mappings/managedBravo_user_systemWorkdayUser/create.js',
      'source();'
    );
  };

  test('a mapping that an application folder of any realm owns is named with its realm and skipped; the other is added to the sync configuration with its script; no file changes', async () => {
    mark();
    tree();
    const before = treeFiles();

    const outcome = await configManagerImportMappings();

    expect(outcome).toBe(true);
    expect(messages()).toContain(
      'mapping systemEntraUser_managedBravo_user is owned by application "Zion HR" (realm bravo) and is pushed by "push applications".'
    );
    expect(subImportedMappingNames()).toEqual([
      'managedBravo_user_systemWorkdayUser',
    ]);
    expect(frodo.idm.config.importSubConfigEntity.mock.calls[0][0]).toBe(
      'sync'
    );
    expect(
      frodo.idm.config.importSubConfigEntity.mock.calls[0][1].onCreate
    ).toEqual({
      type: 'text/javascript',
      source: 'source();',
    });
    expect(treeFiles()).toEqual(before);
    expect(errors()).toBe('');
  });

  test('in such a tree the mappings are added one by one: the sync configuration is not replaced, which would delete the mappings of the applications', async () => {
    mark();
    tree();

    await configManagerImportMappings();

    expect(frodo.idm.config.importConfigEntities).not.toHaveBeenCalled();
  });

  test('when an application owns every mapping the sync configuration is not written at all', async () => {
    mark();
    applicationRecord('bravo', 'Zion_HR', zionHr);
    mappingFile('systemEntraUser_managedBravo_user');

    expect(await configManagerImportMappings()).toBe(true);

    expect(frodo.idm.config.importConfigEntities).not.toHaveBeenCalled();
    expect(frodo.idm.config.importSubConfigEntity).not.toHaveBeenCalled();
    expect(errors()).toBe('');
  });

  test('a named mapping that an application owns is skipped, which is not a failure', async () => {
    mark();
    tree();

    expect(
      await configManagerImportMappings('systemEntraUser_managedBravo_user')
    ).toBe(true);

    expect(frodo.idm.config.importSubConfigEntity).not.toHaveBeenCalled();
    expect(messages()).toContain(
      'mapping systemEntraUser_managedBravo_user is owned by'
    );
  });

  test('the name is the one inside the file, not the name of its folder', async () => {
    mark();
    applicationRecord('bravo', 'Zion_HR', zionHr);
    mappingFile('renamed', { name: 'systemEntraUser_managedBravo_user' });
    mappingFile('kept');

    await configManagerImportMappings();

    expect(subImportedMappingNames()).toEqual(['kept']);
    expect(messages()).toContain(
      'mapping systemEntraUser_managedBravo_user is owned by'
    );
  });

  test('a named mapping that no application owns is pushed as before', async () => {
    mark();
    tree();

    expect(
      await configManagerImportMappings('managedBravo_user_systemWorkdayUser')
    ).toBe(true);

    expect(subImportedMappingNames()).toEqual([
      'managedBravo_user_systemWorkdayUser',
    ]);
  });

  test('a tree without the marker, and one with the kind-paths layout, replace the sync configuration with every mapping as before and do not look at the application folders', async () => {
    tree();
    const reads = watchApplicationFolders();
    try {
      expect(await configManagerImportMappings()).toBe(true);
      expect(frodo.idm.config.importConfigEntities).toHaveBeenCalledTimes(1);
      expect(
        frodo.idm.config.importConfigEntities.mock.calls[0][0].idm.sync.mappings
          .map((m) => m.name)
          .sort()
      ).toEqual([
        'managedBravo_user_systemWorkdayUser',
        'systemEntraUser_managedBravo_user',
      ]);
      expect(frodo.idm.config.importSubConfigEntity).not.toHaveBeenCalled();
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);

      jest.clearAllMocks();
      mark('kind-paths');
      expect(await configManagerImportMappings()).toBe(true);
      expect(frodo.idm.config.importConfigEntities).toHaveBeenCalledTimes(1);
      expect(frodo.idm.config.importSubConfigEntity).not.toHaveBeenCalled();
      expect(reads.directories).toEqual([]);
      expect(reads.records).toEqual([]);
    } finally {
      reads.stop();
    }
    expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();
    expect(messages()).not.toContain('is owned by');
  });

  test('the application folders of every realm are read once, however many mappings ask', async () => {
    mark();
    tree();
    applicationRecord('alpha', 'Zion_Portal', zionPortal);
    const reads = watchApplicationFolders();
    try {
      await configManagerImportMappings();
    } finally {
      reads.stop();
    }

    expect(frodo.app.getApplicationOwnership).toHaveBeenCalledTimes(2);
    expect(reads.directories).toHaveLength(2);
    expect(reads.records).toHaveLength(2);
  });

  test('an application folder of any realm that cannot be read fails the command naming the folder, and nothing is pushed', async () => {
    mark();
    tree();
    write('realms/alpha/applications/Broken/application.json', '{ not json');

    expect(await configManagerImportMappings()).toBe(false);

    expect(errors()).toContain('realms/alpha/applications/Broken');
    expect(frodo.idm.config.importSubConfigEntity).not.toHaveBeenCalled();
    expect(frodo.idm.config.importConfigEntities).not.toHaveBeenCalled();
  });

  test('a marker that cannot be read fails the command', async () => {
    fs.writeFileSync(path.join(tmp, MARKER), '{ not json');
    tree();

    expect(await configManagerImportMappings()).toBe(false);
    expect(errors()).toMatch(/layout marker/);
    expect(frodo.idm.config.importConfigEntities).not.toHaveBeenCalled();
  });
});

// ---- the ownership read from a tree -----------------------------------------------------------

describe('the ownership read from the application folders of a tree', () => {
  test('a realm is read once, however often it is asked for; a realm of the tree is not the realm of the state', () => {
    applicationRecord('alpha', 'Zion_Portal', zionPortal);
    const owned = new OwnedObjects();

    owned.loadRealmOfTree(tmp, 'alpha');
    owned.loadRealmOfTree(tmp, 'alpha');

    expect(frodo.app.getApplicationOwnership).toHaveBeenCalledTimes(1);
    currentRealm = 'alpha';
    expect(owned.ownersInCurrentRealm('oauth2Client', 'portal-client')).toEqual(
      [{ realm: 'alpha', applicationName: 'Zion Portal' }]
    );
    currentRealm = 'bravo';
    expect(owned.ownersInCurrentRealm('oauth2Client', 'portal-client')).toEqual(
      []
    );
  });

  test('the root realm is read from the folder root', () => {
    applicationRecord('root', 'Zion_Portal', zionPortal);
    const owned = new OwnedObjects();

    owned.loadRealmOfTree(tmp, '/');

    currentRealm = '/';
    expect(owned.ownersInCurrentRealm('oauth2Client', 'portal-client')).toEqual(
      [{ realm: '/', applicationName: 'Zion Portal' }]
    );
  });

  test('every problem of the realm is named in one error, folders in order', () => {
    write('realms/alpha/applications/B_bad/application.json', '{');
    write('realms/alpha/applications/A_empty/other.json', '{}');
    applicationRecord('alpha', 'C_good', zionPortal);

    expect(() => new OwnedObjects().loadRealmOfTree(tmp, 'alpha')).toThrow(
      "Cannot read the application folders of realm 'alpha': realms/alpha/applications/A_empty (the folder has no application.json); realms/alpha/applications/B_bad ("
    );
  });

  test('the folders are read in name order whatever order the file system lists them in', () => {
    write('realms/alpha/applications/B_bad/application.json', '{');
    write('realms/alpha/applications/A_empty/other.json', '{}');
    const readdir = fs.readdirSync;
    const spy = jest.spyOn(fs, 'readdirSync').mockImplementation((...args) => {
      const names = readdir(...args);
      return String(args[0]).endsWith(`${path.sep}applications`)
        ? [...names].reverse()
        : names;
    });
    try {
      expect(() => new OwnedObjects().loadRealmOfTree(tmp, 'alpha')).toThrow(
        /A_empty \(.*B_bad/
      );
    } finally {
      spy.mockRestore();
    }
  });

  test('a file in the applications folder is not an application', () => {
    write('realms/alpha/applications/notes.txt', 'hello');
    applicationRecord('alpha', 'Zion_Portal', zionPortal);

    expect(() =>
      new OwnedObjects().loadRealmOfTree(tmp, 'alpha')
    ).not.toThrow();
  });

  test('a tree without a realms folder owns nothing', () => {
    const owned = new OwnedObjects();

    owned.loadAllRealmsOfTree(tmp);

    expect(owned.ownersInAnyRealm('connector', 'Entra')).toEqual([]);
    expect(frodo.app.getApplicationOwnership).not.toHaveBeenCalled();
  });

  test('the words of the message follow the direction', () => {
    const owners = [{ realm: 'alpha', applicationName: 'Zion Portal' }];

    expect(ownedObjectMessage('mapping', 'm', owners)).toBe(
      'mapping m is owned by application "Zion Portal" and is pulled by "pull applications".'
    );
    expect(ownedObjectMessage('mapping', 'm', owners, true, 'pushed')).toBe(
      'mapping m is owned by application "Zion Portal" (realm alpha) and is pushed by "push applications".'
    );
  });
});
