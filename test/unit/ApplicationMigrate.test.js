import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
 * `frodo config-manager migrate applications` (decision record 0042, slice S6 of
 * frodo-cli#1101): the deliberate step that moves a tree that keeps the objects
 * of an application at the paths of their own kinds to one folder per
 * application. It reads the tenant for the ownership, writes the folders as
 * `pull applications` does, removes the kind-path files of what the moved
 * applications own (never a shared piece), and writes the layout marker last,
 * only if everything went well. `--dry-run` shows all of that and changes
 * nothing. The config files of the standalone kinds are never edited.
 *
 * The library is a set of fakes, the files are real, in a temporary folder. The
 * per-user settings are a fake too, and the home directory is replaced: nothing
 * here may touch the real home.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);
const MARKER = 'frodo-config-manager.json';

let tmp;
let cfg;
let fakeHome;
let deployment;
let currentRealm;
let world;
let events;

function dir(rel) {
  const target = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

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
        saveJsonToFile: (data, file) => {
          events.push(['write', fs.existsSync(path.join(tmp, MARKER))]);
          fs.writeFileSync(file, JSON.stringify(data, null, 2));
        },
        // as the library does: a literal ${ stays literal when the file is read
        escapePlaceholders: (content) =>
          JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${')),
      },
      realm: {
        readRealms: async () => world.realms.map((name) => ({ name })),
      },
      app: {
        readApplications: jest.fn(async () => {
          world.readIn.push(currentRealm);
          if (world.listFails.has(currentRealm)) {
            throw new Error(`cannot list ${currentRealm}`);
          }
          return structuredClone(world.apps[currentRealm] ?? []);
        }),
        // the ownership the library builds from the records of the realm
        readApplicationOwnership: jest.fn(async () => {
          if (world.listFails.has(currentRealm)) {
            throw new Error(`cannot list ${currentRealm}`);
          }
          const entries = new Map();
          for (const application of world.apps[currentRealm] ?? []) {
            const known = world.references[application._id];
            for (const reference of known?.references ?? []) {
              if (reference.ownership !== 'owned') continue;
              const key = `${reference.kind}\0${reference.id}`;
              if (!entries.has(key)) {
                entries.set(key, {
                  kind: reference.kind,
                  id: reference.id,
                  owners: [],
                });
              }
              entries.get(key).owners.push({
                applicationId: application._id,
                applicationName: application.name,
              });
            }
          }
          return { entries: [...entries.values()] };
        }),
        readApplicationReferences: jest.fn(async (id) => {
          const known = world.references[id];
          return (
            known ?? {
              applicationId: id,
              applicationName: '',
              references: [],
              problems: [],
            }
          );
        }),
      },
      agent: {
        readAgentByTypeAndId: jest.fn(async (type, id) => {
          world.readAt.push([id, currentRealm]);
          if (world.failing.has(`agent:${id}`)) {
            throw new Error(`cannot read client ${id}`);
          }
          return structuredClone(world.agents[id] ?? { _id: id });
        }),
      },
      idm: {
        connector: {
          readConnector: jest.fn(async (id) => {
            if (world.failing.has(`connector:${id}`)) {
              throw new Error(`cannot read connector ${id}`);
            }
            return structuredClone(world.connectors[id] ?? { _id: id });
          }),
        },
        mapping: {
          readMappings: jest.fn(async () => structuredClone(world.mappings)),
        },
      },
      script: {
        readScript: jest.fn(async (id) => structuredClone(world.scripts[id])),
      },
    },
  };
});

const console_ = {
  printError: jest.fn(),
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
};
jest.unstable_mockModule(src('utils/Console'), () => console_);

// the per-user settings are never read from the real home
jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'folders',
}));

const shared = {
  readSamlProviderForFile: jest.fn(async (entityId) => {
    if (world.failing.has(`saml:${entityId}`)) {
      throw new Error(`cannot export provider ${entityId}`);
    }
    return structuredClone(world.providers[entityId]);
  }),
  exportCircleOfTrustToFile: jest.fn(async (cotId, realm) => {
    const realmDir = realm === '/' ? 'root' : realm;
    fs.writeFileSync(
      dir(`realms/${realmDir}/realm-config/saml/COT/${cotId}.json`),
      JSON.stringify({ cot: cotId })
    );
  }),
  exportScriptToFiles: jest.fn((script, realm) => {
    const realmDir = realm === '/' ? 'root' : realm;
    fs.writeFileSync(
      dir(`realms/${realmDir}/scripts/scripts-config/${script._id}.json`),
      JSON.stringify({ name: script.name })
    );
  }),
  exportMappingToDirectory: jest.fn((mapping, mappingPath) => {
    fs.writeFileSync(
      dir(`${mappingPath}/${mapping.name}.json`),
      JSON.stringify(mapping)
    );
  }),
};
jest.unstable_mockModule(src('configManagerOps/FrConfigSamlOps'), () => ({
  readSamlProviderForFile: shared.readSamlProviderForFile,
  exportCircleOfTrustToFile: shared.exportCircleOfTrustToFile,
  findCirclesOfTrustOfProviders: jest.fn(),
  importCircleOfTrustFromFile: jest.fn(),
  importSamlProviderFromFile: jest.fn(),
}));
jest.unstable_mockModule(src('configManagerOps/FrConfigScriptOps'), () => ({
  exportScriptToFiles: shared.exportScriptToFiles,
  importScriptFromFiles: jest.fn(),
}));
jest.unstable_mockModule(
  src('configManagerOps/FrConfigConnectorMappingOps'),
  () => ({
    exportMappingToDirectory: shared.exportMappingToDirectory,
    readMappingFromDirectory: jest.fn(),
  })
);

