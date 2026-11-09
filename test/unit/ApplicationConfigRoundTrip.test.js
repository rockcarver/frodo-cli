import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `pull applications` and `push applications` over the same temporary tree
 * (decision record 0042, slice S4 of frodo-cli#1101): what the library reads of
 * the applications of a realm is pulled into folders, and the library receives
 * the same objects when the folders are pushed. Only the library is a fake; the
 * writers and readers of the files, the pull and the push are the real code, so a
 * layout that the push cannot read back (a secret, a literal `${`, a script
 * source, the metadata of a provider, the members of a circle of trust) fails
 * here. The per-user settings are a fake and `os.homedir()` is replaced: nothing
 * here may touch the real home.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

let tmp;
let fakeHome;
let world;
let calls;

/** A function that is a spy and, for any property read, another such function. */
function deepStub(seed = {}) {
  const children = new Map(Object.entries(seed));
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Jest takes an object with `calls.all()` and `calls.count()` for a Jasmine spy
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'calls')
        return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}

// the colours of the real console, without colours
const plainTheme = new Proxy(() => '', {
  get: (target, prop) =>
    typeof prop === 'symbol' ? undefined : (text) => String(text),
});
const frodo = deepStub({
  utils: deepStub({
    terminal: { theme: () => plainTheme, resolveThemeMode: () => 'dark' },
    constants: {
      DEFAULT_REALM_KEY: '__default__realm__',
      CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
      FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
    },
  }),
});
const state = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state,
  FrodoError: class FrodoError extends Error {
    constructor(message, original) {
      super(message);
      this.original = original;
    }
  },
}));

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  TEST_DOUBLE: true,
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'folders',
}));

const { configManagerExportApplications, configManagerImportApplications } =
  await import(src('ops/ApplicationConfigOps.ts'));
const settingsStore = await import(src('utils/SettingsStore'));

// ---- the library, as far as the two commands use it ------------------------

const b64 = (text) => Buffer.from(text).toString('base64');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const SECRET_VARIABLE = 'APP_ZION_PORTAL_CLIENT_SECRET';

/** What the library reads out of a record, without a tenant. */
function recordReferences(record) {
  const references = [];
  const sso = record.ssoEntities ?? {};
  const owned = (kind, id, from) =>
    references.push({ kind, id, ownership: 'owned', from });
  if (sso.oidcId) owned('oauth2Client', sso.oidcId, 'ssoEntities.oidcId');
  if (sso.idpPrivateId) {
    owned(
      'saml2Provider',
      Buffer.from(sso.idpPrivateId, 'base64').toString(),
      'ssoEntities.idpPrivateId'
    );
  }
  if (sso.spPrivateId) {
    owned(
      'saml2Provider',
      Buffer.from(sso.spPrivateId, 'base64').toString(),
      'ssoEntities.spPrivateId'
    );
  }
  if (record.connectorId) {
    owned('connector', record.connectorId, 'connectorId');
  }
  for (const mapping of record.mappingNames ?? []) {
    owned('mapping', mapping, 'mappingNames');
  }
  return references;
}

