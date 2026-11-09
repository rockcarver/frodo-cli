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
 * `frodo config-manager pull applications` (decision record 0042, slice S2 of
 * frodo-cli#1101): one folder per application with the record and the objects it
 * owns, the shared pieces at the paths of their own kinds, one summary of the
 * applications that failed (record 0040), a named application that cannot be read
 * fails whatever `--allow-failures` says (record 0041), and the layout of the tree
 * is decided by its marker, never switched by a pull.
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
      },
      realm: {
        readRealms: async () => world.realms.map((name) => ({ name })),
      },
      app: {
        readApplications: jest.fn(async () => {
          if (world.listFails?.has(currentRealm)) {
            throw new Error(`cannot list ${currentRealm}`);
          }
          return world.apps[currentRealm] ?? [];
        }),
        readApplicationByName: jest.fn(async (name) => {
          const found = (world.apps[currentRealm] ?? []).find(
            (a) => a.name === name
          );
          if (!found) throw new Error(`application ${name} not found`);
          return found;
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
          if (world.failing.has(`agent:${id}`)) {
            throw new Error(`cannot read client ${id}`);
          }
          return structuredClone(world.agents[id]);
        }),
      },
      idm: {
        connector: {
          readConnector: jest.fn(async (id) => {
            if (world.failing.has(`connector:${id}`)) {
              throw new Error(`cannot read connector ${id}`);
            }
            return structuredClone(world.connectors[id]);
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

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => userLayout,
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
}));
jest.unstable_mockModule(src('configManagerOps/FrConfigScriptOps'), () => ({
  exportScriptToFiles: shared.exportScriptToFiles,
}));
jest.unstable_mockModule(
  src('configManagerOps/FrConfigConnectorMappingOps'),
  () => ({ exportMappingToDirectory: shared.exportMappingToDirectory })
);

const { configManagerExportApplications, clientSecretVariable } = await import(
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
const refs = (application, references, problems = []) => {
  world.references[application._id] = {
    applicationId: application._id,
    applicationName: application.name,
    references,
    problems,
  };
};
const read = (rel) => JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(tmp, rel));
const messages = () =>
  console_.printMessage.mock.calls.map(([text]) => String(text)).join('\n');
const summary = () =>
  console_.printMessage.mock.calls
    .map(([text]) => String(text))
    .filter((text) => /^\d+ of \d+ applications? failed/.test(text))
    .join('\n');
const APPS = (realm) => `realms/${realm}/applications`;

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-apps-pull-'));
  deployment = 'cloud';
  currentRealm = undefined;
  userLayout = 'folders';
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
  };
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- the application types -------------------------------------------------