const { configManagerMigrateApplications } = await import(
  src('ops/ApplicationMigrateOps.ts')
);
const { configManagerExportApplications } = await import(
  src('ops/ApplicationConfigOps.ts')
);
const { frodo } = await import('@rockcarver/frodo-lib');

// ---- builders -------------------------------------------------------------

const app = (name, extra = {}) => ({
  _id: `id-${name}`,
  _rev: '1',
  name,
  templateName: 'web',
  templateVersion: '1.0',
  ...extra,
});
const owned = (kind, id, from = 'x') => ({
  kind,
  id,
  ownership: 'owned',
  from,
});
const sharedRef = (kind, id, extra = {}) => ({
  kind,
  id,
  ownership: 'shared',
  from: 'x',
  ...extra,
});
const refs = (application, references) => {
  world.references[application._id] = {
    applicationId: application._id,
    applicationName: application.name,
    references,
    problems: [],
  };
};
const put = (rel, content) => {
  fs.writeFileSync(
    dir(rel),
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
};
const exists = (rel) => fs.existsSync(path.join(tmp, rel));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8'));
const messages = () =>
  console_.printMessage.mock.calls.map(([text]) => String(text)).join('\n');

/** Every file of a folder: path -> content, sorted. */
function snapshot(folder = tmp) {
  const files = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        files[`${path.relative(folder, full)}/`] = '';
        walk(full);
      } else {
        files[path.relative(folder, full)] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk(folder);
  return Object.fromEntries(Object.entries(files).sort());
}
const only = (files, pattern) =>
  Object.fromEntries(Object.entries(files).filter(([f]) => pattern.test(f)));

const ZION = app('Zion Portal');
const SSO = app('Sso', { templateName: 'saml' });
const ENTRA = app('Entra', {
  templateName: 'azure.ad',
  connectorId: 'Entra',
  mappingNames: ['legacy'],
});
const IDP = 'https://idp.zion.example';
const SP = 'https://sp.zion.example';

/** Three applications in realm alpha: a web client, a SAML pair and a provisioning application. */
function tenant() {
  world.apps.alpha = [ZION, SSO, ENTRA];
  refs(ZION, [owned('oauth2Client', 'zion-portal', 'ssoEntities.oidcId')]);
  refs(SSO, [
    owned('saml2Provider', IDP, 'ssoEntities.idpPrivateId'),
    owned('saml2Provider', SP, 'ssoEntities.spPrivateId'),
    sharedRef('circleOfTrust', 'cot1'),
  ]);
  refs(ENTRA, [
    owned('connector', 'Entra', 'connectorId'),
    owned('mapping', 'legacy', 'mappingNames'),
    sharedRef('script', 's-1', { name: 'Transform' }),
  ]);
  world.agents['zion-portal'] = {
    _id: 'zion-portal',
    coreOAuth2ClientConfig: { clientType: 'Confidential' },
  };
  world.providers[IDP] = {
    location: 'hosted',
    config: { entityId: IDP },
    metadata: '<idp/>',
  };
  world.providers[SP] = {
    location: 'remote',
    config: { entityId: SP },
    metadata: '<sp/>',
  };
  world.connectors.Entra = { _id: 'provisioner.openicf/Entra', enabled: true };
  world.mappings = [{ _id: 'sync/legacy', name: 'legacy' }];
  world.scripts['s-1'] = {
    _id: 's-1',
    name: 'Transform',
    language: 'JAVASCRIPT',
  };
}

/** The files `pull oauth2-agents`, `pull saml`, `pull connector-definitions` and `pull connector-mappings` wrote for the tenant, and others they wrote that no application owns. */
function legacyTree() {
  const agents = 'realms/alpha/realm-config/agents';
  put(`${agents}/OAuth2Client/zion-portal.json`, { _id: 'zion-portal' });
  put(`${agents}/OAuth2Client/standalone-client.json`, { _id: 'standalone' });
  put(`${agents}/IdentityGatewayAgent/ig-1.json`, { _id: 'ig-1' });
  const saml = 'realms/alpha/realm-config/saml';
  put(`${saml}/hosted/https___idp.zion.example.json`, {
    config: { entityId: IDP },
    metadata: '<idp/>',
  });
  // a file name chosen in saml.json: only the entity id inside says what it holds
  put(`${saml}/remote/renamed-sp.json`, {
    config: { entityId: SP },
    metadata: '<sp/>',
  });
  put(`${saml}/remote/other_sp.json`, {
    config: { entityId: 'https://other.example' },
    metadata: '<o/>',
  });
  put(`${saml}/COT/cot1.json`, { _id: 'cot1', old: true });
  put('realms/alpha/scripts/scripts-config/s-1.json', { name: 'old' });
  put('sync/connectors/Entra.json', { _id: 'provisioner.openicf/Entra' });
  put('sync/connectors/Other.json', { _id: 'provisioner.openicf/Other' });
  put('sync/mappings/legacy/legacy.json', { name: 'legacy' });
  put('sync/mappings/legacy/legacy.source.js', 'return source;');
  put('sync/mappings/free/free.json', { name: 'free' });
}

const OWNED_FILES = [
  'realms/alpha/realm-config/agents/OAuth2Client/zion-portal.json',
  'realms/alpha/realm-config/saml/hosted/https___idp.zion.example.json',
  'realms/alpha/realm-config/saml/remote/renamed-sp.json',
  'sync/connectors/Entra.json',
  'sync/mappings/legacy/legacy.json',
  'sync/mappings/legacy/legacy.source.js',
];
const KEPT_FILES = [
  'realms/alpha/realm-config/agents/OAuth2Client/standalone-client.json',
  'realms/alpha/realm-config/agents/IdentityGatewayAgent/ig-1.json',
  'realms/alpha/realm-config/saml/remote/other_sp.json',
  'sync/connectors/Other.json',
  'sync/mappings/free/free.json',
];

beforeAll(() => {
  // The settings live under os.homedir(). Assigning process.env.HOME does not change
  // it under jest, so it is replaced here, and the tests stop before they can write
  // anywhere if that did not work.
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-migrate-home-'));
  jest.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  if (os.homedir() !== fakeHome) {
    throw new Error(
      'The home directory could not be replaced; refusing to run.'
    );
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-apps-migrate-'));
  cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-apps-migrate-cfg-'));
  deployment = 'cloud';
  currentRealm = undefined;
  events = [];
  world = {
    realms: ['/', 'alpha'],
    apps: {},
    references: {},
    agents: {},
    providers: {},
    connectors: {},
    mappings: [],
    scripts: {},
    failing: new Set(),
    listFails: new Set(),
    readIn: [],
    readAt: [],
  };
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(cfg, { recursive: true, force: true });
});

// ---- the move ---------------------------------------------------------------

describe('moving a kind-path tree', () => {
  test('writes the application folders, removes exactly the owned files, keeps the rest, and marks the tree', async () => {
    tenant();
    legacyTree();

    expect(await configManagerMigrateApplications()).toBe(true);

    for (const name of ['Zion Portal', 'Sso', 'Entra']) {
      expect(exists(`realms/alpha/applications/${name}/application.json`)).toBe(
        true
      );
    }
    expect(
      exists('realms/alpha/applications/Zion Portal/oauth2-client.json')
    ).toBe(true);
    expect(exists('realms/alpha/applications/Sso/saml/idp.json')).toBe(true);
    expect(exists('realms/alpha/applications/Sso/saml/sp.json')).toBe(true);
    expect(exists('realms/alpha/applications/Entra/connector.json')).toBe(true);
    expect(
      exists('realms/alpha/applications/Entra/mappings/legacy/legacy.json')
    ).toBe(true);

    for (const file of OWNED_FILES) expect(exists(file)).toBe(false);
    for (const file of KEPT_FILES) expect(exists(file)).toBe(true);
    // the shared pieces were written where `pull scripts` and `pull saml` write them, never removed
    expect(read('realms/alpha/realm-config/saml/COT/cot1.json')).toEqual({
      cot: 'cot1',
    });
    expect(read('realms/alpha/scripts/scripts-config/s-1.json')).toEqual({
      name: 'Transform',
    });

    expect(read(MARKER)).toEqual({ applications: 'folders', formatVersion: 1 });
    // a directory that held only moved files goes; one that holds anything else stays
    expect(exists('sync/mappings/legacy')).toBe(false);
    expect(exists('realms/alpha/realm-config/saml/hosted')).toBe(false);
    expect(
      exists('realms/alpha/realm-config/agents/IdentityGatewayAgent')
    ).toBe(true);
    expect(exists('realms/alpha/realm-config/saml/remote')).toBe(true);
    expect(messages()).not.toMatch(/Dry run/);
  });

  test('writes the application folders exactly as `pull applications` writes them', async () => {
    tenant();
    legacyTree();
    await configManagerMigrateApplications();
    const migrated = snapshot();

    // the same tenant, pulled into a new tree
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-apps-migrate-pull-'));
    expect(await configManagerExportApplications()).toBe(true);
    const pulled = snapshot();

    const folders =
      /^realms\/alpha\/(applications|scripts|realm-config\/saml\/COT)\//;
    expect(Object.keys(only(pulled, folders)).length).toBeGreaterThan(8);
    expect(only(migrated, folders)).toEqual(only(pulled, folders));
  });

  test('writes the marker last: nothing is written or removed after it exists', async () => {
    tenant();
    legacyTree();
    const rmSync = fs.rmSync.bind(fs);
    jest.spyOn(fs, 'rmSync').mockImplementation((file, ...rest) => {
      if (
        !String(file).endsWith(MARKER) &&
        !String(file).includes(`${MARKER}.`)
      ) {
        events.push(['remove', fs.existsSync(path.join(tmp, MARKER))]);
      }
      return rmSync(file, ...rest);
    });

    await configManagerMigrateApplications();

    expect(events.filter(([kind]) => kind === 'write').length).toBeGreaterThan(
      5
    );
    expect(events.filter(([kind]) => kind === 'remove').length).toBe(
      OWNED_FILES.length
    );
    expect(events.every(([, markerExisted]) => markerExisted === false)).toBe(
      true
    );
    expect(exists(MARKER)).toBe(true);
  });

  test('a second run is a no-op that asks nothing of the tenant', async () => {
    tenant();
    legacyTree();
    await configManagerMigrateApplications();
    const after = snapshot();
    jest.clearAllMocks();

    expect(await configManagerMigrateApplications()).toBe(true);

    expect(snapshot()).toEqual(after);
    expect(frodo.app.readApplications).not.toHaveBeenCalled();
    expect(frodo.app.readApplicationOwnership).not.toHaveBeenCalled();
    expect(messages()).toMatch(/already keeps one folder per application/);
  });

  test('says what it removes and where the marker is', async () => {
    tenant();
    legacyTree();

    await configManagerMigrateApplications();

    expect(messages()).toMatch(
      /Removed realms\/alpha\/realm-config\/agents\/OAuth2Client\/zion-portal\.json \(OAuth2 client zion-portal, owned by application "Zion Portal"\)/
    );
    expect(messages()).toMatch(
      /Removed sync\/connectors\/Entra\.json \(connector Entra, owned by application "Entra" in realm alpha\)/
    );
    expect(messages()).toMatch(/Wrote frodo-config-manager\.json/);
  });
});

describe('--dry-run', () => {
  test('lists the folders, the files to remove and the marker, and changes nothing', async () => {
    tenant();
    legacyTree();
    const before = snapshot();

    expect(await configManagerMigrateApplications(undefined, true)).toBe(true);

    expect(snapshot()).toEqual(before);
    expect(exists(MARKER)).toBe(false);
    expect(events).toEqual([]);
    const text = messages();
    for (const name of ['Zion Portal', 'Sso', 'Entra']) {
      expect(text).toContain(
        `Dry run: would write realms/alpha/applications/${name} (application "${name}")`
      );
    }
    for (const file of OWNED_FILES) {
      expect(text).toContain(`Dry run: would remove ${file} (`);
    }
    for (const file of KEPT_FILES) expect(text).not.toContain(file);
    expect(text).toContain(
      `Dry run: would write the layout marker ${MARKER} last`
    );
    expect(text).toContain('Dry run: nothing was changed.');
    // nothing was written, so nothing was read from the objects themselves
    expect(frodo.agent.readAgentByTypeAndId).not.toHaveBeenCalled();
  });

  test('names an application that could not be moved, and fails unless failures are allowed', async () => {
    // sorted by name, 'A?B' comes first and takes the folder A_B
    world.apps.alpha = [app('A/B'), app('A?B')];
    refs(world.apps.alpha[0], []);
    refs(world.apps.alpha[1], []);
    put('sync/connectors/Other.json', {});

    expect(await configManagerMigrateApplications(undefined, true)).toBe(false);
    expect(messages()).toMatch(
      /Dry run: application "A\/B" of realm alpha would NOT be moved: its folder name collides with the application 'A\?B'/
    );
    expect(messages()).toMatch(/1 application would not be moved/);
    expect(messages()).toMatch(/would not write the layout marker/);

    console_.printMessage.mockClear();
    expect(await configManagerMigrateApplications(undefined, true, true)).toBe(
      true
    );
    expect(messages()).toMatch(/exit code stays 0 because --allow-failures/);
  });

  test('is incomplete, and fails, when the applications of a realm cannot be read', async () => {
    tenant();
    legacyTree();
    world.listFails.add('alpha');

    expect(await configManagerMigrateApplications(undefined, true)).toBe(false);
    expect(messages()).toMatch(/applications of realm alpha cannot be read/);
  });
});

// ---- the layout marker -------------------------------------------------------

describe('the marker decides first', () => {
  test('a tree that already keeps one folder per application is left alone', async () => {
    tenant();
    legacyTree();
    put(MARKER, { applications: 'folders', formatVersion: 1 });
    const before = snapshot();

    expect(await configManagerMigrateApplications()).toBe(true);

    expect(snapshot()).toEqual(before);
    expect(frodo.app.readApplications).not.toHaveBeenCalled();
    expect(messages()).toContain(path.join(tmp, MARKER));
  });

  test('a marker that cannot be read fails, names the file, and touches nothing', async () => {
    tenant();
    legacyTree();
    put(MARKER, '{ not json');
    const before = snapshot();

    expect(await configManagerMigrateApplications()).toBe(false);

    expect(snapshot()).toEqual(before);
    expect(frodo.app.readApplications).not.toHaveBeenCalled();
    const errors = console_.printError.mock.calls
      .map(([error]) => String(error?.message ?? error))
      .join('\n');
    expect(errors).toContain(path.join(tmp, MARKER));
  });

  test('a marker with another layout fails, names the file, and touches nothing', async () => {
    tenant();
    legacyTree();
    put(MARKER, { applications: 'kind-paths', formatVersion: 1 });
    const before = snapshot();

    expect(await configManagerMigrateApplications()).toBe(false);

    expect(snapshot()).toEqual(before);
    expect(frodo.app.readApplications).not.toHaveBeenCalled();
    expect(messages()).toContain(path.join(tmp, MARKER));
    expect(messages()).toMatch(/does not change a marker/);
  });

  test('a tree without any kind-path content is a new tree: folders and marker, nothing to remove', async () => {
    tenant();

    expect(await configManagerMigrateApplications()).toBe(true);

    expect(messages()).toMatch(/nothing to move/);
    expect(
      exists('realms/alpha/applications/Zion Portal/application.json')
    ).toBe(true);
    expect(read(MARKER).applications).toBe('folders');
  });

  test('a tenant without applications still marks a kind-path tree', async () => {
    put('sync/connectors/Other.json', {});

    expect(await configManagerMigrateApplications()).toBe(true);

    expect(read(MARKER).applications).toBe('folders');
    expect(exists('sync/connectors/Other.json')).toBe(true);
  });
});

// ---- failures ----------------------------------------------------------------

describe('an application that cannot be written', () => {
  test('keeps its files, the others are moved, the marker is not written, and the command fails', async () => {
    tenant();
    legacyTree();
    world.failing.add('agent:zion-portal');

    expect(await configManagerMigrateApplications()).toBe(false);

    // Zion Portal failed: its client file stays
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/zion-portal.json')
    ).toBe(true);
    // the others were moved
    expect(
      exists(
        'realms/alpha/realm-config/saml/hosted/https___idp.zion.example.json'
      )
    ).toBe(false);
    expect(exists('sync/connectors/Entra.json')).toBe(false);
    expect(exists('realms/alpha/applications/Sso/saml/idp.json')).toBe(true);
    expect(exists(MARKER)).toBe(false);
    expect(messages()).toMatch(/1 of \d+ operations? failed/);
    expect(messages()).toMatch(/application alpha\/Zion Portal/);
    expect(messages()).toMatch(/was not written because something failed/);
  });

  test('with --allow-failures the exit code is 0, and the marker is still not written', async () => {
    tenant();
    legacyTree();
    world.failing.add('agent:zion-portal');

    expect(await configManagerMigrateApplications(undefined, false, true)).toBe(
      true
    );

    expect(exists(MARKER)).toBe(false);
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/zion-portal.json')
    ).toBe(true);
    expect(messages()).toMatch(/exit code stays 0 because --allow-failures/);
  });

  test('a run after the failure is fixed finishes the job', async () => {
    tenant();
    legacyTree();
    world.failing.add('agent:zion-portal');
    await configManagerMigrateApplications();
    world.failing.clear();

    expect(await configManagerMigrateApplications()).toBe(true);

    for (const file of OWNED_FILES) expect(exists(file)).toBe(false);
    for (const file of KEPT_FILES) expect(exists(file)).toBe(true);
    expect(read(MARKER).applications).toBe('folders');
  });

  test('an object two applications own stays until both are moved', async () => {
    const first = app('First');
    const second = app('Second');
    world.apps.alpha = [first, second];
    refs(first, [owned('connector', 'Shared', 'connectorId')]);
    refs(second, [owned('connector', 'Shared', 'connectorId')]);
    world.failing.add('connector:Shared');
    put('sync/connectors/Shared.json', { _id: 'provisioner.openicf/Shared' });
    put('sync/connectors/Other.json', {});

    await configManagerMigrateApplications();

    expect(exists('sync/connectors/Shared.json')).toBe(true);

    world.failing.clear();
    await configManagerMigrateApplications();
    expect(exists('sync/connectors/Shared.json')).toBe(false);
  });

  test('two names with one folder: the second is a failed application and keeps its files', async () => {
    // sorted by name, 'A?B' comes first and takes the folder A_B
    const first = app('A?B');
    const second = app('A/B');
    world.apps.alpha = [first, second];
    refs(first, [owned('connector', 'One', 'connectorId')]);
    refs(second, [owned('connector', 'Two', 'connectorId')]);
    put('sync/connectors/One.json', {});
    put('sync/connectors/Two.json', {});

    expect(await configManagerMigrateApplications()).toBe(false);

    expect(exists('sync/connectors/One.json')).toBe(false);
    expect(exists('sync/connectors/Two.json')).toBe(true);
    expect(messages()).toMatch(
      /its folder name collides with the application 'A\?B'/
    );
    expect(exists(MARKER)).toBe(false);
  });

  test('a file that cannot be removed fails the command, names the file, and the marker is not written', async () => {
    tenant();
    legacyTree();
    const rmSync = fs.rmSync.bind(fs);
    jest.spyOn(fs, 'rmSync').mockImplementation((file, ...rest) => {
      if (String(file).endsWith('sync/connectors/Entra.json')) {
        throw new Error('EACCES: permission denied');
      }
      return rmSync(file, ...rest);
    });

    expect(await configManagerMigrateApplications()).toBe(false);

    expect(exists('sync/connectors/Entra.json')).toBe(true);
    expect(exists(MARKER)).toBe(false);
    expect(messages()).toMatch(/remove sync\/connectors\/Entra\.json: EACCES/);
  });
});

