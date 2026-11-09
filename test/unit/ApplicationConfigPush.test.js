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
 * `frodo config-manager push applications` (decision record 0042, slice S4 of
 * frodo-cli#1101): every application folder is pushed in an order in which each
 * step has what it needs (scripts, connector, mappings, OAuth2 client, SAML
 * providers, circles of trust, the record last), the application is matched by
 * name (update under the tenant's id, or create), members, owners and roles are
 * never sent, a missing environment variable or an incomplete folder fails that
 * application before anything is written, a failed object means the record is
 * not written, and one summary names the applications that failed (record 0040).
 *
 * The library is a set of fakes that record their calls, the files are real, in a
 * temporary folder. The per-user settings are a fake too: nothing here may touch
 * the real home.
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
let calls;
let bodies;
let userLayout;

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
  const decode = (value) => Buffer.from(value, 'base64').toString();
  return {
    FrodoError,
    state: {
      getDeploymentType: () => deployment,
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
        // as the library does: a literal ${ stays literal when the file is read
        escapePlaceholders: (content) =>
          JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${')),
        // as the library does: ${NAME} comes from the environment, a name without a value is an error
        readJsonFile: (file) => {
          let content = fs.readFileSync(file, 'utf8');
          const placeholders = content.match(/\\*?\${.*?}/g) ?? [];
          for (const placeholder of placeholders.filter(
            (p) => !p.startsWith('\\\\')
          )) {
            const variable = placeholder.replace(/\${(.*)}/, '$1');
            const value = process.env[variable];
            if (value === undefined) {
              throw new FrodoError(
                `No value found for placeholder "${variable}"`
              );
            }
            content = content.replaceAll(placeholder, value);
          }
          return JSON.parse(content.replace(/\\\\\${/g, '${'));
        },
      },
      realm: {
        readRealms: async () => world.realms.map((name) => ({ name })),
      },
      app: {
        // what the library reads out of a record, without a tenant
        getApplicationRecordReferences: (record) => {
          const references = [];
          const sso = record.ssoEntities ?? {};
          if (sso.oidcId) {
            references.push({
              kind: 'oauth2Client',
              id: sso.oidcId,
              ownership: 'owned',
              from: 'ssoEntities.oidcId',
            });
          }
          if (sso.idpPrivateId) {
            references.push({
              kind: 'saml2Provider',
              id: decode(sso.idpPrivateId),
              ownership: 'owned',
              from: 'ssoEntities.idpPrivateId',
            });
          }
          if (sso.spPrivateId) {
            references.push({
              kind: 'saml2Provider',
              id: decode(sso.spPrivateId),
              ownership: 'owned',
              from: 'ssoEntities.spPrivateId',
            });
          }
          if (record.sharedClientId) {
            references.push({
              kind: 'oauth2Client',
              id: record.sharedClientId,
              ownership: 'shared',
              from: 'sharedClientId',
            });
          }
          if (record.connectorId) {
            references.push({
              kind: 'connector',
              id: record.connectorId,
              ownership: 'owned',
              from: 'connectorId',
            });
          }
          for (const mapping of record.mappingNames ?? []) {
            references.push({
              kind: 'mapping',
              id: mapping,
              ownership: 'owned',
              from: 'mappingNames',
            });
          }
          return references;
        },
        readApplications: jest.fn(async () => {
          if (world.listFails?.has(currentRealm)) {
            throw new Error(`cannot list ${currentRealm}`);
          }
          return structuredClone(world.apps[currentRealm] ?? []);
        }),
        importApplication: jest.fn(async (id, data, options) => {
          calls.push(`app:update:${id}`);
          bodies.update = data.managedApplication[id];
          bodies.updateOptions = options;
          if (world.failing.has('record')) throw new Error('record rejected');
        }),
        createApplication: jest.fn(async (id, data) => {
          calls.push(`app:create:${id}`);
          bodies.create = data;
          bodies.createdId = id;
          if (world.failing.has('record')) throw new Error('record rejected');
        }),
      },
      agent: {
        importAgent: jest.fn(async (id, data, global) => {
          calls.push(`agent:${id}`);
          bodies.agent = { id, data, global };
          if (world.failing.has(`agent:${id}`)) {
            throw new Error(`client ${id} rejected`);
          }
        }),
      },
      idm: {
        connector: {
          importConnectors: jest.fn(async (data, options) => {
            const id = Object.keys(data.connector)[0];
            calls.push(`connector:${id}`);
            bodies.connector = { data, options };
            if (world.failing.has(`connector:${id}`)) {
              throw new Error(`connector ${id} rejected`);
            }
          }),
        },
        mapping: {
          importMapping: jest.fn(async (id, data, options) => {
            calls.push(`mapping:${id}`);
            (bodies.mappings ??= {})[id] = { data, options };
            if (world.failing.has(`mapping:${id}`)) {
              throw new Error(`mapping ${id} rejected`);
            }
          }),
        },
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

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => userLayout,
}));

// the single-item helpers of the existing modules: they record the call and read
// the real files, so that the layout the pull writes is what the push reads
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const shared = {
  importScriptFromFiles: jest.fn(async (id, realm) => {
    const realmDir = realm === '/' ? 'root' : realm;
    const config = readJson(
      path.join(tmp, `realms/${realmDir}/scripts/scripts-config/${id}.json`)
    );
    calls.push(`script:${id}`);
    if (world.failing.has(`script:${id}`)) {
      throw new Error(`script ${config.name} rejected`);
    }
  }),
  importSamlProviderFromFile: jest.fn(async (file, location) => {
    calls.push(`saml:${file.config.entityId}:${location}`);
    (bodies.providers ??= {})[file.config.entityId] = { file, location };
    if (world.failing.has(`saml:${file.config.entityId}`)) {
      throw new Error(`provider ${file.config.entityId} rejected`);
    }
  }),
  findCirclesOfTrustOfProviders: jest.fn((realm, entityIds) => {
    const realmDir = realm === '/' ? 'root' : realm;
    const cotDir = path.join(tmp, `realms/${realmDir}/realm-config/saml/COT`);
    if (!fs.existsSync(cotDir)) return [];
    return fs
      .readdirSync(cotDir)
      .map((file) => readJson(path.join(cotDir, file)))
      .filter((cot) =>
        (cot.trustedProviders ?? []).some((member) =>
          entityIds.includes(String(member).split('|')[0])
        )
      )
      .map((cot) => cot._id)
      .sort();
  }),
  importCircleOfTrustFromFile: jest.fn(async (cotId) => {
    calls.push(`cot:${cotId}`);
    if (world.failing.has(`cot:${cotId}`)) {
      throw new Error(`circle of trust ${cotId} rejected`);
    }
  }),
  // like the real helper, it resolves the path against the working directory (as the library's
  // getFilePath does), so a path that is already absolute does not exist
  readMappingFromDirectory: jest.fn((mappingPath, name) =>
    readJson(path.join(tmp, mappingPath, `${name}.json`))
  ),
};
jest.unstable_mockModule(src('configManagerOps/FrConfigSamlOps'), () => ({
  readSamlProviderForFile: jest.fn(),
  exportCircleOfTrustToFile: jest.fn(),
  importSamlProviderFromFile: shared.importSamlProviderFromFile,
  findCirclesOfTrustOfProviders: shared.findCirclesOfTrustOfProviders,
  importCircleOfTrustFromFile: shared.importCircleOfTrustFromFile,
}));
jest.unstable_mockModule(src('configManagerOps/FrConfigScriptOps'), () => ({
  exportScriptToFiles: jest.fn(),
  importScriptFromFiles: shared.importScriptFromFiles,
}));
jest.unstable_mockModule(
  src('configManagerOps/FrConfigConnectorMappingOps'),
  () => ({
    exportMappingToDirectory: jest.fn(),
    readMappingFromDirectory: shared.readMappingFromDirectory,
  })
);

const { configManagerImportApplications } = await import(
  src('ops/ApplicationConfigOps.ts')
);
const { frodo } = await import('@rockcarver/frodo-lib');

// ---- builders -------------------------------------------------------------

const b64 = (text) => Buffer.from(text).toString('base64');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const APPS = (realm) => `realms/${realm}/applications`;

function put(rel, content) {
  fs.writeFileSync(
    dir(rel),
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
}

/** Write one application folder the way `pull applications` does. */
function writeApp(realm, folder, files) {
  const base = `${APPS(realm)}/${folder}`;
  if (files.record) put(`${base}/application.json`, files.record);
  if (files.client) put(`${base}/oauth2-client.json`, files.client);
  if (files.idp) put(`${base}/saml/idp.json`, files.idp);
  if (files.sp) put(`${base}/saml/sp.json`, files.sp);
  if (files.connector) put(`${base}/connector.json`, files.connector);
  for (const [name, mapping] of Object.entries(files.mappings ?? {})) {
    put(`${base}/mappings/${name}/${name}.json`, mapping);
  }
}

const webRecord = (name, clientId, extra = {}) => ({
  name,
  templateName: 'web',
  templateVersion: '1.0',
  ssoEntities: { oidcId: clientId },
  ...extra,
});
const client = (id, extra = {}) => ({
  _id: id,
  coreOAuth2ClientConfig: { clientType: 'Public' },
  ...extra,
});
const provider = (entityId, extra = {}) => ({
  config: { entityId, ...extra },
  metadata: `<EntityDescriptor entityID="${entityId}"/>`,
});
const samlRecord = (name, idp, sp, extra = {}) => ({
  name,
  templateName: 'saml',
  templateVersion: '1.2',
  ssoEntities: {
    idpLocation: 'hosted',
    idpPrivateId: b64(idp),
    spLocation: 'remote',
    spPrivateId: b64(sp),
  },
  ...extra,
});
const existingApp = (name, id) => ({ _id: id, _rev: '9', name });

const messages = () =>
  console_.printMessage.mock.calls.map(([text]) => String(text)).join('\n');
const errors = () =>
  console_.printError.mock.calls
    .map(([error, text]) => `${text ?? ''} ${error?.message ?? error}`)
    .join('\n');
const summary = () =>
  console_.printMessage.mock.calls
    .map(([text]) => String(text))
    .filter((text) => /^\d+ of \d+ applications? failed/.test(text))
    .join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-apps-push-'));
  deployment = 'cloud';
  currentRealm = undefined;
  userLayout = 'folders';
  calls = [];
  bodies = {};
  world = {
    realms: ['/', 'alpha'],
    apps: {},
    failing: new Set(),
    listFails: new Set(),
  };
  delete process.env.APP_ZION_PORTAL_CLIENT_SECRET;
  delete process.env.APP_SVC_CLIENT_SECRET;
  delete process.env.APP_OTHER_CLIENT_SECRET;
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.APP_ZION_PORTAL_CLIENT_SECRET;
  delete process.env.APP_SVC_CLIENT_SECRET;
  delete process.env.APP_OTHER_CLIENT_SECRET;
});

// ---- the order of the steps ------------------------------------------------

describe('the order of the steps of one application', () => {
  test('a provisioning application: the connector, then its mappings, then the record', async () => {
    writeApp('alpha', 'Zion Directory', {
      record: {
        name: 'Zion Directory',
        templateName: 'azure.ad',
        connectorId: 'ZionDirectory',
        mappingNames: [
          'systemZionUser_managedAlpha_user',
          'managedAlpha_user_systemZionUser',
        ],
      },
      connector: { _id: 'provisioner.openicf/ZionDirectory', enabled: true },
      mappings: {
        systemZionUser_managedAlpha_user: {
          _id: 'mapping/systemZionUser_managedAlpha_user',
          name: 'systemZionUser_managedAlpha_user',
        },
        managedAlpha_user_systemZionUser: {
          name: 'managedAlpha_user_systemZionUser',
        },
      },
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'connector:ZionDirectory',
      'mapping:mapping/systemZionUser_managedAlpha_user',
      'mapping:sync/managedAlpha_user_systemZionUser',
      expect.stringMatching(/^app:create:/),
    ]);
    // the mappings are read from paths relative to the working directory, which the library resolves
    expect(
      shared.readMappingFromDirectory.mock.calls.map((call) => call[0])
    ).toEqual([
      'realms/alpha/applications/Zion Directory/mappings/systemZionUser_managedAlpha_user',
      'realms/alpha/applications/Zion Directory/mappings/managedAlpha_user_systemZionUser',
    ]);
    // the connector is imported as one connector without dependencies
    expect(bodies.connector.options).toEqual({ deps: false });
    expect(Object.keys(bodies.connector.data.connector)).toEqual([
      'ZionDirectory',
    ]);
    // a new-style mapping keeps its id in `mapping`; a legacy one goes to `sync` under sync/<name>
    expect(
      bodies.mappings['mapping/systemZionUser_managedAlpha_user'].data.mapping
    ).toHaveProperty('mapping/systemZionUser_managedAlpha_user');
    expect(
      bodies.mappings['sync/managedAlpha_user_systemZionUser'].data.sync
        .mappings
    ).toEqual([
      {
        _id: 'sync/managedAlpha_user_systemZionUser',
        name: 'managedAlpha_user_systemZionUser',
      },
    ]);
  });

  test('a SAML application: the scripts (libraries first), the providers, the circles of trust, the record', async () => {
    writeApp('alpha', 'Sso', {
      record: samlRecord('Sso', 'idp-entity', 'sp-entity'),
      idp: provider('idp-entity', {
        attributeMapper: { script: 'script-b' },
      }),
      sp: provider('sp-entity'),
    });
    // script-b requires the library "Zion Library" (script-a), script-c is not used
    put('realms/alpha/scripts/scripts-config/script-a.json', {
      _id: 'script-a',
      name: 'Zion Library',
      script: { file: 'scripts-content/library/zion-library.js' },
    });
    put('realms/alpha/scripts/scripts-config/script-b.json', {
      _id: 'script-b',
      name: 'Mapper',
      script: { file: 'scripts-content/mapper/mapper.js' },
    });
    put('realms/alpha/scripts/scripts-config/script-c.json', {
      _id: 'script-c',
      name: 'Unused',
      script: { file: 'scripts-content/x/unused.js' },
    });
    put(
      'realms/alpha/scripts/scripts-content/library/zion-library.js',
      '// lib'
    );
    put(
      'realms/alpha/scripts/scripts-content/mapper/mapper.js',
      "const lib = require('Zion Library');"
    );
    put('realms/alpha/scripts/scripts-content/x/unused.js', '// unused');
    put('realms/alpha/realm-config/saml/COT/zion-cot.json', {
      _id: 'zion-cot',
      trustedProviders: ['idp-entity|saml2', 'other-entity|saml2'],
    });
    put('realms/alpha/realm-config/saml/COT/other-cot.json', {
      _id: 'other-cot',
      trustedProviders: ['unrelated|saml2'],
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'script:script-a',
      'script:script-b',
      'saml:idp-entity:hosted',
      'saml:sp-entity:remote',
      'cot:zion-cot',
      'app:create:<id>',
    ]);
  });

  test('scripts that do not need each other are pushed in the order of their ids, whatever the order in the files', async () => {
    writeApp('alpha', 'Sso', {
      record: samlRecord('Sso', 'idp-entity', 'sp-entity'),
      idp: provider('idp-entity', {
        first: 'script-b',
        second: 'script-c',
        third: 'script-a',
      }),
      sp: provider('sp-entity'),
    });
    for (const id of ['script-a', 'script-b', 'script-c']) {
      put(`realms/alpha/scripts/scripts-config/${id}.json`, {
        _id: id,
        name: id,
        script: { file: `scripts-content/${id}.js` },
      });
      put(`realms/alpha/scripts/scripts-content/${id}.js`, '// text');
    }

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls.slice(0, 3)).toEqual([
      'script:script-a',
      'script:script-b',
      'script:script-c',
    ]);
  });

  test('a web application: the OAuth2 client, then the record', async () => {
    writeApp('alpha', 'Zion Portal', {
      record: webRecord('Zion Portal', 'zion-portal'),
      client: client('zion-portal', {
        userpassword: '${APP_ZION_PORTAL_CLIENT_SECRET}',
      }),
    });
    process.env.APP_ZION_PORTAL_CLIENT_SECRET = 's3cret';

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'agent:zion-portal',
      'app:create:<id>',
    ]);
    // the secret is the value of the environment variable, in the data that is imported
    expect(bodies.agent.data.agent['zion-portal'].userpassword).toBe('s3cret');
    expect(bodies.agent.global).toBe(false);
  });

  test('an application with only a record (a bookmark) needs nothing but the record', async () => {
    writeApp('alpha', 'Bookmark', {
      record: { name: 'Bookmark', templateName: 'bookmark' },
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'app:create:<id>',
    ]);
  });

  test('the location of the providers is the one the record states, hosted for the identity provider and remote for the service provider otherwise', async () => {
    writeApp('alpha', 'Sso', {
      record: {
        name: 'Sso',
        ssoEntities: {
          idpPrivateId: b64('idp-entity'),
          spPrivateId: b64('sp-entity'),
          spLocation: 'hosted',
        },
      },
      idp: provider('idp-entity'),
      sp: provider('sp-entity'),
    });

    await configManagerImportApplications(undefined, 'alpha');

    expect(bodies.providers['idp-entity'].location).toBe('hosted');
    expect(bodies.providers['sp-entity'].location).toBe('hosted');
  });
});