describe('one folder per application', () => {
  test('a web application: the record without runtime data, and the OAuth2 client with the secret as a placeholder', async () => {
    const portal = app('Zion Portal', {
      members: [{ _ref: 'managed/alpha_user/1' }],
      owners: [{ _ref: 'managed/alpha_user/2' }],
      roles: [],
      glossary: { x: 1 },
      _provider: 'p',
      description: 'The portal',
    });
    world.apps.alpha = [portal];
    refs(portal, [owned('oauth2Client', 'zion-portal', 'ssoEntities.oidcId')]);
    world.agents['zion-portal'] = {
      _id: 'zion-portal',
      userpassword: null,
      coreOAuth2ClientConfig: { clientType: { value: 'Confidential' } },
      note: 'cost is ${price}',
    };

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      true
    );

    const record = read(`${APPS('alpha')}/Zion Portal/application.json`);
    expect(record).toEqual({
      name: 'Zion Portal',
      templateName: 'web',
      templateVersion: '1.0',
      description: 'The portal',
    });
    const client = read(`${APPS('alpha')}/Zion Portal/oauth2-client.json`);
    expect(client.userpassword).toBe('${APP_ZION_PORTAL_CLIENT_SECRET}');
    // a literal ${ in the content is escaped, the placeholder is not
    expect(client.note).toBe('cost is \\${price}');
    expect(
      fs.readdirSync(path.join(tmp, APPS('alpha'), 'Zion Portal')).sort()
    ).toEqual(['application.json', 'oauth2-client.json']);
  });

  test('a public client gets no secret placeholder', async () => {
    const native = app('Native', { templateName: 'native' });
    world.apps.alpha = [native];
    refs(native, [owned('oauth2Client', 'native-client')]);
    world.agents['native-client'] = {
      _id: 'native-client',
      coreOAuth2ClientConfig: { clientType: 'Public' },
    };

    await configManagerExportApplications(undefined, 'alpha');

    const client = read(`${APPS('alpha')}/Native/oauth2-client.json`);
    expect(client).not.toHaveProperty('userpassword');
  });

  test('a confidential client whose type is a plain string also gets the placeholder', async () => {
    const service = app('Svc', { templateName: 'service' });
    world.apps.alpha = [service];
    refs(service, [owned('oauth2Client', 'svc')]);
    world.agents.svc = {
      _id: 'svc',
      coreOAuth2ClientConfig: { clientType: 'Confidential' },
    };

    await configManagerExportApplications(undefined, 'alpha');

    expect(read(`${APPS('alpha')}/Svc/oauth2-client.json`).userpassword).toBe(
      '${APP_SVC_CLIENT_SECRET}'
    );
  });

  test('a SAML application with an identity provider and a service provider', async () => {
    const sso = app('Sso', { templateName: 'saml' });
    world.apps.alpha = [sso];
    refs(sso, [
      owned('saml2Provider', 'idp-entity', 'ssoEntities.idpPrivateId'),
      owned('saml2Provider', 'sp-entity', 'ssoEntities.spPrivateId'),
      sharedRef('circleOfTrust', 'cot1'),
    ]);
    world.providers['idp-entity'] = {
      location: 'hosted',
      config: { entityId: 'idp-entity' },
      metadata: '<idp/>',
    };
    world.providers['sp-entity'] = {
      location: 'remote',
      config: { entityId: 'sp-entity' },
      metadata: '<sp/>',
    };

    await configManagerExportApplications(undefined, 'alpha');

    expect(read(`${APPS('alpha')}/Sso/saml/idp.json`)).toEqual({
      config: { entityId: 'idp-entity' },
      metadata: '<idp/>',
    });
    expect(read(`${APPS('alpha')}/Sso/saml/sp.json`)).toEqual({
      config: { entityId: 'sp-entity' },
      metadata: '<sp/>',
    });
    // the circle of trust is shared: it goes where `pull saml` puts it
    expect(exists('realms/alpha/realm-config/saml/COT/cot1.json')).toBe(true);
    expect(exists(`${APPS('alpha')}/Sso/cot1.json`)).toBe(false);
  });

  test('a SAML application with only an identity provider writes only that file', async () => {
    const sso = app('IdpOnly', { templateName: 'saml' });
    world.apps.alpha = [sso];
    refs(sso, [owned('saml2Provider', 'only', 'ssoEntities.idpPrivateId')]);
    world.providers.only = {
      location: 'hosted',
      config: { entityId: 'only' },
      metadata: '<m/>',
    };

    await configManagerExportApplications(undefined, 'alpha');

    expect(exists(`${APPS('alpha')}/IdpOnly/saml/idp.json`)).toBe(true);
    expect(exists(`${APPS('alpha')}/IdpOnly/saml/sp.json`)).toBe(false);
  });

  test('a provisioning application: connector, mappings and the scripts it shares', async () => {
    const entra = app('Entra', {
      templateName: 'azure.ad',
      connectorId: 'Entra',
      mappingNames: ['legacy', 'modern'],
    });
    world.apps.alpha = [entra];
    refs(entra, [
      owned('connector', 'Entra', 'connectorId'),
      owned('mapping', 'legacy', 'mappingNames'),
      owned('mapping', 'modern', 'mappingNames'),
      sharedRef('script', 's-1', { name: 'Transform' }),
      sharedRef('script', 's-default', { name: 'Default', isDefault: true }),
    ]);
    world.connectors.Entra = {
      _id: 'provisioner.openicf/Entra',
      enabled: true,
    };
    world.mappings = [
      { _id: 'sync/legacy', name: 'legacy', _rev: 'x' },
      { _id: 'mapping/modern', name: 'modern' },
      { _id: 'mapping/other', name: 'other' },
    ];
    world.scripts['s-1'] = {
      _id: 's-1',
      name: 'Transform',
      language: 'JAVASCRIPT',
    };

    await configManagerExportApplications(undefined, 'alpha');

    expect(read(`${APPS('alpha')}/Entra/connector.json`)).toEqual({
      _id: 'provisioner.openicf/Entra',
      enabled: true,
    });
    // a legacy mapping has no id of its own in its file; a new-style one keeps it
    expect(read(`${APPS('alpha')}/Entra/mappings/legacy/legacy.json`)).toEqual({
      name: 'legacy',
    });
    expect(read(`${APPS('alpha')}/Entra/mappings/modern/modern.json`)).toEqual({
      _id: 'mapping/modern',
      name: 'modern',
    });
    // only the mappings the application names
    expect(exists(`${APPS('alpha')}/Entra/mappings/other`)).toBe(false);
    // shared scripts at their own kind path, never the default ones
    expect(exists('realms/alpha/scripts/scripts-config/s-1.json')).toBe(true);
    expect(frodo.script.readScript).toHaveBeenCalledTimes(1);
    expect(frodo.script.readScript).toHaveBeenCalledWith('s-1');
  });

  test('a bookmark application is only its record', async () => {
    const bookmark = app('Bookmark', { templateName: 'bookmark' });
    world.apps.alpha = [bookmark];
    refs(bookmark, []);

    await configManagerExportApplications(undefined, 'alpha');

    expect(fs.readdirSync(path.join(tmp, APPS('alpha'), 'Bookmark'))).toEqual([
      'application.json',
    ]);
  });

  test('a script of another language is a warning, as in `pull scripts`, not a failure', async () => {
    const odd = app('Odd');
    world.apps.alpha = [odd];
    refs(odd, [sharedRef('script', 'g-1', { name: 'Groovy' })]);
    world.scripts['g-1'] = { _id: 'g-1', name: 'Groovy', language: 'GROOVY' };

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      true
    );
    expect(exists('realms/alpha/scripts/scripts-config/g-1.json')).toBe(false);
    expect(messages()).toMatch(/not a JavaScript script/);
  });

  test('glossary schemas, request forms and request types are not pulled, and their problems are not failures', async () => {
    const iga = app('Iga');
    world.apps.alpha = [iga];
    refs(
      iga,
      [sharedRef('glossarySchema', 'g'), sharedRef('requestForm', 'f')],
      [
        { kind: 'glossarySchema', reason: 'missing' },
        { kind: 'requestType', reason: 'unreadable' },
      ]
    );

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      true
    );
    expect(fs.readdirSync(path.join(tmp, APPS('alpha'), 'Iga'))).toEqual([
      'application.json',
    ]);
  });
});