// ---- what is matched and what never is ---------------------------------------

describe('which files are the objects', () => {
  test('a SAML file is the provider by the entity id inside it, not by its name', async () => {
    tenant();
    legacyTree();
    // a file called like the provider but holding another one is not it
    put('realms/alpha/realm-config/saml/hosted/https___idp.zion.example.json', {
      config: { entityId: 'https://impostor.example' },
    });
    put('realms/alpha/realm-config/saml/hosted/anything.json', {
      config: { entityId: IDP },
    });

    await configManagerMigrateApplications();

    expect(
      exists(
        'realms/alpha/realm-config/saml/hosted/https___idp.zion.example.json'
      )
    ).toBe(true);
    expect(exists('realms/alpha/realm-config/saml/hosted/anything.json')).toBe(
      false
    );
  });

  test('a SAML file that does not say its entity id is judged by its name', async () => {
    tenant();
    put(
      'realms/alpha/realm-config/saml/hosted/https___idp.zion.example.json',
      '{ broken'
    );
    put('realms/alpha/realm-config/saml/remote/other_sp.json', {});

    await configManagerMigrateApplications();

    expect(
      exists(
        'realms/alpha/realm-config/saml/hosted/https___idp.zion.example.json'
      )
    ).toBe(false);
    expect(exists('realms/alpha/realm-config/saml/remote/other_sp.json')).toBe(
      true
    );
  });

  test('a mapping is removed with its script files; a foreign file in its folder stays, and so does the folder', async () => {
    tenant();
    legacyTree();
    put('sync/mappings/legacy/notes.txt', 'mine');
    put('sync/mappings/legacy/legacy2.json', '{}');

    await configManagerMigrateApplications();

    expect(exists('sync/mappings/legacy/legacy.json')).toBe(false);
    expect(exists('sync/mappings/legacy/legacy.source.js')).toBe(false);
    expect(exists('sync/mappings/legacy/notes.txt')).toBe(true);
    expect(exists('sync/mappings/legacy/legacy2.json')).toBe(true);
  });

  test('an id that is a path never reaches a file outside its kind folder', async () => {
    const odd = app('Odd');
    world.apps.alpha = [odd];
    const id = '../../../../../victim';
    refs(odd, [owned('oauth2Client', id), owned('connector', '../../victim2')]);
    put('victim.json', 'keep me');
    put('realms/victim2.json', 'keep me too');
    put('sync/connectors/Other.json', {});

    await configManagerMigrateApplications();

    expect(fs.readFileSync(path.join(tmp, 'victim.json'), 'utf8')).toBe(
      'keep me'
    );
    expect(fs.readFileSync(path.join(tmp, 'realms/victim2.json'), 'utf8')).toBe(
      'keep me too'
    );
  });

  test('shared pieces are never removed: scripts and circles of trust stay at their kind paths', async () => {
    tenant();
    legacyTree();
    await configManagerMigrateApplications();

    expect(exists('realms/alpha/realm-config/saml/COT/cot1.json')).toBe(true);
    expect(exists('realms/alpha/scripts/scripts-config/s-1.json')).toBe(true);
  });
});