// ---- matched by name ------------------------------------------------------

describe('the record is matched by name', () => {
  test('an application of that name on the tenant is updated under its own id, with the configuration fields only', async () => {
    world.apps.alpha = [existingApp('Zion Portal', 'tenant-id-1')];
    writeApp('alpha', 'Zion Portal', {
      record: webRecord('Zion Portal', 'zion-portal', {
        _id: 'id-from-another-environment',
        _rev: '4',
        _provider: 'p',
        members: [{ _ref: 'managed/alpha_user/1' }],
        owners: [{ _ref: 'managed/alpha_user/2' }],
        roles: [{ _ref: 'managed/alpha_role/3' }],
        glossary: { x: 1 },
        description: 'The portal',
      }),
      client: client('zion-portal'),
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls).toEqual(['agent:zion-portal', 'app:update:tenant-id-1']);
    expect(frodo.app.createApplication).not.toHaveBeenCalled();
    expect(bodies.update).toEqual({
      _id: 'tenant-id-1',
      name: 'Zion Portal',
      templateName: 'web',
      templateVersion: '1.0',
      ssoEntities: { oidcId: 'zion-portal' },
      description: 'The portal',
    });
    expect(bodies.updateOptions).toEqual({ deps: false });
  });

  test('an application that the tenant does not have is created under a new id, again without who has access', async () => {
    world.apps.alpha = [existingApp('Another', 'tenant-id-2')];
    writeApp('alpha', 'Zion Portal', {
      record: webRecord('Zion Portal', 'zion-portal', {
        members: [{ _ref: 'managed/alpha_user/1' }],
        _id: 'id-from-another-environment',
      }),
      client: client('zion-portal'),
    });

    await configManagerImportApplications(undefined, 'alpha');

    expect(frodo.app.importApplication).not.toHaveBeenCalled();
    expect(bodies.createdId).toMatch(UUID);
    expect(bodies.createdId).not.toBe('id-from-another-environment');
    expect(bodies.create).toEqual({
      _id: bodies.createdId,
      name: 'Zion Portal',
      templateName: 'web',
      templateVersion: '1.0',
      ssoEntities: { oidcId: 'zion-portal' },
    });
  });

  test('the applications of the realm are read once, before anything is written into it', async () => {
    writeApp('alpha', 'A', { record: { name: 'A' } });
    writeApp('alpha', 'B', { record: { name: 'B' } });

    await configManagerImportApplications(undefined, 'alpha');

    expect(frodo.app.readApplications).toHaveBeenCalledTimes(1);
    expect(frodo.app.readApplications.mock.invocationCallOrder[0]).toBeLessThan(
      frodo.app.createApplication.mock.invocationCallOrder[0]
    );
  });

  test('if the applications of a realm cannot be read, nothing is pushed into it and the realm is named in the summary', async () => {
    world.listFails.add('alpha');
    writeApp('alpha', 'A', {
      record: webRecord('A', 'a'),
      client: client('a'),
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    expect(calls).toEqual([]);
    expect(summary()).toMatch(/1 of 1 application failed/);
    expect(summary()).toMatch(/realm alpha/);
  });
});

// ---- what fails an application ---------------------------------------------

describe('what fails an application, and what does not', () => {
  test('a missing environment variable fails that application, names the variable and writes nothing for it; the others are pushed', async () => {
    writeApp('alpha', 'Zion Portal', {
      record: webRecord('Zion Portal', 'zion-portal'),
      client: client('zion-portal', {
        userpassword: '${APP_ZION_PORTAL_CLIENT_SECRET}',
      }),
    });
    writeApp('alpha', 'Other', {
      record: webRecord('Other', 'other'),
      client: client('other'),
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    // the folders go in order: Other is pushed, Zion Portal needs a variable that is not set and nothing of it is written
    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'agent:other',
      'app:create:<id>',
    ]);
    expect(summary()).toMatch(/1 of 2 applications failed/);
    expect(summary()).toMatch(/alpha\/Zion Portal/);
    expect(summary()).toMatch(/APP_ZION_PORTAL_CLIENT_SECRET/);
    expect(summary()).not.toMatch(/alpha\/Other/);
  });

  test('--allow-failures keeps the exit code at 0 and still names the failed application', async () => {
    writeApp('alpha', 'Zion Portal', {
      record: webRecord('Zion Portal', 'zion-portal'),
      client: client('zion-portal', {
        userpassword: '${APP_ZION_PORTAL_CLIENT_SECRET}',
      }),
    });

    expect(
      await configManagerImportApplications(undefined, 'alpha', true)
    ).toBe(true);

    expect(calls).toEqual([]);
    expect(messages()).toMatch(/APP_ZION_PORTAL_CLIENT_SECRET/);
  });

  test('a folder that lacks a file the record names fails before anything is written, and names the file', async () => {
    writeApp('alpha', 'Sso', {
      record: samlRecord('Sso', 'idp-entity', 'sp-entity'),
      idp: provider('idp-entity'),
      // saml/sp.json is missing
    });
    writeApp('alpha', 'Zion Directory', {
      record: {
        name: 'Zion Directory',
        connectorId: 'ZionDirectory',
        mappingNames: ['m1'],
      },
      connector: { _id: 'provisioner.openicf/ZionDirectory' },
      // mappings/m1/m1.json is missing, so is the OAuth2 client of a web application below
    });
    writeApp('alpha', 'Web', { record: webRecord('Web', 'web') });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    expect(calls).toEqual([]);
    expect(summary()).toMatch(/3 of 3 applications failed/);
    expect(summary()).toMatch(/saml\/sp\.json/);
    expect(summary()).toMatch(/mappings\/m1\/m1\.json/);
    expect(summary()).toMatch(/oauth2-client\.json/);
    expect(summary()).toMatch(/incomplete/);
  });

  test('a folder without application.json fails and is named', async () => {
    put(`${APPS('alpha')}/Empty/oauth2-client.json`, client('x'));

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    expect(calls).toEqual([]);
    expect(summary()).toMatch(/alpha\/Empty/);
    expect(summary()).toMatch(/the folder has no application\.json/);
  });

  test('a record without a name fails, and nothing is written', async () => {
    put(`${APPS('alpha')}/Nameless/application.json`, {
      templateName: 'web',
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    expect(calls).toEqual([]);
    expect(summary()).toMatch(/application\.json has no name/);
  });

  test('an OAuth2 client file without an id and a provider file without an entity id fail their applications, and nothing is written', async () => {
    writeApp('alpha', 'Web', {
      record: webRecord('Web', 'web'),
      client: { coreOAuth2ClientConfig: { clientType: 'Public' } },
    });
    writeApp('alpha', 'Sso', {
      record: samlRecord('Sso', 'idp-entity', 'sp-entity'),
      idp: { config: {}, metadata: '<EntityDescriptor/>' },
      sp: provider('sp-entity'),
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    expect(calls).toEqual([]);
    expect(summary()).toMatch(/2 of 2 applications failed/);
    expect(summary()).toMatch(/oauth2-client\.json has no _id/);
    expect(summary()).toMatch(/saml\/idp\.json has no config with an entityId/);
  });

  test('an object that the record shares with other applications needs no file in the folder: only what it owns does', async () => {
    writeApp('alpha', 'Shared', {
      record: { name: 'Shared', sharedClientId: 'common-client' },
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'app:create:<id>',
    ]);
  });

  test('an object that cannot be pushed means the record is not written, and the step is named', async () => {
    world.failing.add('agent:zion-portal');
    writeApp('alpha', 'Zion Portal', {
      record: webRecord('Zion Portal', 'zion-portal'),
      client: client('zion-portal'),
    });
    writeApp('alpha', 'Other', {
      record: webRecord('Other', 'other'),
      client: client('other'),
    });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    // the folders go in order: Other is pushed whole, then the client of Zion Portal
    // fails, so the record of Zion Portal is never written
    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'agent:other',
      'app:create:<id>',
      'agent:zion-portal',
    ]);
    expect(summary()).toMatch(/1 of 2 applications failed/);
    expect(summary()).toMatch(/OAuth2 client zion-portal/);
    expect(summary()).toMatch(/the application record was not written/);
  });

  test.each([
    ['connector', 'connector:ZionDirectory', 'connector ZionDirectory'],
    ['mapping', 'mapping:sync/m1', 'mapping m1'],
  ])(
    'a failing %s stops the application before its record',
    async (_kind, failing, named) => {
      world.failing.add(failing);
      writeApp('alpha', 'Zion Directory', {
        record: {
          name: 'Zion Directory',
          connectorId: 'ZionDirectory',
          mappingNames: ['m1'],
        },
        connector: { _id: 'provisioner.openicf/ZionDirectory' },
        mappings: { m1: { name: 'm1' } },
      });

      expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
        false
      );

      expect(calls.some((c) => c.startsWith('app:'))).toBe(false);
      expect(summary()).toMatch(new RegExp(named));
    }
  );

  test('a failing script or provider or circle of trust stops the application before its record', async () => {
    for (const failing of [
      'script:script-b',
      'saml:idp-entity',
      'cot:zion-cot',
    ]) {
      calls = [];
      world.failing = new Set([failing]);
      fs.rmSync(path.join(tmp, 'realms'), { recursive: true, force: true });
      writeApp('alpha', 'Sso', {
        record: samlRecord('Sso', 'idp-entity', 'sp-entity'),
        idp: provider('idp-entity', {
          attributeMapper: { script: 'script-b' },
        }),
        sp: provider('sp-entity'),
      });
      put('realms/alpha/scripts/scripts-config/script-b.json', {
        _id: 'script-b',
        name: 'Mapper',
        script: { file: 'scripts-content/mapper.js' },
      });
      put('realms/alpha/scripts/scripts-content/mapper.js', '// m');
      put('realms/alpha/realm-config/saml/COT/zion-cot.json', {
        _id: 'zion-cot',
        trustedProviders: ['idp-entity|saml2'],
      });

      expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
        false
      );
      expect(calls.some((c) => c.startsWith('app:'))).toBe(false);
    }
  });
});

// ---- what is asked for -----------------------------------------------------

describe('what the command line asks for', () => {
  test('-n pushes only the application of that name, found by the name in its record and not by its folder name', async () => {
    writeApp('alpha', 'Zion_Portal', {
      record: webRecord('Zion Portal', 'zion-portal'),
      client: client('zion-portal'),
    });
    writeApp('alpha', 'Other', {
      record: webRecord('Other', 'other'),
      client: client('other'),
    });

    expect(await configManagerImportApplications('Zion Portal', 'alpha')).toBe(
      true
    );

    expect(calls.map((c) => c.replace(UUID, '<id>'))).toEqual([
      'agent:zion-portal',
      'app:create:<id>',
    ]);
  });

  test('-n with a name that has no folder fails whatever --allow-failures says', async () => {
    writeApp('alpha', 'Other', { record: webRecord('Other', 'other') });

    for (const allowFailures of [false, true]) {
      expect(
        await configManagerImportApplications('Missing', 'alpha', allowFailures)
      ).toBe(false);
    }

    expect(calls).toEqual([]);
    expect(messages()).toMatch(
      /Application 'Missing' has no folder in realm alpha/
    );
  });

  test('-n needs a single realm', async () => {
    writeApp('alpha', 'A', { record: { name: 'A' } });
    writeApp('bravo', 'A', { record: { name: 'A' } });

    expect(await configManagerImportApplications('A')).toBe(false);

    expect(calls).toEqual([]);
    expect(messages()).toMatch(/specify a single realm/);
  });

  test('without a realm every realm folder that has applications is pushed, in order, and the root realm of a Cloud tenant is skipped with a warning', async () => {
    writeApp('root', 'R', { record: { name: 'R' } });
    writeApp('bravo', 'B', { record: { name: 'B' } });
    writeApp('alpha', 'A', { record: { name: 'A' } });
    put('realms/charlie/realm-config/x.json', {}); // no applications folder

    expect(await configManagerImportApplications()).toBe(true);

    expect(calls).toHaveLength(2);
    expect(frodo.app.readApplications).toHaveBeenCalledTimes(2);
    expect(messages()).toMatch(
      /root realm of a Cloud tenant has no applications/
    );
    expect(currentRealm).toBe('bravo');
  });

  test('the root realm of a ForgeOps tenant is pushed', async () => {
    deployment = 'forgeops';
    writeApp('root', 'R', { record: { name: 'R' } });

    expect(await configManagerImportApplications()).toBe(true);

    expect(calls).toHaveLength(1);
  });

  test('the realm "/" is read from the folder root', async () => {
    deployment = 'forgeops';
    writeApp('root', 'R', { record: { name: 'R' } });

    expect(await configManagerImportApplications(undefined, '/')).toBe(true);

    expect(calls).toHaveLength(1);
    expect(currentRealm).toBe('/');
  });

  test('nothing to push is not a failure: no realms folder, no applications folder in a named realm', async () => {
    expect(await configManagerImportApplications()).toBe(true);
    expect(messages()).toMatch(/No applications found to push/);

    put('realms/alpha/realm-config/x.json', {});
    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );
    expect(calls).toEqual([]);
  });

  test('a push needs no marker and creates none', async () => {
    writeApp('alpha', 'A', { record: { name: 'A' } });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      true
    );

    expect(fs.existsSync(path.join(tmp, 'frodo-config-manager.json'))).toBe(
      false
    );
    // the per-user setting is not even looked at
    expect(userLayout).toBe('folders');
  });

  test('one summary for several failures, in one run', async () => {
    writeApp('alpha', 'A', { record: webRecord('A', 'a') }); // no client file
    writeApp('alpha', 'B', { record: webRecord('B', 'b') }); // no client file
    writeApp('alpha', 'C', { record: { name: 'C' } });

    expect(await configManagerImportApplications(undefined, 'alpha')).toBe(
      false
    );

    const lines = console_.printMessage.mock.calls
      .map(([text]) => String(text))
      .filter((text) => /applications? failed/.test(text));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/2 of 3 applications failed/);
  });
});