// ---- which applications -----------------------------------------------------

describe('which applications and realms', () => {
  test('no realm: every realm, and the root realm of a Cloud tenant is skipped', async () => {
    world.apps['/'] = [app('RootApp')];
    world.apps.alpha = [app('AlphaApp')];

    expect(await configManagerExportApplications()).toBe(true);

    expect(exists(`${APPS('alpha')}/AlphaApp/application.json`)).toBe(true);
    expect(exists(`${APPS('root')}/RootApp/application.json`)).toBe(false);
  });

  test('no realm on ForgeOps: the root realm is pulled too, into realms/root', async () => {
    deployment = 'forgeops';
    world.apps['/'] = [app('RootApp')];

    await configManagerExportApplications();

    expect(exists(`${APPS('root')}/RootApp/application.json`)).toBe(true);
  });

  test('a realm of its own: only that realm is read', async () => {
    world.apps.alpha = [app('AlphaApp')];

    await configManagerExportApplications(undefined, 'alpha');

    expect(frodo.app.readApplications).toHaveBeenCalledTimes(1);
  });

  test('a named application of a realm is pulled alone', async () => {
    world.apps.alpha = [app('One'), app('Two')];

    expect(await configManagerExportApplications('Two', 'alpha')).toBe(true);

    expect(exists(`${APPS('alpha')}/Two/application.json`)).toBe(true);
    expect(exists(`${APPS('alpha')}/One`)).toBe(false);
  });

  test('a named application without a single realm is refused before anything is read', async () => {
    expect(await configManagerExportApplications('Two')).toBe(false);

    expect(messages()).toMatch(/specify a single realm/);
    expect(frodo.app.readApplicationByName).not.toHaveBeenCalled();
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  test('a named application that does not exist fails the command whatever --allow-failures says', async () => {
    world.apps.alpha = [app('One')];

    expect(
      await configManagerExportApplications('Missing', 'alpha', false, true)
    ).toBe(false);
    expect(console_.printError).toHaveBeenCalled();
  });

  test('a tenant without applications says so, and the step of pull all stays quiet', async () => {
    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      true
    );
    expect(messages()).toMatch(/No applications found/);

    console_.printMessage.mockClear();
    expect(
      await configManagerExportApplications(undefined, 'alpha', true)
    ).toBe(true);
    expect(messages()).not.toMatch(/No applications found/);
    // nothing to write: the new tree stays new
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  test('a realm whose applications cannot be read is one failed operation and the others are still pulled', async () => {
    world.realms = ['alpha', 'bravo'];
    world.listFails.add('alpha');
    world.apps.bravo = [app('BravoApp')];

    expect(await configManagerExportApplications()).toBe(false);

    expect(exists(`${APPS('bravo')}/BravoApp/application.json`)).toBe(true);
    expect(summary()).toMatch(/1 of 2 applications failed/);
    expect(summary()).toMatch(/realm alpha/);
  });
});

// ---- failures --------------------------------------------------------------

describe('failures name the application and do not stop the others', () => {
  test('one summary, exit false; --allow-failures keeps the exit true and says so', async () => {
    const good = app('Good');
    const bad = app('Bad');
    world.apps.alpha = [good, bad];
    refs(good, []);
    refs(bad, [owned('oauth2Client', 'bad-client')]);
    world.failing.add('agent:bad-client');

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );
    expect(exists(`${APPS('alpha')}/Good/application.json`)).toBe(true);
    // the failed application is pulled as far as it goes
    expect(exists(`${APPS('alpha')}/Bad/application.json`)).toBe(true);
    expect(summary()).toMatch(/1 of 2 applications failed/);
    expect(summary()).toMatch(/alpha\/Bad/);
    expect(summary()).toMatch(/OAuth2 client bad-client/);

    console_.printMessage.mockClear();
    expect(
      await configManagerExportApplications(undefined, 'alpha', false, true)
    ).toBe(true);
    expect(messages()).toMatch(/The exit code stays 0/);
  });

  test('a dangling reference is named, and the rest of the application is still written', async () => {
    const dangling = app('Dangling', { templateName: 'saml' });
    world.apps.alpha = [dangling];
    refs(
      dangling,
      [owned('connector', 'Gone')],
      [
        {
          kind: 'connector',
          reference: owned('connector', 'Gone'),
          reason: 'missing',
        },
      ]
    );
    world.failing.add('connector:Gone');

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );
    expect(exists(`${APPS('alpha')}/Dangling/application.json`)).toBe(true);
    expect(summary()).toMatch(/connector Gone is missing/);
  });

  test('a mapping that the application names but the tenant does not have is a failure of that application', async () => {
    const lost = app('Lost', { mappingNames: ['ghost'] });
    world.apps.alpha = [lost];
    refs(lost, [owned('mapping', 'ghost')]);

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );
    expect(summary()).toMatch(
      /mapping ghost: the mapping ghost does not exist/
    );
  });

  test('two names that become one folder: the first is pulled, the second fails naming both', async () => {
    world.apps.alpha = [app('a/b'), app('a_b')];

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );

    expect(summary()).toMatch(/1 of 2 applications failed/);
    expect(summary()).toMatch(/collides with the application/);
    expect(fs.readdirSync(path.join(tmp, APPS('alpha'))).length).toBe(1);
  });

  test('names that differ only in case share a folder on some file systems: a collision too', async () => {
    world.apps.alpha = [app('Portal'), app('portal')];

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );
    expect(summary()).toMatch(/collides with the application/);
  });
});

