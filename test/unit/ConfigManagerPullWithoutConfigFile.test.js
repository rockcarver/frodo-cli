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
 * `config-manager pull saml`, `pull authz-policies` and `pull oauth2-agents` without a config
 * file: the missing file becomes the content that a file would have if it listed everything.
 * For each realm that is visited (the realm that was given, or every realm of the tenant) the
 * ids come from the list functions of the library, and then the same code as with a file reads
 * and writes each object. What this file checks:
 *
 * - the no-file pull writes the same files, byte for byte, as a file that lists everything;
 * - the realm that was given narrows it, and with a file the realm is not used;
 * - the root realm of an Identity Cloud tenant is left out by saml and agents, and visited by
 *   authz;
 * - an id that is not one name that a file can have (empty, `.`, `..`, or with `/`, `\` or a
 *   control character) is skipped with a warning that names the id and the realm, which is not a
 *   failed operation; so is a realm whose name is not a name or a path of names;
 * - a realm whose lists cannot be read is one failed operation, and the others are pulled;
 * - what the unchanged code does per object still applies: the agent types that have a command of
 *   their own are not listed, key sets with private keys are replaced, objects that an
 *   application owns are skipped in a tree that uses the application layout.
 *
 * Technique as in StandalonePullSkipsOwned.test.js: the library is a set of fakes, the modules
 * under test, OperationRun and the path helper are real, and the files are real, in a temporary
 * folder. No tenant is contacted and nothing touches the real home.
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

/** The list calls of the library, in the order they were made, with the realm they were made in. */
let listCalls;
const listing = (name) => {
  listCalls.push(`${name}@${currentRealm}`);
  if (world.unreadable.has(currentRealm)) {
    throw new Error(`cannot read the lists of realm ${currentRealm}`);
  }
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
      realm: {
        readRealms: async () => world.realms.map((name) => ({ name })),
      },
      app: {
        readApplicationOwnership: jest.fn(async () => ({
          entries: world.ownership[currentRealm] ?? [],
        })),
        getApplicationOwners: (index, kind, id) =>
          (
            index.entries.find((e) => e.kind === kind && e.id === id)?.owners ??
            []
          ).map((owner) => ({ ...owner })),
      },
      agent: {
        readAgents: jest.fn(async () => {
          listing('agents');
          return structuredClone(world.agents[currentRealm] ?? []);
        }),
        readAgentByTypeAndId: jest.fn(async (type, id) => {
          const own = world.agentFiles[`${type}/${id}`];
          return structuredClone(own ?? { _id: id, type });
        }),
        importAgent: jest.fn(),
      },
      oauth2oidc: {
        client: {
          readOAuth2Clients: jest.fn(async () => {
            listing('clients');
            return (world.clients[currentRealm] ?? []).map((_id) => ({ _id }));
          }),
        },
      },
      saml2: {
        entityProvider: {
          readSaml2ProviderStubs: jest.fn(async () => {
            listing('providers');
            return (world.providers[currentRealm] ?? []).map((entityId) => ({
              _id: entityId,
              entityId,
            }));
          }),
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
          readCirclesOfTrust: jest.fn(async () => {
            listing('circles');
            return (world.circles[currentRealm] ?? []).map((_id) => ({ _id }));
          }),
          exportCircleOfTrust: jest.fn(async (cotId) => ({
            saml: { cot: { [cotId]: { _id: cotId } } },
          })),
          importCirclesOfTrust: jest.fn(),
        },
      },
      authz: {
        policySet: {
          readPolicySets: jest.fn(async () => {
            listing('policySets');
            return (world.policySets[currentRealm] ?? []).map((name) => ({
              name,
            }));
          }),
          readPolicySet: jest.fn(async (name) => ({
            name,
            resourceTypeUuids: ['rt-1'],
          })),
          importPolicySets: jest.fn(),
        },
        policy: {
          readPoliciesByPolicySet: jest.fn(async (setName) =>
            (world.policies[`${currentRealm}/${setName}`] ?? []).map(
              (name) => ({
                _id: name,
                name,
                applicationName: setName,
                resourceTypeUuid: 'rt-1',
              })
            )
          ),
          importPolicies: jest.fn(),
        },
        resourceType: {
          readResourceType: jest.fn(async (uuid) => ({
            uuid,
            name: `type-${uuid}`,
          })),
          importResourceTypes: jest.fn(),
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

const { configManagerExportSaml } = await import(
  src('configManagerOps/FrConfigSamlOps.ts')
);
const { configManagerExportAuthzPolicySets } = await import(
  src('configManagerOps/FrConfigAuthzPoliciesOps.ts')
);
const { configManagerExportOAuth2Agents } = await import(
  src('configManagerOps/FrConfigOauth2AgentOps.ts')
);
const { frodo } = await import('@rockcarver/frodo-lib');

// what a case that changes one of these puts back before the next case
const readAgentByTypeAndId =
  frodo.agent.readAgentByTypeAndId.getMockImplementation();
const readPolicySet =
  frodo.authz.policySet.readPolicySet.getMockImplementation();

// ---- helpers --------------------------------------------------------------

/** Every file below the working directory: relative path to content, in the order of the paths. */
function tree() {
  const files = {};
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(tmp, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(tmp);
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
  );
}
const paths = () => Object.keys(tree());
const wipe = () => {
  for (const entry of fs.readdirSync(tmp)) {
    fs.rmSync(path.join(tmp, entry), { recursive: true, force: true });
  }
};
const warnings = () =>
  console_.printMessage.mock.calls
    .filter(([, level]) => level === 'warn')
    .map(([text]) => String(text));
const errorMessages = () =>
  console_.printMessage.mock.calls
    .filter(([, level]) => level === 'error')
    .map(([text]) => String(text));
const printedErrors = () =>
  console_.printError.mock.calls.map(
    ([error, text]) => `${text ?? ''} ${error?.message ?? error}`
  );
/** What the run says when it ends with failures: one summary that names the failed operations. */
const summaries = () =>
  console_.printMessage.mock.calls
    .map(([text]) => String(text))
    .filter((text) => /failed:/.test(text));
const writeConfig = (name, content) => {
  const file = path.join(tmp, '..', `${path.basename(tmp)}-input`, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
};
const SAML_URL = 'https://sp.example.com/metadata?id=1';

beforeEach(() => {
  jest.clearAllMocks();
  frodo.agent.readAgentByTypeAndId.mockImplementation(readAgentByTypeAndId);
  frodo.authz.policySet.readPolicySet.mockImplementation(readPolicySet);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-no-file-'));
  deployment = 'forgeops';
  currentRealm = '/';
  listCalls = [];
  world = {
    realms: ['/', 'alpha', 'bravo'],
    unreadable: new Set(),
    ownership: {},
    providers: {
      '/': ['urn:root:sp'],
      alpha: ['urn:zion:idp', SAML_URL],
      bravo: ['urn:bravo:sp'],
    },
    circles: {
      '/': ['rootcot'],
      alpha: ['zion-cot', 'affiliation'],
      bravo: [],
    },
    policySets: {
      '/': ['oauth2Scopes'],
      alpha: ['oauth2Scopes', 'zion-policies'],
      bravo: ['bravo-set'],
    },
    policies: {
      '//oauth2Scopes': ['root-scope-policy'],
      'alpha/oauth2Scopes': ['scope-policy'],
      'alpha/zion-policies': ['allow-zion', 'deny-matrix'],
      'bravo/bravo-set': ['bravo-policy'],
    },
    agents: {
      '/': [{ _id: 'root-agent', _type: { _id: 'WebAgent' } }],
      alpha: [
        { _id: 'zion-web', _type: { _id: 'WebAgent' } },
        { _id: 'zion-ig', _type: { _id: 'IdentityGatewayAgent' } },
        { _id: 'zion-issuer', _type: { _id: 'TrustedJwtIssuer' } },
        { _id: 'zion-profile', _type: { _id: 'CIMDProfile' } },
        { _id: 'zion-publisher', _type: { _id: 'SoftwarePublisher' } },
      ],
      bravo: [{ _id: 'bravo-web', _type: { _id: 'WebAgent' } }],
    },
    clients: { '/': ['root-client'], alpha: ['zion-client'], bravo: [] },
    agentFiles: {},
  };
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(`${tmp}-input`, { recursive: true, force: true });
});

// ---- the content of a file that lists everything ---------------------------

/** The saml.json that lists what the world of `forgeops` holds, for the given realms. */
const samlFileOf = (...realms) =>
  Object.fromEntries(
    realms.map((realm) => [
      realm,
      {
        samlProviders: [...world.providers[realm]]
          .sort()
          .map((entityId) => ({ entityId })),
        circlesOfTrust: [...world.circles[realm]].sort(),
      },
    ])
  );
const authzFileOf = (...realms) =>
  Object.fromEntries(
    realms.map((realm) => [realm, [...world.policySets[realm]].sort()])
  );
const agentsFileOf = (...realms) =>
  Object.fromEntries(
    realms.map((realm) => {
      const byType = {};
      for (const agent of world.agents[realm]) {
        if (
          ['TrustedJwtIssuer', 'CIMDProfile', 'SoftwarePublisher'].includes(
            agent._type._id
          )
        )
          continue;
        (byType[agent._type._id] ??= []).push({ id: agent._id });
      }
      for (const id of world.clients[realm]) {
        (byType.OAuth2Client ??= []).push({ id });
      }
      return [realm, byType];
    })
  );

// ---- saml ------------------------------------------------------------------

describe('pull saml without a config file', () => {
  test('pulls every provider and every circle of trust of every realm, and the files are the same as a file that lists them', async () => {
    expect(await configManagerExportSaml(null)).toBe(true);
    const pulled = tree();
    expect(Object.keys(pulled)).toEqual([
      'realms/alpha/realm-config/saml/COT/affiliation.json',
      'realms/alpha/realm-config/saml/COT/zion-cot.json',
      'realms/alpha/realm-config/saml/remote/https___sp.example.com_metadata_id=1.json',
      'realms/alpha/realm-config/saml/remote/urn_zion_idp.json',
      'realms/bravo/realm-config/saml/remote/urn_bravo_sp.json',
      'realms/root/realm-config/saml/COT/rootcot.json',
      'realms/root/realm-config/saml/remote/urn_root_sp.json',
    ]);

    wipe();
    const file = writeConfig('saml.json', samlFileOf('/', 'alpha', 'bravo'));
    expect(await configManagerExportSaml(file)).toBe(true);

    expect(tree()).toEqual(pulled);
    expect(printedErrors()).toEqual([]);
  });

  test('keeps the entity id that is a URL: the file name is made from it as with a file', async () => {
    await configManagerExportSaml(null, false, undefined, 'alpha');

    expect(frodo.saml2.entityProvider.exportSaml2Provider).toHaveBeenCalledWith(
      SAML_URL,
      { deps: false }
    );
    expect(paths()).toContain(
      'realms/alpha/realm-config/saml/remote/https___sp.example.com_metadata_id=1.json'
    );
  });

  test('the realm that was given narrows the pull: no other realm is listed or written', async () => {
    expect(await configManagerExportSaml(null, false, undefined, 'bravo')).toBe(
      true
    );

    expect(listCalls).toEqual(['providers@bravo', 'circles@bravo']);
    expect(paths()).toEqual([
      'realms/bravo/realm-config/saml/remote/urn_bravo_sp.json',
    ]);
  });

  test('the default realm of the library is no realm: every realm is pulled', async () => {
    await configManagerExportSaml(null, false, undefined, '__default__realm__');

    expect(listCalls).toEqual([
      'providers@/',
      'circles@/',
      'providers@alpha',
      'circles@alpha',
      'providers@bravo',
      'circles@bravo',
    ]);
  });

  test('with a file the realm that was given is not used and no list is read', async () => {
    const file = writeConfig('saml.json', samlFileOf('alpha', 'bravo'));

    expect(await configManagerExportSaml(file, false, undefined, 'bravo')).toBe(
      true
    );

    expect(listCalls).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/alpha/'))).not.toEqual(
      []
    );
    expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
      []
    );
  });

  test('a named file that does not exist is the same failure as before and reads nothing', async () => {
    const missing = path.join(tmp, 'no-such-saml.json');

    expect(await configManagerExportSaml(missing)).toBe(false);

    expect(errorMessages()).toEqual([
      `The SAML config file '${missing}' does not exist.`,
    ]);
    expect(listCalls).toEqual([]);
  });

  test('the root realm of an Identity Cloud tenant has no SAML configuration: it is not listed and not written', async () => {
    deployment = 'cloud';

    expect(await configManagerExportSaml(null)).toBe(true);

    expect(listCalls.filter((call) => call.endsWith('@/'))).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/root/'))).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/alpha/'))).not.toEqual(
      []
    );
  });

  test('a tenant that is not Identity Cloud has its root realm pulled', async () => {
    await configManagerExportSaml(null);

    expect(paths()).toContain('realms/root/realm-config/saml/COT/rootcot.json');
  });

  test.each([
    ['a/b'],
    ['..'],
    ['.'],
    [''],
    ['a\\b'],
    ['a\u0000b'],
    ['a\tb'],
    ['../../outside'],
  ])(
    'a circle of trust with the id %j is skipped with a warning that names the id and the realm, and nothing is written for it',
    async (id) => {
      world.circles.alpha = ['zion-cot', id];

      expect(
        await configManagerExportSaml(null, false, undefined, 'alpha')
      ).toBe(true);

      expect(warnings()).toEqual([
        `Skipping circle of trust '${id}' of realm 'alpha': its id is not one name that a file can have.`,
      ]);
      expect(
        frodo.saml2.circlesOfTrust.exportCircleOfTrust
      ).toHaveBeenCalledTimes(1);
      expect(
        frodo.saml2.circlesOfTrust.exportCircleOfTrust
      ).toHaveBeenCalledWith('zion-cot');
      // the one that is safe is written, and nothing is written outside the folder of the type
      expect(
        paths().filter((p) =>
          p.startsWith('realms/alpha/realm-config/saml/COT/')
        )
      ).toEqual(['realms/alpha/realm-config/saml/COT/zion-cot.json']);
      expect(
        paths().filter((p) => !p.startsWith('realms/alpha/realm-config/saml/'))
      ).toEqual([]);
      // a skip is not an operation: nothing failed and nothing was counted for it
      expect(printedErrors()).toEqual([]);
      expect(summaries()).toEqual([]);
    }
  );

  test('a skipped id does not change the exit result, with or without --allow-failures', async () => {
    world.circles.alpha = ['a/b'];

    expect(await configManagerExportSaml(null, false, undefined, 'alpha')).toBe(
      true
    );
    expect(await configManagerExportSaml(null, true, undefined, 'alpha')).toBe(
      true
    );
  });

  test('a realm whose name is not a name or a path of names is skipped with a warning, and the others are pulled', async () => {
    world.realms = ['alpha', '../escape', 'bravo'];
    world.providers['../escape'] = ['urn:escape:sp'];

    expect(await configManagerExportSaml(null)).toBe(true);

    expect(warnings()).toEqual([
      "Skipping realm '../escape': its name is not '/', a name or a path of names.",
    ]);
    expect(listCalls.filter((call) => call.endsWith('@../escape'))).toEqual([]);
    expect(paths().some((p) => p.includes('escape'))).toBe(false);
    expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
      []
    );
  });

  test('a realm whose lists cannot be read is one failed operation named in the summary, and the other realms are pulled', async () => {
    world.unreadable.add('alpha');

    expect(await configManagerExportSaml(null)).toBe(false);

    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toContain('realm alpha');
    expect(printedErrors().join('\n')).toContain(
      "Error reading the SAML providers and circles of trust of realm 'alpha'"
    );
    expect(paths().filter((p) => p.startsWith('realms/alpha/'))).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
      []
    );
    expect(paths().filter((p) => p.startsWith('realms/root/'))).not.toEqual([]);
  });

  test('--allow-failures keeps the result true for a realm that cannot be read, and the failure is still summarised', async () => {
    world.unreadable.add('alpha');

    expect(await configManagerExportSaml(null, true)).toBe(true);

    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toContain('realm alpha');
  });

  test('the list of a realm that cannot be read as a whole does not write half of it: the providers are not pulled when the circles fail', async () => {
    world.circles.alpha = undefined;
    frodo.saml2.circlesOfTrust.readCirclesOfTrust.mockImplementationOnce(
      async () => {
        throw new Error('circles refused');
      }
    );
    // the first realm of the list is the root realm, which has no circle of trust call left: use alpha only
    expect(await configManagerExportSaml(null, false, undefined, 'alpha')).toBe(
      false
    );

    expect(paths()).toEqual([]);
    expect(summaries()[0]).toContain('realm alpha');
  });

  test('a tenant with no provider and no circle of trust is a success that writes nothing', async () => {
    world.providers = {};
    world.circles = {};

    expect(await configManagerExportSaml(null)).toBe(true);

    expect(paths()).toEqual([]);
    expect(errorMessages()).toEqual([]);
  });

  test('the order does not depend on the order of the lists', async () => {
    world.providers.alpha = [SAML_URL, 'urn:zion:idp'];
    world.circles.alpha = ['zion-cot', 'affiliation'];
    await configManagerExportSaml(null, false, undefined, 'alpha');
    const first = frodo.saml2.entityProvider.exportSaml2Provider.mock.calls;

    jest.clearAllMocks();
    wipe();
    world.providers.alpha = ['urn:zion:idp', SAML_URL];
    world.circles.alpha = ['affiliation', 'zion-cot'];
    await configManagerExportSaml(null, false, undefined, 'alpha');

    expect(frodo.saml2.entityProvider.exportSaml2Provider.mock.calls).toEqual(
      first
    );
    expect(first.map(([id]) => id)).toEqual([SAML_URL, 'urn:zion:idp']);
  });
});

// ---- authz policies -----------------------------------------------------------

describe('pull authz-policies without a config file', () => {
  test('pulls every policy set of every realm with its policies and resource types, the same files as a file that lists them', async () => {
    expect(await configManagerExportAuthzPolicySets(null)).toBe(true);
    const pulled = tree();
    expect(Object.keys(pulled)).toEqual([
      'realms/alpha/authorization/policy-sets/oauth2Scopes/oauth2Scopes.json',
      'realms/alpha/authorization/policy-sets/oauth2Scopes/policies/scope-policy.json',
      'realms/alpha/authorization/policy-sets/zion-policies/policies/allow-zion.json',
      'realms/alpha/authorization/policy-sets/zion-policies/policies/deny-matrix.json',
      'realms/alpha/authorization/policy-sets/zion-policies/zion-policies.json',
      'realms/alpha/authorization/resource-types/type-rt-1.json',
      'realms/bravo/authorization/policy-sets/bravo-policy/bravo-policy.json'.replace(
        'bravo-policy/bravo-policy',
        'bravo-set/bravo-set'
      ),
      'realms/bravo/authorization/policy-sets/bravo-set/policies/bravo-policy.json',
      'realms/bravo/authorization/resource-types/type-rt-1.json',
      'realms/root/authorization/policy-sets/oauth2Scopes/oauth2Scopes.json',
      'realms/root/authorization/policy-sets/oauth2Scopes/policies/root-scope-policy.json',
      'realms/root/authorization/resource-types/type-rt-1.json',
    ]);

    wipe();
    const file = writeConfig(
      'authz-policies.json',
      authzFileOf('/', 'alpha', 'bravo')
    );
    expect(await configManagerExportAuthzPolicySets(file)).toBe(true);

    expect(tree()).toEqual(pulled);
    expect(printedErrors()).toEqual([]);
  });

  test('the realm that was given narrows the pull', async () => {
    expect(await configManagerExportAuthzPolicySets(null, false, 'bravo')).toBe(
      true
    );

    expect(listCalls).toEqual(['policySets@bravo']);
    expect(
      paths().every((p) => p.startsWith('realms/bravo/authorization/'))
    ).toBe(true);
  });

  test('with a file the realm that was given is not used and no list is read', async () => {
    const file = writeConfig(
      'authz-policies.json',
      authzFileOf('alpha', 'bravo')
    );

    expect(await configManagerExportAuthzPolicySets(file, false, 'bravo')).toBe(
      true
    );

    expect(listCalls).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/alpha/'))).not.toEqual(
      []
    );
  });

  test('a named file that does not exist is the same failure as before', async () => {
    frodo.utils.readJsonFile = frodo.utils.readJsonFile;
    expect(
      await configManagerExportAuthzPolicySets(path.join(tmp, 'no-such.json'))
    ).toBe(false);

    expect(printedErrors().join('\n')).toContain('Error exporting policy sets');
    expect(listCalls).toEqual([]);
  });

  test('the root realm of an Identity Cloud tenant is visited like a file that names it does', async () => {
    deployment = 'cloud';

    expect(await configManagerExportAuthzPolicySets(null)).toBe(true);

    expect(listCalls).toContain('policySets@/');
    expect(paths()).toContain(
      'realms/root/authorization/policy-sets/oauth2Scopes/oauth2Scopes.json'
    );
  });

  test.each([
    ['a/b'],
    ['..'],
    ['.'],
    [''],
    ['a\\b'],
    ['a\u0000b'],
    ['../../outside'],
  ])(
    'a policy set with the name %j is skipped with a warning that names the name and the realm, and nothing is written for it',
    async (name) => {
      world.policySets.alpha = ['oauth2Scopes', name];

      expect(
        await configManagerExportAuthzPolicySets(null, false, 'alpha')
      ).toBe(true);

      expect(warnings()).toEqual([
        `Skipping policy set '${name}' of realm 'alpha': its name is not one name that a file can have.`,
      ]);
      expect(frodo.authz.policySet.readPolicySet).toHaveBeenCalledTimes(1);
      expect(frodo.authz.policySet.readPolicySet).toHaveBeenCalledWith(
        'oauth2Scopes'
      );
      expect(
        paths().every(
          (p) =>
            p.startsWith(
              'realms/alpha/authorization/policy-sets/oauth2Scopes/'
            ) || p.startsWith('realms/alpha/authorization/resource-types/')
        )
      ).toBe(true);
      expect(printedErrors()).toEqual([]);
      expect(summaries()).toEqual([]);
    }
  );

  test('a realm whose name is not a name or a path of names is skipped with a warning, and the others are pulled', async () => {
    world.realms = ['alpha', 'a\\b', 'bravo'];

    expect(await configManagerExportAuthzPolicySets(null)).toBe(true);

    expect(warnings()).toEqual([
      "Skipping realm 'a\\b': its name is not '/', a name or a path of names.",
    ]);
    expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
      []
    );
  });

  test('a realm whose policy sets cannot be read is one failed operation named in the summary, and the others are pulled', async () => {
    world.unreadable.add('alpha');

    expect(await configManagerExportAuthzPolicySets(null)).toBe(false);

    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toContain('realm alpha');
    expect(paths().filter((p) => p.startsWith('realms/alpha/'))).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
      []
    );
  });

  test('--allow-failures keeps the result true for a realm that cannot be read', async () => {
    world.unreadable.add('alpha');

    expect(await configManagerExportAuthzPolicySets(null, true)).toBe(true);
  });

  test('a policy set that cannot be read is one failed operation and the others are pulled, as with a file', async () => {
    frodo.authz.policySet.readPolicySet.mockImplementation(async (name) => {
      if (name === 'zion-policies') throw new Error('refused');
      return { name, resourceTypeUuids: ['rt-1'] };
    });

    expect(await configManagerExportAuthzPolicySets(null, false, 'alpha')).toBe(
      false
    );

    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toContain('alpha/zion-policies');
    expect(paths()).toContain(
      'realms/alpha/authorization/policy-sets/oauth2Scopes/oauth2Scopes.json'
    );
  });

  test('a tenant with no policy set is a success that writes nothing', async () => {
    world.policySets = {};

    expect(await configManagerExportAuthzPolicySets(null)).toBe(true);

    expect(paths()).toEqual([]);
  });
});

// ---- oauth2 agents -----------------------------------------------------------

describe('pull oauth2-agents without a config file', () => {
  test('pulls every agent and every OAuth2 client of every realm, the same files as a file that lists them', async () => {
    expect(await configManagerExportOAuth2Agents(null)).toBe(true);
    const pulled = tree();
    expect(Object.keys(pulled)).toEqual([
      'realms/alpha/realm-config/agents/IdentityGatewayAgent/zion-ig.json',
      'realms/alpha/realm-config/agents/OAuth2Client/zion-client.json',
      'realms/alpha/realm-config/agents/WebAgent/zion-web.json',
      'realms/bravo/realm-config/agents/WebAgent/bravo-web.json',
      'realms/root/realm-config/agents/OAuth2Client/root-client.json',
      'realms/root/realm-config/agents/WebAgent/root-agent.json',
    ]);

    wipe();
    const file = writeConfig(
      'oauth2-agents.json',
      agentsFileOf('/', 'alpha', 'bravo')
    );
    expect(await configManagerExportOAuth2Agents(file)).toBe(true);

    expect(tree()).toEqual(pulled);
    expect(printedErrors()).toEqual([]);
  });

  test('the agent types that have a command of their own are not pulled and not warned about', async () => {
    expect(
      await configManagerExportOAuth2Agents(null, false, undefined, 'alpha')
    ).toBe(true);

    const read = frodo.agent.readAgentByTypeAndId.mock.calls.map(
      ([type]) => type
    );
    expect(read).not.toContain('TrustedJwtIssuer');
    expect(read).not.toContain('CIMDProfile');
    expect(read).not.toContain('SoftwarePublisher');
    expect(warnings()).toEqual([]);
  });

  test('the realm that was given narrows the pull', async () => {
    expect(
      await configManagerExportOAuth2Agents(null, false, undefined, 'bravo')
    ).toBe(true);

    expect(listCalls).toEqual(['agents@bravo', 'clients@bravo']);
    expect(paths()).toEqual([
      'realms/bravo/realm-config/agents/WebAgent/bravo-web.json',
    ]);
  });

  test('with a file the realm that was given is not used and no list is read', async () => {
    const file = writeConfig(
      'oauth2-agents.json',
      agentsFileOf('alpha', 'bravo')
    );

    expect(
      await configManagerExportOAuth2Agents(file, false, undefined, 'bravo')
    ).toBe(true);

    expect(listCalls).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/alpha/'))).not.toEqual(
      []
    );
  });

  test('a named file that does not exist is the same failure as before', async () => {
    expect(
      await configManagerExportOAuth2Agents(path.join(tmp, 'no-such.json'))
    ).toBe(false);

    expect(printedErrors().join('\n')).toContain(
      'Error exporting OAuth2 agents'
    );
    expect(listCalls).toEqual([]);
  });

  test('the root realm of an Identity Cloud tenant has no agents: it is not listed and not written', async () => {
    deployment = 'cloud';

    expect(await configManagerExportOAuth2Agents(null)).toBe(true);

    expect(listCalls.filter((call) => call.endsWith('@/'))).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/root/'))).toEqual([]);
  });

  test.each([
    ['a/b'],
    ['..'],
    ['.'],
    [''],
    ['a\\b'],
    ['a\u0000b'],
    ['../../outside'],
  ])(
    'an agent with the id %j is skipped with a warning that names the id, the type and the realm, and nothing is written for it',
    async (id) => {
      world.agents.alpha = [
        { _id: 'zion-web', _type: { _id: 'WebAgent' } },
        { _id: id, _type: { _id: 'WebAgent' } },
      ];
      world.clients.alpha = [];

      expect(
        await configManagerExportOAuth2Agents(null, false, undefined, 'alpha')
      ).toBe(true);

      expect(warnings()).toEqual([
        `Skipping agent '${id}' of type 'WebAgent' of realm 'alpha': its type or its id is not one name that a file can have.`,
      ]);
      expect(frodo.agent.readAgentByTypeAndId).toHaveBeenCalledTimes(1);
      expect(paths()).toEqual([
        'realms/alpha/realm-config/agents/WebAgent/zion-web.json',
      ]);
      expect(printedErrors()).toEqual([]);
      expect(summaries()).toEqual([]);
    }
  );

  test('an OAuth2 client with an id that is not one name is skipped the same way', async () => {
    world.clients.alpha = ['zion-client', 'a/b'];

    await configManagerExportOAuth2Agents(null, false, undefined, 'alpha');

    expect(warnings()).toEqual([
      "Skipping agent 'a/b' of type 'OAuth2Client' of realm 'alpha': its type or its id is not one name that a file can have.",
    ]);
    expect(paths()).toContain(
      'realms/alpha/realm-config/agents/OAuth2Client/zion-client.json'
    );
    expect(paths().some((p) => p.includes('a%2Fb') || p.includes('a/b'))).toBe(
      false
    );
  });

  test.each([['a/b'], ['..'], ['']])(
    'an agent of the type %j is skipped with a warning, and nothing is written for it',
    async (type) => {
      world.agents.alpha = [
        { _id: 'zion-web', _type: { _id: 'WebAgent' } },
        { _id: 'odd', _type: { _id: type } },
      ];
      world.clients.alpha = [];

      await configManagerExportOAuth2Agents(null, false, undefined, 'alpha');

      expect(warnings()).toEqual([
        `Skipping agent 'odd' of type '${type}' of realm 'alpha': its type or its id is not one name that a file can have.`,
      ]);
      expect(paths()).toEqual([
        'realms/alpha/realm-config/agents/WebAgent/zion-web.json',
      ]);
    }
  );

  test('a realm whose name is not a name or a path of names is skipped with a warning, and the others are pulled', async () => {
    world.realms = ['alpha', '..', 'bravo'];

    expect(await configManagerExportOAuth2Agents(null)).toBe(true);

    expect(warnings()).toEqual([
      "Skipping realm '..': its name is not '/', a name or a path of names.",
    ]);
    expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
      []
    );
  });

  test('a realm whose agents cannot be read is one failed operation named in the summary, and the others are pulled', async () => {
    world.unreadable.add('alpha');

    expect(await configManagerExportOAuth2Agents(null)).toBe(false);

    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toContain('realm alpha');
    expect(paths().filter((p) => p.startsWith('realms/alpha/'))).toEqual([]);
    expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
      []
    );
  });

  test('--allow-failures keeps the result true for a realm that cannot be read', async () => {
    world.unreadable.add('alpha');

    expect(await configManagerExportOAuth2Agents(null, true)).toBe(true);
  });

  test('an agent that cannot be read is one failed operation and the others are pulled, as with a file', async () => {
    frodo.agent.readAgentByTypeAndId.mockImplementation(async (type, id) => {
      if (id === 'zion-web') throw new Error('refused');
      return { _id: id, type };
    });

    expect(
      await configManagerExportOAuth2Agents(null, false, undefined, 'alpha')
    ).toBe(false);

    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toContain('alpha/WebAgent/zion-web');
    expect(paths()).toContain(
      'realms/alpha/realm-config/agents/OAuth2Client/zion-client.json'
    );
  });

  test('a key set with private key material is replaced by a variable, as with a file', async () => {
    world.agentFiles['OAuth2Client/zion-client'] = {
      _id: 'zion-client',
      signEncOAuth2ClientConfig: {
        jwkSet: JSON.stringify({
          keys: [{ kty: 'RSA', n: 'x', e: 'AQAB', d: 'secret' }],
        }),
      },
    };

    await configManagerExportOAuth2Agents(null, false, undefined, 'alpha');

    const written = fs.readFileSync(
      path.join(
        tmp,
        'realms/alpha/realm-config/agents/OAuth2Client/zion-client.json'
      ),
      'utf8'
    );
    expect(written).not.toContain('secret');
    expect(written).toContain('${ZION_CLIENT_JWKSET}');
    expect(warnings().join('\n')).toContain('ZION_CLIENT_JWKSET');
  });

  test('in a tree that uses the application layout a client that an application owns is named and skipped, as with a file', async () => {
    fs.writeFileSync(
      path.join(tmp, 'frodo-config-manager.json'),
      JSON.stringify({ applications: 'folders', formatVersion: 1 })
    );
    world.ownership.alpha = [
      {
        kind: 'oauth2Client',
        id: 'zion-client',
        owners: [{ applicationName: 'Zion Portal' }],
      },
    ];

    expect(
      await configManagerExportOAuth2Agents(null, false, undefined, 'alpha')
    ).toBe(true);

    expect(paths()).not.toContain(
      'realms/alpha/realm-config/agents/OAuth2Client/zion-client.json'
    );
    expect(
      console_.printMessage.mock.calls.map(([text]) => String(text)).join('\n')
    ).toContain(
      'OAuth2 client zion-client is owned by application "Zion Portal"'
    );
    expect(paths()).toContain(
      'realms/alpha/realm-config/agents/WebAgent/zion-web.json'
    );
  });

  test('a tenant with no agent and no client is a success that writes nothing', async () => {
    world.agents = {};
    world.clients = {};

    expect(await configManagerExportOAuth2Agents(null)).toBe(true);

    expect(paths()).toEqual([]);
  });

  test('the order does not depend on the order of the lists', async () => {
    world.agents.alpha = [
      { _id: 'b-web', _type: { _id: 'WebAgent' } },
      { _id: 'a-web', _type: { _id: 'WebAgent' } },
      { _id: 'z-ig', _type: { _id: 'IdentityGatewayAgent' } },
    ];
    world.clients.alpha = ['y-client', 'x-client'];

    await configManagerExportOAuth2Agents(null, false, undefined, 'alpha');

    expect(
      frodo.agent.readAgentByTypeAndId.mock.calls.map(
        ([type, id]) => `${type}/${id}`
      )
    ).toEqual([
      'IdentityGatewayAgent/z-ig',
      'OAuth2Client/x-client',
      'OAuth2Client/y-client',
      'WebAgent/a-web',
      'WebAgent/b-web',
    ]);
  });
});
