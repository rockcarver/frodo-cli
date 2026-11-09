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
 * The standalone pull kinds (`oauth2-agents`, `saml`, `connector-definitions`,
 * `connector-mappings`) in a tree that uses the application layout (decision
 * record 0042, slice S3 of frodo-cli#1101): an object that an application owns
 * is named and skipped, because `pull applications` writes it into the folder of
 * the application. A tree without the layout marker is left exactly as it was,
 * and asks nothing about applications.
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
let world;

const dir = (rel) => {
  const target = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
};

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
        getFilePath: (rel) => dir(rel),
        saveJsonToFile: (data, file) =>
          fs.writeFileSync(file, JSON.stringify(data, null, 2)),
        readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
        escapePlaceholders: (content) => content,
        findFilesByName: () => [],
        isBase64Encoded: () => false,
        json: { mergeDeep: (a, b) => ({ ...a, ...b }) },
      },
      realm: { readRealms: async () => world.realms.map((name) => ({ name })) },
      app: {
        readApplicationOwnership: jest.fn(async () => {
          if (world.ownershipFails.has(currentRealm)) {
            throw new Error(`cannot read the applications of ${currentRealm}`);
          }
          return { entries: world.ownership[currentRealm] ?? [] };
        }),
        getApplicationOwners: (index, kind, id) =>
          (
            index.entries.find((e) => e.kind === kind && e.id === id)?.owners ??
            []
          ).map((owner) => ({ ...owner })),
      },
      agent: {
        readAgentByTypeAndId: jest.fn(async (type, id) => ({
          _id: id,
          type,
        })),
        importAgent: jest.fn(),
      },
      saml2: {
        entityProvider: {
          exportSaml2Provider: jest.fn(async (entityId) => ({
            saml: {
              hosted: {},
              remote: { [entityId]: { entityId } },
              metadata: { [entityId]: `<md ${entityId}/>` },
            },
          })),
          importSaml2Providers: jest.fn(),
        },
        circlesOfTrust: {
          exportCircleOfTrust: jest.fn(async (cotId) => ({
            saml: { cot: { [cotId]: { _id: cotId } } },
          })),
          importCirclesOfTrust: jest.fn(),
        },
      },
      idm: {
        connector: {
          readConnector: jest.fn(async (id) =>
            structuredClone(
              world.connectors.find(
                (c) => c._id === `provisioner.openicf/${id}`
              )
            )
          ),
          readConnectors: jest.fn(async () =>
            structuredClone(world.connectors)
          ),
          importConnectors: jest.fn(),
        },
        config: {
          readConfigEntity: jest.fn(async () => ({
            mappings: structuredClone(world.mappings),
          })),
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
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'folders',
}));
jest.unstable_mockModule(src('utils/Config'), () => ({
  extractFrConfigDataToFile: (text, fileName, dirName) =>
    fs.writeFileSync(dir(`${dirName}/${fileName}`), text),
}));

const { configManagerExportOAuth2Agents } = await import(
  src('configManagerOps/FrConfigOauth2AgentOps.ts')
);
const { configManagerExportSaml } = await import(
  src('configManagerOps/FrConfigSamlOps.ts')
);
const { configManagerExportConnectorDefinitions } = await import(
  src('configManagerOps/FrConfigConnectorDefinitionsOps.ts')
);
const { configManagerExportMappings } = await import(
  src('configManagerOps/FrConfigConnectorMappingOps.ts')
);
const { OwnedObjects } = await import(src('ops/ApplicationOwnedObjects.ts'));
const { frodo } = await import('@rockcarver/frodo-lib');

// ---- helpers --------------------------------------------------------------

const MARKER = 'frodo-config-manager.json';
const mark = (layout = 'folders') =>
  fs.writeFileSync(
    path.join(tmp, MARKER),
    JSON.stringify({ applications: layout, formatVersion: 1 })
  );
const exists = (rel) => fs.existsSync(path.join(tmp, rel));
const messages = () =>
  console_.printMessage.mock.calls.map(([text]) => String(text)).join('\n');
const errors = () =>
  console_.printError.mock.calls
    .map(([error, text]) => `${text ?? ''} ${error?.message ?? error}`)
    .join('\n');