// ---- the config files of the standalone kinds ----------------------------------

describe('the config files of pull oauth2-agents and pull saml', () => {
  const configFiles = () => {
    fs.writeFileSync(
      path.join(cfg, 'oauth2-agents.json'),
      JSON.stringify({
        '/': {},
        alpha: {
          OAuth2Client: [
            { id: 'zion-portal', overrides: { userpassword: '${SECRET}' } },
            { id: 'standalone-client' },
          ],
          IdentityGatewayAgent: [{ id: 'zion-portal' }],
        },
      })
    );
    fs.writeFileSync(
      path.join(cfg, 'saml.json'),
      JSON.stringify({
        alpha: {
          samlProviders: [
            { entityId: IDP, fileName: 'renamed' },
            { entityId: 'https://other.example' },
          ],
          circlesOfTrust: ['cot1'],
        },
      })
    );
  };

  test('entries that name an owned object are reported, and the files are never changed', async () => {
    tenant();
    legacyTree();
    configFiles();
    const before = snapshot(cfg);

    expect(
      await configManagerMigrateApplications(undefined, false, false, cfg)
    ).toBe(true);

    expect(snapshot(cfg)).toEqual(before);
    const text = messages();
    expect(text).toMatch(
      /oauth2-agents\.json: the OAuth2 client "zion-portal" of realm alpha is owned by application "Zion Portal"\. The entry stays in the file, which is never changed, and "pull oauth2-agents" skips it/
    );
    expect(text).toMatch(
      new RegExp(
        `saml\\.json: the SAML provider "${IDP.replaceAll('.', '\\.')}" of realm alpha is owned by application "Sso"`
      )
    );
    // an entry for an object no application owns, and one of another type, are not mentioned
    expect(text).not.toContain('"standalone-client" of realm');
    expect(text).not.toContain('other.example" of realm');
    expect(text.match(/oauth2-agents\.json:/g)).toHaveLength(1);
  });

  test('a dry run reports them too', async () => {
    tenant();
    legacyTree();
    configFiles();

    await configManagerMigrateApplications(undefined, true, false, cfg);

    expect(messages()).toMatch(
      /Dry run: oauth2-agents\.json: the OAuth2 client "zion-portal"/
    );
    expect(messages()).toMatch(/Dry run: saml\.json: the SAML provider/);
  });

  test('a config folder without those files is fine', async () => {
    tenant();
    legacyTree();

    expect(
      await configManagerMigrateApplications(undefined, false, false, cfg)
    ).toBe(true);

    expect(read(MARKER).applications).toBe('folders');
  });

  test('a config folder that does not exist fails before anything is touched', async () => {
    tenant();
    legacyTree();
    const before = snapshot();

    expect(
      await configManagerMigrateApplications(
        undefined,
        false,
        false,
        path.join(cfg, 'missing')
      )
    ).toBe(false);

    expect(snapshot()).toEqual(before);
    expect(frodo.app.readApplications).not.toHaveBeenCalled();
  });

  test('a config file that cannot be read fails before anything is touched', async () => {
    tenant();
    legacyTree();
    fs.writeFileSync(path.join(cfg, 'saml.json'), '{ broken');
    const before = snapshot();

    expect(
      await configManagerMigrateApplications(undefined, false, false, cfg)
    ).toBe(false);

    expect(snapshot()).toEqual(before);
    expect(frodo.app.readApplications).not.toHaveBeenCalled();
  });
});