function installLibrary() {
  const { utils, app, agent, idm, saml2, script, realm } = frodo;
  state.getDeploymentType.mockReset().mockReturnValue('forgeops');
  state.setRealm.mockReset();
  utils.getWorkingDirectory.mockReset().mockImplementation(() => tmp);
  // as the library does: relative to the working directory, directories made on request
  utils.getFilePath.mockReset().mockImplementation((rel, mkdirs = false) => {
    const target = `${tmp}/${rel}`;
    if (mkdirs && rel.includes('/')) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
    }
    return target;
  });
  utils.saveJsonToFile
    .mockReset()
    .mockImplementation((data, file) =>
      fs.writeFileSync(file, JSON.stringify(data, null, 2))
    );
  utils.saveTextToFile
    .mockReset()
    .mockImplementation((data, file) => fs.writeFileSync(file, data));
  utils.decodeBase64
    .mockReset()
    .mockImplementation((text) => Buffer.from(text, 'base64').toString());
  // as the library does: a literal ${ stays literal when the file is read
  utils.escapePlaceholders
    .mockReset()
    .mockImplementation((content) =>
      JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'))
    );
  // as the library does: ${NAME} comes from the environment, a name without a value is an error
  utils.readJsonFile.mockReset().mockImplementation((file) => {
    let content = fs.readFileSync(file, 'utf8');
    const placeholders = content.match(/\\*?\${.*?}/g) ?? [];
    for (const placeholder of placeholders.filter(
      (p) => !p.startsWith('\\\\')
    )) {
      const variable = placeholder.replace(/\${(.*)}/, '$1');
      const value = process.env[variable];
      if (value === undefined) {
        throw new Error(`No value found for placeholder "${variable}"`);
      }
      content = content.replaceAll(placeholder, value);
    }
    return JSON.parse(content.replace(/\\\\\${/g, '${'));
  });
  realm.readRealms.mockReset().mockResolvedValue([{ name: 'alpha' }]);

  // reads
  app.getApplicationRecordReferences
    .mockReset()
    .mockImplementation(recordReferences);
  app.readApplications
    .mockReset()
    .mockImplementation(async () =>
      structuredClone(world.side === 'source' ? world.apps : world.tenantApps)
    );
  app.readApplicationByName.mockReset();
  app.readApplicationReferences
    .mockReset()
    .mockImplementation(async (id) => world.references[id]);
  agent.readAgentByTypeAndId
    .mockReset()
    .mockImplementation(async (type, id) => structuredClone(world.agents[id]));
  idm.connector.readConnector
    .mockReset()
    .mockImplementation(async (id) => structuredClone(world.connectors[id]));
  idm.mapping.readMappings
    .mockReset()
    .mockImplementation(async () => structuredClone(world.mappings));
  saml2.entityProvider.exportSaml2Provider
    .mockReset()
    .mockImplementation(async (entityId) =>
      structuredClone(world.providers[entityId])
    );
  saml2.circlesOfTrust.exportCircleOfTrust
    .mockReset()
    .mockImplementation(async (id) => ({
      saml: { cot: { [id]: structuredClone(world.cots[id]) } },
    }));
  script.readScript
    .mockReset()
    .mockImplementation(async (id) => structuredClone(world.scripts[id]));

  // writes: each is recorded in order with what it received
  const record = (label, work) =>
    jest.fn(async (...args) => {
      calls.push({ label: label(...args), args: structuredClone(args) });
      return work?.(...args) ?? {};
    });
  script.updateScript
    .mockReset()
    .mockImplementation(record((id) => `script:${id}`));
  idm.connector.importConnectors
    .mockReset()
    .mockImplementation(
      record((data) => `connector:${Object.keys(data.connector)[0]}`)
    );
  idm.mapping.importMapping
    .mockReset()
    .mockImplementation(record((id) => `mapping:${id}`));
  agent.importAgent
    .mockReset()
    .mockImplementation(record((id) => `agent:${id}`));
  saml2.entityProvider.importSaml2Providers.mockReset().mockImplementation(
    record(({ saml }) => {
      const [role, providers] = Object.entries({
        hosted: saml.hosted,
        remote: saml.remote,
      }).find(([, found]) => Object.keys(found).length > 0);
      return `saml:${Object.keys(providers)[0]}:${role}`;
    })
  );
  saml2.circlesOfTrust.importCirclesOfTrust
    .mockReset()
    .mockImplementation(
      record(({ saml }) => `cot:${Object.keys(saml.cot).join(',')}`)
    );
  app.importApplication
    .mockReset()
    .mockImplementation(record((id) => `app:update:${id}`));
  app.createApplication
    .mockReset()
    .mockImplementation(record((id) => `app:create:${id}`));
}

// ---- what the library holds ------------------------------------------------