const owner = (applicationName) => ({ applicationName });
const owns = (realm, kind, id, ...names) => {
  world.ownership[realm] = [
    ...(world.ownership[realm] ?? []),
    { kind, id, owners: names.map(owner) },
  ];
};
const writeConfig = (name, content) => {
  const file = dir(`input/${name}`);
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
};
const ownershipCalls = () =>
  frodo.app.readApplicationOwnership.mock.calls.length;

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-standalone-skip-'));
  deployment = 'cloud';
  currentRealm = '/';
  world = {
    realms: ['/', 'alpha', 'bravo'],
    ownership: {},
    ownershipFails: new Set(),
    connectors: [
      { _id: 'provisioner.openicf/Entra', name: 'Entra' },
      { _id: 'provisioner.openicf/Workday', name: 'Workday' },
      { _id: 'provisioner.openicf.connectorinfoprovider' },
    ],
    mappings: {
      a: { name: 'systemEntraUser_managedAlpha_user', source: 'x' },
      b: { name: 'managedAlpha_user_systemWorkdayUser', source: 'y' },
    },
  };
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- oauth2-agents -----------------------------------------------------------

describe('pull oauth2-agents', () => {
  const config = () =>
    writeConfig('oauth2-agents.json', {
      alpha: {
        OAuth2Client: [
          { id: 'portal-client' },
          { id: 'other-client' },
          { id: 'shared-client' },
        ],
        IdentityGatewayAgent: [{ id: 'portal-client' }],
      },
    });

  test('a client that an application owns is named and skipped, the others are written, the config file stays as it was', async () => {
    mark();
    owns('alpha', 'oauth2Client', 'portal-client', 'Zion Portal');
    const file = config();
    const before = fs.readFileSync(file, 'utf8');

    const outcome = await configManagerExportOAuth2Agents(file);

    expect(outcome).toBe(true);
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/portal-client.json')
    ).toBe(false);
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/other-client.json')
    ).toBe(true);
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/shared-client.json')
    ).toBe(true);
    expect(messages()).toContain(
      'OAuth2 client portal-client is owned by application "Zion Portal" and is pulled by "pull applications".'
    );
    expect(frodo.agent.readAgentByTypeAndId).not.toHaveBeenCalledWith(
      'OAuth2Client',
      'portal-client'
    );
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(errors()).toBe('');
  });

  test('a client with two owners is skipped and both are named', async () => {
    mark();
    owns(
      'alpha',
      'oauth2Client',
      'portal-client',
      'Zion Portal',
      'Zion Mobile'
    );

    await configManagerExportOAuth2Agents(config());

    expect(messages()).toContain(
      'is owned by applications "Zion Portal" and "Zion Mobile" and is pulled by "pull applications".'
    );
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/portal-client.json')
    ).toBe(false);
  });

  test('only OAuth2 clients can be owned: an agent of another type with the same id is still written', async () => {
    mark();
    owns('alpha', 'oauth2Client', 'portal-client', 'Zion Portal');

    await configManagerExportOAuth2Agents(config());

    expect(
      exists(
        'realms/alpha/realm-config/agents/IdentityGatewayAgent/portal-client.json'
      )
    ).toBe(true);
  });

  test('a tree without the marker, and one with the kind-paths layout, write everything and ask nothing about applications', async () => {
    owns('alpha', 'oauth2Client', 'portal-client', 'Zion Portal');
    await configManagerExportOAuth2Agents(config());
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/portal-client.json')
    ).toBe(true);
    expect(ownershipCalls()).toBe(0);

    fs.rmSync(path.join(tmp, 'realms'), { recursive: true });
    mark('kind-paths');
    await configManagerExportOAuth2Agents(config());
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/portal-client.json')
    ).toBe(true);
    expect(ownershipCalls()).toBe(0);
  });

  test('the layout that `pull all` decided before its first step counts, although the marker is not written yet', async () => {
    owns('alpha', 'oauth2Client', 'portal-client', 'Zion Portal');

    await configManagerExportOAuth2Agents(config(), false, {
      tree: 'new',
      layout: 'folders',
      createMarker: true,
    });
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/portal-client.json')
    ).toBe(false);

    await configManagerExportOAuth2Agents(config(), false, {
      tree: 'legacy',
      layout: 'kind-paths',
      createMarker: false,
    });
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/portal-client.json')
    ).toBe(true);
  });

  test('a deployment without applications is left alone even in a marked tree', async () => {
    mark();
    deployment = 'classic';
    owns('alpha', 'oauth2Client', 'portal-client', 'Zion Portal');

    await configManagerExportOAuth2Agents(config());

    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/portal-client.json')
    ).toBe(true);
    expect(ownershipCalls()).toBe(0);
  });

  test('the ownership of a realm is read once, however many clients ask', async () => {
    mark();
    const file = writeConfig('oauth2-agents.json', {
      alpha: { OAuth2Client: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      bravo: { OAuth2Client: [{ id: 'd' }] },
    });

    await configManagerExportOAuth2Agents(file);

    expect(ownershipCalls()).toBe(2);
  });

  test('a realm whose applications cannot be read is one failed operation naming the cause; its OAuth2 clients are not written, its other agents and the other realms are', async () => {
    mark();
    world.ownershipFails.add('alpha');
    const file = writeConfig('oauth2-agents.json', {
      alpha: {
        OAuth2Client: [{ id: 'a' }, { id: 'b' }],
        IdentityGatewayAgent: [{ id: 'gateway' }],
      },
      bravo: { OAuth2Client: [{ id: 'd' }] },
    });

    const outcome = await configManagerExportOAuth2Agents(file);

    expect(outcome).toBe(false);
    expect(
      exists(
        'realms/alpha/realm-config/agents/IdentityGatewayAgent/gateway.json'
      )
    ).toBe(true);
    expect(exists('realms/alpha/realm-config/agents/OAuth2Client/a.json')).toBe(
      false
    );
    expect(exists('realms/alpha/realm-config/agents/OAuth2Client/b.json')).toBe(
      false
    );
    expect(exists('realms/bravo/realm-config/agents/OAuth2Client/d.json')).toBe(
      true
    );
    expect(errors()).toContain('cannot read the applications of alpha');
    expect(messages()).toMatch(/1 of 3 agents failed/);
    expect(messages()).toContain('ownership of realm alpha');

    expect(await configManagerExportOAuth2Agents(file, true)).toBe(true);
  });

  test('a marker that cannot be read fails the command', async () => {
    fs.writeFileSync(path.join(tmp, MARKER), '{ not json');

    expect(await configManagerExportOAuth2Agents(config())).toBe(false);
    expect(errors()).toMatch(/layout marker/);
  });
});