// ---- realms --------------------------------------------------------------------

describe('realms', () => {
  test('without a realm every realm is moved; the root realm of a Cloud tenant has no applications', async () => {
    world.realms = ['/', 'alpha', 'bravo'];
    world.apps.alpha = [ZION];
    world.apps.bravo = [app('Bravo App')];
    world.apps['/'] = [app('Root App')];
    refs(ZION, []);
    refs(world.apps.bravo[0], []);
    refs(world.apps['/'][0], []);

    expect(await configManagerMigrateApplications()).toBe(true);

    expect(world.readIn).toEqual(['alpha', 'bravo']);
    expect(
      exists('realms/alpha/applications/Zion Portal/application.json')
    ).toBe(true);
    expect(exists('realms/bravo/applications/Bravo App/application.json')).toBe(
      true
    );
    expect(exists('realms/root')).toBe(false);
    expect(read(MARKER).applications).toBe('folders');
  });

  test('every application is read from its own realm, whatever realm was read last', async () => {
    world.realms = ['/', 'alpha', 'bravo'];
    const inAlpha = app('Alpha App');
    const inBravo = app('Bravo App');
    world.apps.alpha = [inAlpha];
    world.apps.bravo = [inBravo];
    refs(inAlpha, [owned('oauth2Client', 'alpha-client')]);
    refs(inBravo, [owned('oauth2Client', 'bravo-client')]);

    expect(await configManagerMigrateApplications()).toBe(true);

    expect(world.readAt).toEqual([
      ['alpha-client', 'alpha'],
      ['bravo-client', 'bravo'],
    ]);
  });

  test('on ForgeOps the root realm has applications too', async () => {
    deployment = 'forgeops';
    world.apps['/'] = [app('Root App')];
    refs(world.apps['/'][0], []);

    await configManagerMigrateApplications();

    expect(world.readIn).toEqual(['/', 'alpha']);
    expect(exists('realms/root/applications/Root App/application.json')).toBe(
      true
    );
  });

  test('with a realm only that realm is moved, the objects shared with other realms stay, and the tree is not marked', async () => {
    world.realms = ['/', 'alpha', 'bravo'];
    const inAlpha = app('Alpha App');
    const inBravo = app('Bravo App');
    world.apps.alpha = [inAlpha];
    world.apps.bravo = [inBravo];
    refs(inAlpha, [
      owned('oauth2Client', 'alpha-client'),
      owned('connector', 'Shared', 'connectorId'),
      owned('connector', 'AlphaOnly', 'connectorId'),
    ]);
    refs(inBravo, [
      owned('oauth2Client', 'alpha-client'),
      owned('connector', 'Shared', 'connectorId'),
    ]);
    put('realms/alpha/realm-config/agents/OAuth2Client/alpha-client.json', {});
    put('realms/bravo/realm-config/agents/OAuth2Client/alpha-client.json', {});
    put('sync/connectors/Shared.json', {});
    put('sync/connectors/AlphaOnly.json', {});

    expect(await configManagerMigrateApplications('alpha')).toBe(true);

    expect(world.readIn).toEqual(['alpha']);
    // the ownership of alpha and of bravo, each read once
    expect(frodo.app.readApplicationOwnership).toHaveBeenCalledTimes(2);
    expect(exists('realms/alpha/applications/Alpha App/application.json')).toBe(
      true
    );
    expect(exists('realms/bravo/applications')).toBe(false);
    // the client of realm alpha is realm alpha's; bravo's client of the same id is bravo's
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/alpha-client.json')
    ).toBe(false);
    expect(
      exists('realms/bravo/realm-config/agents/OAuth2Client/alpha-client.json')
    ).toBe(true);
    // a connector that an application of another realm also owns stays
    expect(exists('sync/connectors/Shared.json')).toBe(true);
    expect(exists('sync/connectors/AlphaOnly.json')).toBe(false);
    expect(exists(MARKER)).toBe(false);
    expect(messages()).toMatch(/only realm 'alpha' was moved/);
    expect(messages()).toMatch(
      /"Bravo App" in realm bravo is not moved by this run/
    );
  });

  test('when another realm cannot be read, what only it could own stays, and the command fails', async () => {
    world.realms = ['/', 'alpha', 'bravo'];
    world.apps.alpha = [ENTRA, ZION];
    refs(ENTRA, [owned('connector', 'Entra', 'connectorId')]);
    refs(ZION, [owned('oauth2Client', 'zion-portal')]);
    world.listFails.add('bravo');
    put('sync/connectors/Entra.json', {});
    put('realms/alpha/realm-config/agents/OAuth2Client/zion-portal.json', {});
    put('sync/connectors/Other.json', {});

    expect(await configManagerMigrateApplications('alpha')).toBe(false);

    // a realm-bound object needs only its own realm
    expect(
      exists('realms/alpha/realm-config/agents/OAuth2Client/zion-portal.json')
    ).toBe(false);
    // a connector belongs to the whole tenant: who else owns it is not known
    expect(exists('sync/connectors/Entra.json')).toBe(true);
    expect(messages()).toMatch(/applications of realm bravo could not be read/);
    expect(exists(MARKER)).toBe(false);
  });
});

// ---- the home --------------------------------------------------------------------

test('nothing was written to the home directory', () => {
  expect(os.homedir()).toBe(fakeHome);
  expect(fs.readdirSync(fakeHome)).toEqual([]);
});