function defineWorld() {
  const portal = {
    _id: 'app-portal',
    _rev: '3',
    _provider: { name: 'internal' },
    name: 'Zion Portal',
    description: 'Costs ${price} a month',
    templateName: 'web',
    templateVersion: '1.0',
    ssoEntities: { oidcId: 'zion-portal-client' },
    members: [{ _id: 'user-1' }],
    owners: [{ _id: 'user-2' }],
    roles: [{ _id: 'role-1' }],
    glossary: { fields: [] },
  };
  const sso = {
    _id: 'app-sso',
    _rev: '1',
    name: 'Zion SSO',
    templateName: 'saml',
    templateVersion: '1.2',
    ssoEntities: {
      idpLocation: 'hosted',
      idpPrivateId: b64('urn:zion:idp'),
      spLocation: 'remote',
      spPrivateId: b64('urn:partner:sp'),
    },
    members: [{ _id: 'user-3' }],
  };
  const directory = {
    _id: 'app-directory',
    _rev: '2',
    name: 'Zion Directory',
    templateName: 'azure.ad',
    templateVersion: '2.0',
    connectorId: 'ZionDirectory',
    mappingNames: [
      'systemZionUser_managedAlpha_user',
      'managedAlpha_user_systemZionUser',
    ],
    owners: [{ _id: 'user-4' }],
  };
  const shared = (kind, id, extra = {}) => ({
    kind,
    id,
    ownership: 'shared',
    from: 'x',
    ...extra,
  });
  const refsOf = (application, extra = []) => ({
    applicationId: application._id,
    applicationName: application.name,
    references: [...recordReferences(application), ...extra],
    problems: [],
  });
  const library = {
    _id: 'script-library',
    name: 'Zion Library',
    context: 'LIBRARY',
    language: 'JAVASCRIPT',
    script: b64('exports.shout = function (text) { return text + "!"; };'),
  };
  const mapper = {
    _id: 'script-mapper',
    name: 'Zion Mapper',
    context: 'SAML2_IDP_ATTRIBUTE_MAPPER',
    language: 'JAVASCRIPT',
    script: b64('var lib = require("Zion Library");\nlib.shout("mapped");'),
  };
  return {
    side: 'target',
    // the tenant that is pushed to has the portal only; `apps` is the tenant that is pulled from
    tenantApps: [{ _id: 'tenant-portal', _rev: '9', name: 'Zion Portal' }],
    apps: [portal, sso, directory],
    references: {
      [portal._id]: refsOf(portal),
      [sso._id]: refsOf(sso, [
        shared('script', mapper._id, { name: mapper.name }),
        shared('script', library._id, { name: library.name }),
        shared('circleOfTrust', 'zion'),
      ]),
      [directory._id]: refsOf(directory),
    },
    agents: {
      'zion-portal-client': {
        _id: 'zion-portal-client',
        userpassword: '****',
        coreOAuth2ClientConfig: {
          clientType: 'Confidential',
          redirectionUris: ['https://portal.example.com/cb'],
        },
        advancedOAuth2ClientConfig: { name: { value: 'Price: ${price}' } },
      },
    },
    providers: {
      'urn:zion:idp': {
        saml: {
          hosted: {
            aWRw: {
              entityId: 'urn:zion:idp',
              _id: 'aWRw',
              assertionProcessing: {
                attributeMapper: { attributeMapperScript: mapper._id },
              },
            },
          },
          remote: {},
          metadata: { 'urn:zion:idp': ['<EntityDescriptor id="idp">', '</>'] },
        },
      },
      'urn:partner:sp': {
        saml: {
          hosted: {},
          remote: {
            c3A: { entityId: 'urn:partner:sp', _id: 'c3A' },
          },
          metadata: { 'urn:partner:sp': ['<EntityDescriptor id="sp"/>'] },
        },
      },
    },
    cots: {
      zion: {
        _id: 'zion',
        status: 'active',
        trustedProviders: ['urn:zion:idp|saml2', 'urn:partner:sp|saml2'],
      },
    },
    scripts: { [mapper._id]: mapper, [library._id]: library },
    connectors: {
      ZionDirectory: {
        _id: 'provisioner.openicf/ZionDirectory',
        name: 'ZionDirectory',
        enabled: true,
        configurationProperties: { host: 'directory.example.com' },
        description: 'Reaches ${host} over TLS',
      },
    },
    mappings: [
      {
        _id: 'sync/systemZionUser_managedAlpha_user',
        name: 'systemZionUser_managedAlpha_user',
        source: 'system/ZionDirectory/account',
        target: 'managed/alpha_user',
        onCreate: {
          type: 'text/javascript',
          source: ['var a = 1;', 'a;'],
        },
        properties: [{ source: 'mail', target: 'mail' }],
      },
      {
        _id: 'mapping/managedAlpha_user_systemZionUser',
        _rev: '5',
        name: 'managedAlpha_user_systemZionUser',
        source: 'managed/alpha_user',
        target: 'system/ZionDirectory/account',
        properties: [],
      },
    ],
  };
}

// ---- the tests -------------------------------------------------------------

let errorOutput;
let homedir;