// ---- the layout of the tree ---------------------------------------------------

describe('the layout of the tree decides', () => {
  const markerFile = () => path.join(tmp, 'frodo-config-manager.json');

  test('a new tree gets the marker, with the layout of the per-user setting, before the first file', async () => {
    world.apps.alpha = [app('One')];

    await configManagerExportApplications(undefined, 'alpha');

    expect(JSON.parse(fs.readFileSync(markerFile(), 'utf8'))).toEqual({
      applications: 'folders',
      formatVersion: 1,
    });
  });

  test('a new tree with the per-user layout kind-paths gets no marker and no applications: refused, or skipped with a warning in pull all', async () => {
    userLayout = 'kind-paths';
    world.apps.alpha = [app('One')];

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );
    expect(messages()).toMatch(/frodo settings config-manager-layout/);
    expect(fs.readdirSync(tmp)).toEqual([]);

    console_.printMessage.mockClear();
    expect(
      await configManagerExportApplications(undefined, 'alpha', true)
    ).toBe(true);
    expect(console_.printMessage).toHaveBeenCalledWith(
      expect.stringMatching(/not pulled/),
      'warn'
    );
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  test.each([
    ['sync/connectors'],
    ['sync/mappings'],
    ['realms/alpha/realm-config/agents'],
    ['realms/alpha/realm-config/saml'],
  ])(
    'a tree that holds %s without a marker keeps the kind-path layout: pull applications refuses and names the migration, the pull all step skips with a warning',
    async (existing) => {
      fs.mkdirSync(path.join(tmp, existing), { recursive: true });
      world.apps.alpha = [app('One')];

      expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
        false
      );
      expect(messages()).toMatch(/config-manager migrate applications/);
      expect(exists('frodo-config-manager.json')).toBe(false);
      expect(exists(`${APPS('alpha')}`)).toBe(false);

      console_.printMessage.mockClear();
      expect(
        await configManagerExportApplications(undefined, 'alpha', true)
      ).toBe(true);
      expect(console_.printMessage).toHaveBeenCalledWith(
        expect.stringMatching(/not pulled/),
        'warn'
      );
      // a pull never switches a tree
      expect(exists('frodo-config-manager.json')).toBe(false);
    }
  );

  test('a marked tree keeps its marker and its layout, whatever the per-user setting is', async () => {
    userLayout = 'kind-paths';
    fs.writeFileSync(
      markerFile(),
      JSON.stringify({ applications: 'folders', formatVersion: 1 })
    );
    const before = fs.statSync(markerFile()).mtimeMs;
    world.apps.alpha = [app('One')];

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      true
    );
    expect(exists(`${APPS('alpha')}/One/application.json`)).toBe(true);
    expect(fs.statSync(markerFile()).mtimeMs).toBe(before);
  });

  test('a marker that says kind-paths is a tree that keeps the kind-path layout', async () => {
    fs.writeFileSync(
      markerFile(),
      JSON.stringify({ applications: 'kind-paths', formatVersion: 1 })
    );
    world.apps.alpha = [app('One')];

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );
    expect(exists(`${APPS('alpha')}`)).toBe(false);
  });

  test('the decision made before the first step of pull all is used, not a new look at the tree: steps that ran before have filled it', async () => {
    world.apps.alpha = [app('One')];
    // the standalone steps of pull all have written at their kind paths by now
    fs.mkdirSync(path.join(tmp, 'sync/connectors'), { recursive: true });

    expect(
      await configManagerExportApplications(undefined, 'alpha', true, false, {
        tree: 'new',
        layout: 'folders',
        createMarker: true,
      })
    ).toBe(true);

    expect(exists(`${APPS('alpha')}/One/application.json`)).toBe(true);
    expect(JSON.parse(fs.readFileSync(markerFile(), 'utf8')).applications).toBe(
      'folders'
    );
  });

  test('a decision that says legacy is respected, whatever the tree looks like now', async () => {
    world.apps.alpha = [app('One')];

    expect(
      await configManagerExportApplications(undefined, 'alpha', true, false, {
        tree: 'legacy',
        layout: 'kind-paths',
        createMarker: false,
      })
    ).toBe(true);

    expect(exists(`${APPS('alpha')}`)).toBe(false);
    expect(exists('frodo-config-manager.json')).toBe(false);
    expect(console_.printMessage).toHaveBeenCalledWith(
      expect.stringMatching(/not pulled/),
      'warn'
    );
  });

  test('a marker that cannot be read fails the command, nothing is written', async () => {
    fs.writeFileSync(markerFile(), '{ not json');
    world.apps.alpha = [app('One')];

    expect(await configManagerExportApplications(undefined, 'alpha')).toBe(
      false
    );
    expect(console_.printError).toHaveBeenCalled();
    expect(exists(`${APPS('alpha')}`)).toBe(false);
  });
});