// ---- saml ------------------------------------------------------------------------

describe('pull saml', () => {
  const config = () =>
    writeConfig('saml.json', {
      alpha: {
        samlProviders: [
          { entityId: 'urn:zion:portal', fileName: 'portal' },
          { entityId: 'urn:zion:other', fileName: 'other' },
        ],
        circlesOfTrust: ['ZionCot'],
      },
    });

  test('a provider that an application owns is named and skipped; the other provider and the circle of trust are written', async () => {
    mark();
    owns('alpha', 'saml2Provider', 'urn:zion:portal', 'Zion Portal');
    const file = config();
    const before = fs.readFileSync(file, 'utf8');

    const outcome = await configManagerExportSaml(file);

    expect(outcome).toBe(true);
    expect(exists('realms/alpha/realm-config/saml/remote/portal.json')).toBe(
      false
    );
    expect(exists('realms/alpha/realm-config/saml/remote/other.json')).toBe(
      true
    );
    expect(exists('realms/alpha/realm-config/saml/COT/ZionCot.json')).toBe(
      true
    );
    expect(messages()).toContain(
      'SAML provider urn:zion:portal is owned by application "Zion Portal" and is pulled by "pull applications".'
    );
    expect(
      frodo.saml2.entityProvider.exportSaml2Provider
    ).not.toHaveBeenCalledWith('urn:zion:portal', expect.anything());
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  test('an unmarked tree writes every provider and asks nothing about applications', async () => {
    owns('alpha', 'saml2Provider', 'urn:zion:portal', 'Zion Portal');

    await configManagerExportSaml(config());

    expect(exists('realms/alpha/realm-config/saml/remote/portal.json')).toBe(
      true
    );
    expect(ownershipCalls()).toBe(0);
  });

  test('the decision of `pull all` counts before the marker exists', async () => {
    owns('alpha', 'saml2Provider', 'urn:zion:portal', 'Zion Portal');

    await configManagerExportSaml(config(), false, {
      tree: 'new',
      layout: 'folders',
      createMarker: true,
    });

    expect(exists('realms/alpha/realm-config/saml/remote/portal.json')).toBe(
      false
    );
  });

  test('a realm whose applications cannot be read fails its providers as one operation, and its circles of trust are still written', async () => {
    mark();
    world.ownershipFails.add('alpha');

    const outcome = await configManagerExportSaml(config());

    expect(outcome).toBe(false);
    expect(exists('realms/alpha/realm-config/saml/remote/other.json')).toBe(
      false
    );
    expect(exists('realms/alpha/realm-config/saml/COT/ZionCot.json')).toBe(
      true
    );
    expect(errors()).toContain('cannot read the applications of alpha');
    expect(messages()).toContain('ownership of realm alpha');
  });
});

// ---- connector definitions ---------------------------------------------------------

describe('pull connector-definitions', () => {
  test('a connector that an application of any realm owns is named with its realm and skipped; the other is written; the provider entry is not a connector', async () => {
    mark();
    owns('bravo', 'connector', 'Entra', 'Zion Directory');

    const outcome = await configManagerExportConnectorDefinitions();

    expect(outcome).toBe(true);
    expect(exists('sync/connectors/Entra.json')).toBe(false);
    expect(exists('sync/connectors/Workday.json')).toBe(true);
    expect(messages()).toContain(
      'connector Entra is owned by application "Zion Directory" (realm bravo) and is pulled by "pull applications".'
    );
    expect(messages()).not.toContain('No connector definitions found');
  });

  test('the applications of every realm are asked once, and the root realm of a Cloud tenant is not', async () => {
    mark();

    await configManagerExportConnectorDefinitions();

    expect(ownershipCalls()).toBe(2);
  });

  test('when an application owns every connector, nothing is reported as missing', async () => {
    mark();
    owns('alpha', 'connector', 'Entra', 'Zion Directory');
    owns('alpha', 'connector', 'Workday', 'Zion Directory');

    const outcome = await configManagerExportConnectorDefinitions();

    expect(outcome).toBe(true);
    expect(exists('sync/connectors/Entra.json')).toBe(false);
    expect(exists('sync/connectors/Workday.json')).toBe(false);
    expect(messages()).not.toContain('No connector definitions found');
  });

  test('a named connector that an application owns is skipped, which is not a failure', async () => {
    mark();
    owns('alpha', 'connector', 'Entra', 'Zion Directory');

    const outcome = await configManagerExportConnectorDefinitions('Entra');

    expect(outcome).toBe(true);
    expect(exists('sync/connectors/Entra.json')).toBe(false);
    expect(messages()).toContain('connector Entra is owned by application');
  });

  test('an unmarked tree writes every connector and asks nothing about applications', async () => {
    owns('alpha', 'connector', 'Entra', 'Zion Directory');

    await configManagerExportConnectorDefinitions();

    expect(exists('sync/connectors/Entra.json')).toBe(true);
    expect(ownershipCalls()).toBe(0);
  });

  test('the decision of `pull all` counts before the marker exists', async () => {
    owns('alpha', 'connector', 'Entra', 'Zion Directory');

    await configManagerExportConnectorDefinitions(undefined, false, {
      tree: 'new',
      layout: 'folders',
      createMarker: true,
    });

    expect(exists('sync/connectors/Entra.json')).toBe(false);
    expect(exists('sync/connectors/Workday.json')).toBe(true);
  });

  test('applications that cannot be read fail the command naming the cause, and nothing is written', async () => {
    mark();
    world.ownershipFails.add('bravo');

    const outcome = await configManagerExportConnectorDefinitions();

    expect(outcome).toBe(false);
    expect(errors()).toContain('cannot read the applications of bravo');
    expect(exists('sync/connectors/Workday.json')).toBe(false);
  });
});

// ---- connector mappings --------------------------------------------------------------

describe('pull connector-mappings', () => {
  test('a mapping that an application owns is named with its realm and skipped; the other is written', async () => {
    mark();
    owns(
      'alpha',
      'mapping',
      'systemEntraUser_managedAlpha_user',
      'Zion Directory'
    );

    const outcome = await configManagerExportMappings();

    expect(outcome).toBe(true);
    expect(
      exists(
        'sync/mappings/systemEntraUser_managedAlpha_user/systemEntraUser_managedAlpha_user.json'
      )
    ).toBe(false);
    expect(
      exists(
        'sync/mappings/managedAlpha_user_systemWorkdayUser/managedAlpha_user_systemWorkdayUser.json'
      )
    ).toBe(true);
    expect(messages()).toContain(
      'mapping systemEntraUser_managedAlpha_user is owned by application "Zion Directory" (realm alpha) and is pulled by "pull applications".'
    );
  });

  test('a named mapping that an application owns is skipped, which is not a failure; all mappings owned says nothing is missing', async () => {
    mark();
    owns(
      'alpha',
      'mapping',
      'systemEntraUser_managedAlpha_user',
      'Zion Directory'
    );

    const outcome = await configManagerExportMappings(
      'systemEntraUser_managedAlpha_user'
    );

    expect(outcome).toBe(true);
    expect(messages()).not.toContain('not found');
    expect(messages()).not.toContain('No connector mappings found');
  });

  test('two owners in two realms are both named', async () => {
    mark();
    owns(
      'alpha',
      'mapping',
      'systemEntraUser_managedAlpha_user',
      'Zion Directory'
    );
    owns(
      'bravo',
      'mapping',
      'systemEntraUser_managedAlpha_user',
      'Zion Archive'
    );

    await configManagerExportMappings();

    expect(messages()).toContain(
      'applications "Zion Directory" (realm alpha) and "Zion Archive" (realm bravo)'
    );
  });

  test('an unmarked tree writes every mapping and asks nothing about applications', async () => {
    owns(
      'alpha',
      'mapping',
      'systemEntraUser_managedAlpha_user',
      'Zion Directory'
    );

    await configManagerExportMappings();

    expect(
      exists(
        'sync/mappings/systemEntraUser_managedAlpha_user/systemEntraUser_managedAlpha_user.json'
      )
    ).toBe(true);
    expect(ownershipCalls()).toBe(0);
  });

  test('the decision of `pull all` counts before the marker exists', async () => {
    owns(
      'alpha',
      'mapping',
      'systemEntraUser_managedAlpha_user',
      'Zion Directory'
    );

    await configManagerExportMappings(undefined, false, {
      tree: 'new',
      layout: 'folders',
      createMarker: true,
    });

    expect(
      exists(
        'sync/mappings/systemEntraUser_managedAlpha_user/systemEntraUser_managedAlpha_user.json'
      )
    ).toBe(false);
  });

  test('applications that cannot be read fail the command naming the cause, and nothing is written', async () => {
    mark();
    world.ownershipFails.add('alpha');

    const outcome = await configManagerExportMappings();

    expect(outcome).toBe(false);
    expect(errors()).toContain('cannot read the applications of alpha');
    expect(exists('sync/mappings')).toBe(false);
  });
});

// ---- the ownership of the realms ---------------------------------------------------------

describe('the ownership of the realms', () => {
  test('the ownership of a realm is read once, however often it is asked for', async () => {
    currentRealm = 'alpha';
    owns('alpha', 'oauth2Client', 'portal-client', 'Zion Portal');
    const owned = new OwnedObjects();

    await owned.loadCurrentRealm();
    await owned.loadCurrentRealm();

    expect(ownershipCalls()).toBe(1);
    expect(owned.ownersInCurrentRealm('oauth2Client', 'portal-client')).toEqual(
      [{ realm: 'alpha', applicationName: 'Zion Portal' }]
    );
  });

  test('reading every realm leaves the realm of the state as it was', async () => {
    currentRealm = 'alpha';

    await new OwnedObjects().loadAllRealms();

    expect(ownershipCalls()).toBe(2);
    expect(currentRealm).toBe('alpha');
  });

  test('the realm of the state is restored when a realm cannot be read, too', async () => {
    currentRealm = 'alpha';
    world.ownershipFails.add('bravo');

    await expect(new OwnedObjects().loadAllRealms()).rejects.toThrow(
      'cannot read the applications of bravo'
    );

    expect(currentRealm).toBe('alpha');
  });
});