beforeAll(() => {
  // abort before anything is written if the user's home could still be reached
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-apps-home-'));
  homedir = jest.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  if (os.homedir() !== fakeHome || settingsStore.TEST_DOUBLE !== true) {
    throw new Error('the user home is not replaced: refusing to run');
  }
});
afterAll(() => {
  homedir.mockRestore();
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-apps-roundtrip-'));
  world = defineWorld();
  calls = [];
  installLibrary();
  errorOutput = jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env[SECRET_VARIABLE] = 'the-secret';
});
afterEach(() => {
  errorOutput.mockRestore();
  delete process.env[SECRET_VARIABLE];
  fs.rmSync(tmp, { recursive: true, force: true });
});

const output = () =>
  errorOutput.mock.calls.map((call) => call.join(' ')).join('\n');
const sent = (label) => calls.find((call) => call.label === label).args;
const withoutIds = (labels) => labels.map((l) => l.replace(UUID, '<id>'));

/** Pull the realm into the tree; a failure shows what the commands printed. */
async function pull() {
  world.side = 'source';
  const pulled = await configManagerExportApplications(undefined, 'alpha');
  world.side = 'target';
  if (!pulled) throw new Error(`the pull failed:\n${output()}`);
  calls = [];
}

async function pullThenPush() {
  await pull();
  if (!(await configManagerImportApplications(undefined, 'alpha'))) {
    throw new Error(`the push failed:\n${output()}`);
  }
}