// ---- helpers and wiring ----------------------------------------------------------

describe('the name of the secret variable', () => {
  test.each([
    ['Zion Portal', 'APP_ZION_PORTAL_CLIENT_SECRET'],
    ['my-app.v2', 'APP_MY_APP_V2_CLIENT_SECRET'],
    ['  Edge  Case!! ', 'APP_EDGE_CASE_CLIENT_SECRET'],
    ['Already_Snake', 'APP_ALREADY_SNAKE_CLIENT_SECRET'],
  ])('%s -> %s', (name, variable) => {
    expect(clientSecretVariable(name)).toBe(variable);
  });
});

describe('the step of pull all', () => {
  const source = fs.readFileSync(
    src('configManagerOps/FrConfigAllOps.ts'),
    'utf8'
  );
  const upToStatic = source.slice(
    0,
    source.indexOf('export const deploymentMapAllStatic')
  );
  const fromStatic = source.slice(
    source.indexOf('export const deploymentMapAllStatic'),
    source.indexOf('export interface ConfigManagerAllOptions')
  );
  const maps = {};
  for (const match of upToStatic.matchAll(
    /\[(\w+)_DEPLOYMENT_TYPE_KEY\]: \[([\s\S]*?)\n {2}\],/g
  )) {
    maps[match[1]] = [...match[2].matchAll(/step\(\s*'([\w-]+)'/g)].map(
      (m) => m[1]
    );
  }

  test('is the last step of the Cloud and of the ForgeOps map, and not a step of Classic', () => {
    expect(Object.keys(maps).sort()).toEqual(['CLASSIC', 'CLOUD', 'FORGEOPS']);
    expect(maps.CLASSIC).not.toContain('applications');
    for (const key of ['CLOUD', 'FORGEOPS']) {
      expect(maps[key].at(-1)).toBe('applications');
      expect(maps[key].filter((n) => n === 'applications')).toHaveLength(1);
    }
  });

  test('is quiet, does not pass the realm filter away and gets the decision made before the first step, on both maps', () => {
    const calls = upToStatic.match(
      /configManagerExportApplications\(\s*undefined,\s*options\.realm,\s*true,\s*false,\s*options\.applicationLayout\s*\)/g
    );
    expect(calls).toHaveLength(2);
  });

  test('the runner decides the layout of the tree once, before it runs the first step', () => {
    const runner = source.slice(source.indexOf('async function runSteps'));
    const decided = runner.indexOf('withApplicationLayout(steps, options)');
    const firstStep = runner.indexOf('for (const { name, run: stepRun }');
    expect(decided).toBeGreaterThan(0);
    expect(decided).toBeLessThan(firstStep);
    expect(runner).toMatch(
      /applicationLayout: decideApplicationLayout\(getWorkingDirectory\(\)\)/
    );
    // only for a map that has the step
    expect(runner).toMatch(
      /steps\.some\(\(s\) => s\.name === 'applications'\)/
    );
  });

  test('is not a step of pull all-static', () => {
    expect(fromStatic).not.toMatch(/'applications'/);
  });
});