describe('pull applications, then push applications', () => {
  test('pulls the three applications into folders and pushes them in the order in which each step has what it needs', async () => {
    await pullThenPush();

    expect(withoutIds(calls.map((call) => call.label))).toEqual([
      // Zion Directory: the connector, its mappings, the record
      'connector:ZionDirectory',
      'mapping:sync/systemZionUser_managedAlpha_user',
      'mapping:mapping/managedAlpha_user_systemZionUser',
      'app:create:<id>',
      // Zion Portal: the client, the record, under the id of the tenant
      'agent:zion-portal-client',
      'app:update:tenant-portal',
      // Zion SSO: the library before the script that requires it, the providers,
      // the circle of trust they are members of, the record
      'script:script-library',
      'script:script-mapper',
      'saml:urn:zion:idp:hosted',
      'saml:urn:partner:sp:remote',
      'cot:zion',
      'app:create:<id>',
    ]);
    expect(output()).not.toMatch(/failed/);
  });

  test('a web application: the secret comes from the environment, a literal ${ stays literal, the record goes to the tenant id without who has access', async () => {
    await pullThenPush();

    const folder = `realms/alpha/applications/${fs
      .readdirSync(`${tmp}/realms/alpha/applications`)
      .find((name) => /portal/i.test(name))}`;
    const written = JSON.parse(
      fs.readFileSync(`${tmp}/${folder}/oauth2-client.json`, 'utf8')
    );
    // never in the clear in the file
    expect(written.userpassword).toBe('${' + SECRET_VARIABLE + '}');
    expect(
      fs.readFileSync(`${tmp}/${folder}/oauth2-client.json`, 'utf8')
    ).not.toMatch(/the-secret/);

    const [clientId, data, global] = sent('agent:zion-portal-client');
    expect(clientId).toBe('zion-portal-client');
    expect(global).toBe(false);
    expect(data.agent[clientId]).toEqual({
      userpassword: 'the-secret',
      coreOAuth2ClientConfig: world.agents[clientId].coreOAuth2ClientConfig,
      advancedOAuth2ClientConfig: { name: { value: 'Price: ${price}' } },
    });

    const [id, body, options] = sent('app:update:tenant-portal');
    expect(id).toBe('tenant-portal');
    expect(options).toEqual({ deps: false });
    expect(body.managedApplication[id]).toEqual({
      _id: 'tenant-portal',
      name: 'Zion Portal',
      description: 'Costs ${price} a month',
      templateName: 'web',
      templateVersion: '1.0',
      ssoEntities: { oidcId: 'zion-portal-client' },
    });
  });

  test('a SAML application: scripts, providers with their metadata, and the members of the circle of trust come back as the library gave them', async () => {
    await pullThenPush();

    const [mapperId, mapperData] = sent('script:script-mapper');
    expect(mapperId).toBe('script-mapper');
    expect(mapperData).toMatchObject({
      name: 'Zion Mapper',
      context: 'SAML2_IDP_ATTRIBUTE_MAPPER',
      script: 'var lib = require("Zion Library");\nlib.shout("mapped");',
    });
    expect(sent('script:script-library')[1].script).toBe(
      'exports.shout = function (text) { return text + "!"; };'
    );

    const [idp, idpOptions] = sent('saml:urn:zion:idp:hosted');
    expect(idpOptions).toEqual({ deps: false });
    // keyed by the entity id, as the library imports it
    expect(idp.saml.hosted).toEqual({
      'urn:zion:idp': world.providers['urn:zion:idp'].saml.hosted.aWRw,
    });
    expect(idp.saml.metadata).toEqual({
      'urn:zion:idp': ['<EntityDescriptor id="idp">\n</>'],
    });
    const [sp] = sent('saml:urn:partner:sp:remote');
    expect(sp.saml.remote).toEqual({
      'urn:partner:sp': world.providers['urn:partner:sp'].saml.remote.c3A,
    });

    const [cot] = sent('cot:zion');
    expect(cot.saml.cot).toEqual({ zion: world.cots.zion });

    // a new application: a new id, and again nothing of who has access
    const created = calls.find(
      (call) =>
        call.label.startsWith('app:create:') && call.args[1].name === 'Zion SSO'
    );
    const [id, body] = created.args;
    expect(id).toMatch(UUID);
    expect(body).toEqual({
      _id: id,
      name: 'Zion SSO',
      templateName: 'saml',
      templateVersion: '1.2',
      ssoEntities: world.apps[1].ssoEntities,
    });
  });

  test('a provisioning application: the connector, the mappings with their script sources, and a legacy mapping under sync/<name>', async () => {
    await pullThenPush();

    const [connectors, connectorOptions] = sent('connector:ZionDirectory');
    expect(connectorOptions).toEqual({ deps: false });
    expect(connectors.connector).toEqual({
      ZionDirectory: world.connectors.ZionDirectory,
    });

    const [legacyId, legacy, legacyOptions] = sent(
      'mapping:sync/systemZionUser_managedAlpha_user'
    );
    expect(legacyId).toBe('sync/systemZionUser_managedAlpha_user');
    expect(legacyOptions).toEqual({ deps: false });
    expect(legacy.mapping).toEqual({});
    expect(legacy.sync.mappings).toEqual([
      {
        _id: 'sync/systemZionUser_managedAlpha_user',
        name: 'systemZionUser_managedAlpha_user',
        source: 'system/ZionDirectory/account',
        target: 'managed/alpha_user',
        onCreate: { type: 'text/javascript', source: 'var a = 1;\na;' },
        properties: [{ source: 'mail', target: 'mail' }],
      },
    ]);

    const [newId, next] = sent(
      'mapping:mapping/managedAlpha_user_systemZionUser'
    );
    expect(newId).toBe('mapping/managedAlpha_user_systemZionUser');
    expect(next.mapping[newId]).toEqual({
      _id: 'mapping/managedAlpha_user_systemZionUser',
      name: 'managedAlpha_user_systemZionUser',
      source: 'managed/alpha_user',
      target: 'system/ZionDirectory/account',
      properties: [],
    });
  });

  test('with the secret unset, only the application with the secret fails, and it is named with the variable; nothing was written for it', async () => {
    delete process.env[SECRET_VARIABLE];
    await pull();

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    expect(output()).toMatch(/1 of 3 applications failed/);
    expect(output()).toContain(SECRET_VARIABLE);
    expect(output()).toMatch(/alpha\/Zion Portal/);
    const labels = calls.map((call) => call.label);
    expect(labels).not.toContain('agent:zion-portal-client');
    expect(labels).not.toContain('app:update:tenant-portal');
    // the other two applications were pushed
    expect(labels).toContain('connector:ZionDirectory');
    expect(labels).toContain('cot:zion');
  });

  test('once the tenant has the applications, the same tree updates all of them under their own ids', async () => {
    await pullThenPush();
    world.tenantApps = [
      { _id: 'tenant-portal', _rev: '10', name: 'Zion Portal' },
      { _id: 'tenant-sso', _rev: '1', name: 'Zion SSO' },
      { _id: 'tenant-directory', _rev: '1', name: 'Zion Directory' },
    ];
    calls = [];

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls.map((call) => call.label)).toEqual([
      'connector:ZionDirectory',
      'mapping:sync/systemZionUser_managedAlpha_user',
      'mapping:mapping/managedAlpha_user_systemZionUser',
      'app:update:tenant-directory',
      'agent:zion-portal-client',
      'app:update:tenant-portal',
      'script:script-library',
      'script:script-mapper',
      'saml:urn:zion:idp:hosted',
      'saml:urn:partner:sp:remote',
      'cot:zion',
      'app:update:tenant-sso',
    ]);
  });
});
