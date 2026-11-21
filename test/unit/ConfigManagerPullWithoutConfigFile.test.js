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

// the library as it is: its `getFilePath` rewrites a path (a backslash is a slash, every `C:` goes) and puts the working directory first
const realLib = await import('@rockcarver/frodo-lib');

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
        getFilePath: (rel) => realLib.frodo.utils.getFilePath(rel, true),
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
          importPolicySets: jest.fn(async () => []),
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
          readPolicies: jest.fn(async () => {
            listing('policies');
            return Object.entries(world.policies)
              .filter(([key]) => key.startsWith(`${currentRealm}/`))
              .flatMap(([key, names]) =>
                names.map((name) => ({
                  _id: name,
                  name,
                  applicationName: key.slice(currentRealm.length + 1),
                  resourceTypeUuid: 'rt-1',
                }))
              );
          }),
          importPolicies: jest.fn(async () => []),
        },
        resourceType: {
          readResourceType: jest.fn(async (uuid) => ({
            uuid,
            name: `type-${uuid}`,
          })),
          importResourceTypes: jest.fn(async () => []),
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
const { configManagerExportAuthzPolicySets, configManagerImportAuthzPolicies } =
  await import(src('configManagerOps/FrConfigAuthzPoliciesOps.ts'));
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
  realLib.state.setDirectory(tmp);
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
    // the library removes every `C:` from a path after it is built, so a colon is not a name that a file has
    ['..C:'],
    ['.C:.'],
    ['C:'],
    ['a:b'],
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

  test.each([['..C:'], ['.C:.'], ['a/..C:'], ['C:'], ['a:b']])(
    'a realm named %j is skipped with a warning, and nothing is written for it',
    async (realm) => {
      world.realms = ['alpha', realm, 'bravo'];
      world.providers[realm] = ['urn:escape:sp'];

      expect(await configManagerExportSaml(null)).toBe(true);

      expect(warnings()).toEqual([
        `Skipping realm '${realm}': its name is not '/', a name or a path of names.`,
      ]);
      expect(listCalls.filter((call) => call.endsWith(`@${realm}`))).toEqual(
        []
      );
      expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
        []
      );
      expect(paths().every((p) => /^realms\/(alpha|bravo)\//.test(p))).toBe(
        true
      );
    }
  );

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
    // the policies are read in the realm that was given, so the one of that realm is written
    expect(paths()).toContain(
      'realms/bravo/authorization/policy-sets/bravo-set/policies/bravo-policy.json'
    );
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
    ['..C:'],
    ['.C:.'],
    ['C:'],
    ['a:b'],
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

  test.each([['..C:'], ['.C:.'], ['a/..C:'], ['C:'], ['a:b']])(
    'a realm named %j is skipped with a warning, and nothing is written for it',
    async (realm) => {
      world.realms = ['alpha', realm, 'bravo'];

      expect(await configManagerExportAuthzPolicySets(null)).toBe(true);

      expect(warnings()).toEqual([
        `Skipping realm '${realm}': its name is not '/', a name or a path of names.`,
      ]);
      expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
        []
      );
      expect(paths().every((p) => /^realms\/(alpha|bravo)\//.test(p))).toBe(
        true
      );
    }
  );

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
    ['..C:'],
    ['.C:.'],
    ['C:'],
    ['a:b'],
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

  test.each([['a/b'], ['..'], [''], ['..C:'], ['a:b']])(
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

  test.each([['..C:'], ['.C:.'], ['a/..C:'], ['C:'], ['a:b']])(
    'a realm named %j is skipped with a warning, and nothing is written for it',
    async (realm) => {
      world.realms = ['alpha', realm, 'bravo'];

      expect(await configManagerExportOAuth2Agents(null)).toBe(true);

      expect(warnings()).toEqual([
        `Skipping realm '${realm}': its name is not '/', a name or a path of names.`,
      ]);
      expect(paths().filter((p) => p.startsWith('realms/bravo/'))).not.toEqual(
        []
      );
      expect(paths().every((p) => /^realms\/(alpha|bravo)\//.test(p))).toBe(
        true
      );
    }
  );

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

// ---- the selectors ---------------------------------------------------------------

/**
 * `-i` and the second selector of a command (`--cot-id`, `--set-id`) filter the list of the realm:
 * the object whose listed id is exactly the one given is read and written, and a selector never
 * reaches a path or a request by itself. They need a single realm, and an id that no list holds, a
 * list that cannot be read and a missing realm fail the command whatever --allow-failures says.
 */
describe('a selector of pull saml', () => {
  test('-i pulls exactly that provider and reads no list of circles of trust', async () => {
    expect(
      await configManagerExportSaml(
        null,
        false,
        undefined,
        'alpha',
        'urn:zion:idp'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/saml/remote/urn_zion_idp.json',
    ]);
    expect(listCalls).toEqual(['providers@alpha']);
    expect(
      frodo.saml2.entityProvider.exportSaml2Provider
    ).toHaveBeenCalledTimes(1);
  });

  test('the file of the provider is the one that the pull of everything writes', async () => {
    await configManagerExportSaml(null, false, undefined, 'alpha');
    const everything = tree();
    wipe();

    await configManagerExportSaml(null, false, undefined, 'alpha', SAML_URL);

    const written = tree();
    expect(Object.keys(written)).toHaveLength(1);
    for (const [file, content] of Object.entries(written)) {
      expect(everything[file]).toBe(content);
    }
  });

  test('--cot-id pulls exactly that circle of trust and reads no list of providers', async () => {
    expect(
      await configManagerExportSaml(
        null,
        false,
        undefined,
        'alpha',
        undefined,
        'zion-cot'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/saml/COT/zion-cot.json',
    ]);
    expect(listCalls).toEqual(['circles@alpha']);
    expect(
      frodo.saml2.entityProvider.exportSaml2Provider
    ).not.toHaveBeenCalled();
  });

  test.each([
    ['-i', ['urn:zion:IDP'], 'SAML provider'],
    ['-i', ['../../etc/passwd'], 'SAML provider'],
    ['--cot-id', ['ZION-COT'], 'Circle of trust'],
    ['--cot-id', ['../../outside'], 'Circle of trust'],
  ])(
    '%s with an id that the list does not hold (%j) fails whatever --allow-failures says, and nothing is read or written for it',
    async (option, [id], what) => {
      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();
        const args = option === '-i' ? [id, undefined] : [undefined, id];

        expect(
          await configManagerExportSaml(
            null,
            allowFailures,
            undefined,
            'alpha',
            ...args
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `${what} '${id}' not found in realm 'alpha'.`,
        ]);
        expect(paths()).toEqual([]);
        expect(
          frodo.saml2.entityProvider.exportSaml2Provider
        ).not.toHaveBeenCalled();
        expect(
          frodo.saml2.circlesOfTrust.exportCircleOfTrust
        ).not.toHaveBeenCalled();
      }
    }
  );

  test('a selector needs a single realm: without one the command fails whatever --allow-failures says, and no list is read', async () => {
    for (const allowFailures of [false, true]) {
      jest.clearAllMocks();
      listCalls = [];

      expect(
        await configManagerExportSaml(
          null,
          allowFailures,
          undefined,
          undefined,
          'urn:zion:idp'
        )
      ).toBe(false);
      expect(
        await configManagerExportSaml(
          null,
          allowFailures,
          undefined,
          undefined,
          undefined,
          'zion-cot'
        )
      ).toBe(false);

      expect(errorMessages()).toEqual([
        'Error: for a named SAML provider, specify a single realm',
        'Error: for a named circle of trust, specify a single realm',
      ]);
      expect(listCalls).toEqual([]);
      expect(paths()).toEqual([]);
    }
  });

  test('a list that cannot be read fails the command whatever --allow-failures says', async () => {
    world.unreadable.add('alpha');

    expect(
      await configManagerExportSaml(
        null,
        true,
        undefined,
        'alpha',
        'urn:zion:idp'
      )
    ).toBe(false);

    expect(printedErrors().join('\n')).toContain(
      "Error reading the SAML providers and circles of trust of realm 'alpha'"
    );
    expect(paths()).toEqual([]);
  });

  test('the root realm of an Identity Cloud tenant has none: the provider is not found there', async () => {
    deployment = 'cloud';

    expect(
      await configManagerExportSaml(null, false, undefined, '/', 'urn:root:sp')
    ).toBe(false);

    expect(errorMessages()).toEqual([
      "SAML provider 'urn:root:sp' not found in realm '/'.",
    ]);
    expect(listCalls).toEqual([]);
  });

  test('a provider that another provider of the realm is a prefix of is not matched by the prefix', async () => {
    world.providers.alpha = ['urn:zion:idp', 'urn:zion:idp-two'];

    await configManagerExportSaml(
      null,
      false,
      undefined,
      'alpha',
      'urn:zion:idp'
    );

    expect(paths()).toEqual([
      'realms/alpha/realm-config/saml/remote/urn_zion_idp.json',
    ]);
  });

  test('--cot-id with an id that is a prefix of the id of another circle of trust is only that circle of trust', async () => {
    world.circles.alpha = ['zion-cot-two', 'zion-cot', 'zion-cot-three'];

    expect(
      await configManagerExportSaml(
        null,
        false,
        undefined,
        'alpha',
        undefined,
        'zion-cot'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/saml/COT/zion-cot.json',
    ]);
    expect(
      frodo.saml2.circlesOfTrust.exportCircleOfTrust
    ).toHaveBeenCalledTimes(1);
  });

  test.each([['a/b'], ['..'], ['.'], [''], ['a\\b'], ['a\tb']])(
    '--cot-id names a circle of trust that exists with the id %j, which is not one name that a file can have: the command fails whatever --allow-failures says, and nothing is read or written',
    async (id) => {
      world.circles.alpha = ['zion-cot', id];

      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportSaml(
            null,
            allowFailures,
            undefined,
            'alpha',
            undefined,
            id
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `Circle of trust '${id}' of realm 'alpha' cannot be pulled: its id is not one name that a file can have.`,
        ]);
        expect(warnings()).toEqual([]);
        expect(paths()).toEqual([]);
        expect(
          frodo.saml2.circlesOfTrust.exportCircleOfTrust
        ).not.toHaveBeenCalled();
      }
    }
  );

  test('--cot-id with an id that is a prefix or a substring of the id of a listed circle of trust finds nothing: only the exact id is the one', async () => {
    for (const id of ['zion', 'ion-co', 'cot', 'affil']) {
      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportSaml(
            null,
            allowFailures,
            undefined,
            'alpha',
            undefined,
            id
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `Circle of trust '${id}' not found in realm 'alpha'.`,
        ]);
        expect(paths()).toEqual([]);
        expect(
          frodo.saml2.circlesOfTrust.exportCircleOfTrust
        ).not.toHaveBeenCalled();
      }
    }
  });

  test('a tenant that lists exactly one realm is a single realm: a selector needs no realm argument', async () => {
    world.realms = ['/'];

    expect(
      await configManagerExportSaml(
        null,
        false,
        undefined,
        undefined,
        'urn:root:sp'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/root/realm-config/saml/remote/urn_root_sp.json',
    ]);
    expect(listCalls).toEqual(['providers@/']);
  });

  test('a provider with a failing export is one failed operation, and the exit follows --allow-failures', async () => {
    frodo.saml2.entityProvider.exportSaml2Provider.mockImplementationOnce(
      async () => {
        throw new Error('refused');
      }
    );

    expect(
      await configManagerExportSaml(
        null,
        false,
        undefined,
        'alpha',
        'urn:zion:idp'
      )
    ).toBe(false);
  });
});

describe('a selector of pull authz-policies', () => {
  /** The three files that a pull of the policy writes. */
  const SET = 'realms/alpha/authorization/policy-sets/zion-policies';
  const ONE_POLICY = [
    `${SET}/policies/allow-zion.json`,
    `${SET}/zion-policies.json`,
    'realms/alpha/authorization/resource-types/type-rt-1.json',
  ];

  test('--set-id pulls exactly that policy set, with its policies and the resource types, and reads only the list of policy sets', async () => {
    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        'alpha',
        undefined,
        'zion-policies'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      `${SET}/policies/allow-zion.json`,
      `${SET}/policies/deny-matrix.json`,
      `${SET}/zion-policies.json`,
      'realms/alpha/authorization/resource-types/type-rt-1.json',
    ]);
    expect(listCalls).toEqual(['policySets@alpha']);
  });

  test('-i pulls the policy, the resource type that it uses and its policy set, and nothing else', async () => {
    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        'alpha',
        'allow-zion'
      )
    ).toBe(true);

    expect(paths()).toEqual(ONE_POLICY);
    // the policy is looked up in the list of the realm, then the set that it names is read
    expect(listCalls).toEqual(['policies@alpha']);
    expect(frodo.authz.policySet.readPolicySet).toHaveBeenCalledWith(
      'zion-policies'
    );
    expect(frodo.authz.policy.readPoliciesByPolicySet).not.toHaveBeenCalled();
  });

  test('the files of one policy are the files that a pull of its policy set writes, byte for byte', async () => {
    await configManagerExportAuthzPolicySets(
      null,
      false,
      'alpha',
      undefined,
      'zion-policies'
    );
    const wholeSet = tree();
    wipe();

    await configManagerExportAuthzPolicySets(
      null,
      false,
      'alpha',
      'allow-zion'
    );

    const one = tree();
    expect(Object.keys(one)).toEqual(ONE_POLICY);
    for (const [file, content] of Object.entries(one)) {
      expect(wholeSet[file]).toBe(content);
    }
  });

  test('a tree that a pull of one policy wrote is read by the push as it reads any tree: the set, the policy and the resource type are all there', async () => {
    await configManagerExportAuthzPolicySets(
      null,
      false,
      'alpha',
      'allow-zion'
    );

    expect(await configManagerImportAuthzPolicies()).toBe(true);

    const [types] = frodo.authz.resourceType.importResourceTypes.mock.calls[0];
    expect(Object.keys(types.resourcetype)).toEqual(['rt-1']);
    const [sets] = frodo.authz.policySet.importPolicySets.mock.calls[0];
    expect(Object.keys(sets.policyset)).toEqual(['zion-policies']);
    const [policies] = frodo.authz.policy.importPolicies.mock.calls[0];
    expect(Object.keys(policies.policy)).toEqual(['allow-zion']);
    expect(printedErrors()).toEqual([]);
  });

  test.each([
    ['-i', 'allow-ZION', 'Policy'],
    ['-i', '../../outside', 'Policy'],
    ['--set-id', 'ZION-POLICIES', 'Policy set'],
    ['--set-id', '../../outside', 'Policy set'],
  ])(
    '%s with an id that the list does not hold (%s) fails whatever --allow-failures says, and nothing is read or written for it',
    async (option, id, what) => {
      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();
        const args = option === '-i' ? [id, undefined] : [undefined, id];

        expect(
          await configManagerExportAuthzPolicySets(
            null,
            allowFailures,
            'alpha',
            ...args
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `${what} '${id}' not found in realm 'alpha'.`,
        ]);
        expect(paths()).toEqual([]);
        expect(frodo.authz.policySet.readPolicySet).not.toHaveBeenCalled();
      }
    }
  );

  test('a selector needs a single realm: without one the command fails whatever --allow-failures says, and no list is read', async () => {
    for (const allowFailures of [false, true]) {
      jest.clearAllMocks();
      listCalls = [];

      expect(
        await configManagerExportAuthzPolicySets(
          null,
          allowFailures,
          undefined,
          'allow-zion'
        )
      ).toBe(false);
      expect(
        await configManagerExportAuthzPolicySets(
          null,
          allowFailures,
          undefined,
          undefined,
          'zion-policies'
        )
      ).toBe(false);

      expect(errorMessages()).toEqual([
        'Error: for a named policy, specify a single realm',
        'Error: for a named policy set, specify a single realm',
      ]);
      expect(listCalls).toEqual([]);
      expect(paths()).toEqual([]);
    }
  });

  test('a list that cannot be read fails the command whatever --allow-failures says', async () => {
    world.unreadable.add('alpha');

    expect(
      await configManagerExportAuthzPolicySets(
        null,
        true,
        'alpha',
        undefined,
        'zion-policies'
      )
    ).toBe(false);
    expect(
      await configManagerExportAuthzPolicySets(
        null,
        true,
        'alpha',
        'allow-zion'
      )
    ).toBe(false);
    expect(paths()).toEqual([]);
    // the read that failed is the only thing said: the policy set is not reported as missing as well
    expect(errorMessages()).toEqual([]);
    expect(printedErrors().join('\n')).toContain(
      "Error reading the policy sets of realm 'alpha'"
    );
  });

  test('-i names a policy that exists in a policy set whose name is not one name that a file can have: the command fails whatever --allow-failures says, and nothing is read or written', async () => {
    world.policies['alpha/a/b'] = ['odd-policy'];

    for (const allowFailures of [false, true]) {
      jest.clearAllMocks();

      expect(
        await configManagerExportAuthzPolicySets(
          null,
          allowFailures,
          'alpha',
          'odd-policy'
        )
      ).toBe(false);

      expect(errorMessages()).toEqual([
        "Policy 'odd-policy' of realm 'alpha' cannot be pulled: the name of its policy set, 'a/b', is not one name that a file can have.",
      ]);
      expect(warnings()).toEqual([]);
      expect(paths()).toEqual([]);
      expect(frodo.authz.policySet.readPolicySet).not.toHaveBeenCalled();
    }
  });

  test('--set-id with a name that is a prefix of the name of another policy set is only that policy set', async () => {
    world.policySets.alpha = ['zion-policies-two', 'zion-policies'];
    world.policies['alpha/zion-policies-two'] = ['other-policy'];

    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        'alpha',
        undefined,
        'zion-policies'
      )
    ).toBe(true);

    expect(frodo.authz.policySet.readPolicySet).toHaveBeenCalledTimes(1);
    expect(frodo.authz.policySet.readPolicySet).toHaveBeenCalledWith(
      'zion-policies'
    );
    expect(paths().some((file) => file.includes('zion-policies-two'))).toBe(
      false
    );
  });

  test('-i with an id that is a prefix of the id of another policy is only that policy, whatever the order of the list', async () => {
    world.policies['alpha/zion-policies'] = [
      'allow-zion-two',
      'allow-zion',
      'allow-zion-three',
    ];

    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        'alpha',
        'allow-zion'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/authorization/policy-sets/zion-policies/policies/allow-zion.json',
      'realms/alpha/authorization/policy-sets/zion-policies/zion-policies.json',
      'realms/alpha/authorization/resource-types/type-rt-1.json',
    ]);
  });

  test.each([['a/b'], ['..'], ['.'], ['a\\b'], ['a\tb']])(
    '--set-id names a policy set that exists with the name %j, which is not one name that a file can have: the command fails whatever --allow-failures says, and nothing is read or written',
    async (name) => {
      world.policySets.alpha = ['oauth2Scopes', name];

      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportAuthzPolicySets(
            null,
            allowFailures,
            'alpha',
            undefined,
            name
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `Policy set '${name}' of realm 'alpha' cannot be pulled: its name is not one name that a file can have.`,
        ]);
        expect(warnings()).toEqual([]);
        expect(paths()).toEqual([]);
        expect(frodo.authz.policySet.readPolicySet).not.toHaveBeenCalled();
      }
    }
  );

  test('--set-id with a name that is a prefix or a substring of the name of a listed policy set finds nothing: only the exact name is the one', async () => {
    for (const name of ['zion', 'policies', 'oauth2', 'Scopes']) {
      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportAuthzPolicySets(
            null,
            allowFailures,
            'alpha',
            undefined,
            name
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `Policy set '${name}' not found in realm 'alpha'.`,
        ]);
        expect(paths()).toEqual([]);
        expect(frodo.authz.policySet.readPolicySet).not.toHaveBeenCalled();
      }
    }
  });

  test('-i with an id that is a prefix or a substring of the id of a listed policy finds nothing: only the exact id is the one', async () => {
    for (const id of ['allow', 'zion', 'deny-', 'matrix', 'scope']) {
      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportAuthzPolicySets(
            null,
            allowFailures,
            'alpha',
            id
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `Policy '${id}' not found in realm 'alpha'.`,
        ]);
        expect(paths()).toEqual([]);
        expect(frodo.authz.policySet.readPolicySet).not.toHaveBeenCalled();
      }
    }
  });

  test.each([['..'], ['a\\b'], ['.']])(
    '-i on a tenant whose only realm is named %j, with no realm argument: the realm is refused as it is by the parser, and nothing is read or written',
    async (realmName) => {
      world.realms = [realmName];

      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();
        listCalls = [];

        expect(
          await configManagerExportAuthzPolicySets(
            null,
            allowFailures,
            undefined,
            'allow-zion'
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `The realm '${realmName}' is not '/', a name or a path of names.`,
        ]);
        expect(listCalls).toEqual([]);
        expect(paths()).toEqual([]);
      }
    }
  );

  test('-i with a realm that is not a name or a path of names, given to the function, is refused the same way', async () => {
    expect(
      await configManagerExportAuthzPolicySets(null, false, '..', 'allow-zion')
    ).toBe(false);

    expect(errorMessages()).toEqual([
      "The realm '..' is not '/', a name or a path of names.",
    ]);
    expect(listCalls).toEqual([]);
    expect(paths()).toEqual([]);
  });

  test('a tenant that lists exactly one realm is a single realm: a selector needs no realm argument', async () => {
    world.realms = ['alpha'];

    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        undefined,
        undefined,
        'zion-policies'
      )
    ).toBe(true);
    expect(paths().length).toBeGreaterThan(0);
    expect(listCalls).toEqual(['policySets@alpha']);

    wipe();
    jest.clearAllMocks();
    listCalls = [];
    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        undefined,
        'allow-zion'
      )
    ).toBe(true);
    expect(paths()).toEqual([
      'realms/alpha/authorization/policy-sets/zion-policies/policies/allow-zion.json',
      'realms/alpha/authorization/policy-sets/zion-policies/zion-policies.json',
      'realms/alpha/authorization/resource-types/type-rt-1.json',
    ]);
  });

  test('a policy set that cannot be read is one failed operation, nothing is written, and the exit follows --allow-failures', async () => {
    frodo.authz.policySet.readPolicySet.mockImplementation(async () => {
      throw new Error('refused');
    });

    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        'alpha',
        'allow-zion'
      )
    ).toBe(false);
    expect(paths()).toEqual([]);
    expect(summaries()).toHaveLength(1);

    jest.clearAllMocks();
    expect(
      await configManagerExportAuthzPolicySets(
        null,
        true,
        'alpha',
        'allow-zion'
      )
    ).toBe(true);
  });

  test('the root realm of an Identity Cloud tenant is looked in, as without a selector', async () => {
    deployment = 'cloud';

    expect(
      await configManagerExportAuthzPolicySets(
        null,
        false,
        '/',
        'root-scope-policy'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/root/authorization/policy-sets/oauth2Scopes/oauth2Scopes.json',
      'realms/root/authorization/policy-sets/oauth2Scopes/policies/root-scope-policy.json',
      'realms/root/authorization/resource-types/type-rt-1.json',
    ]);
  });
});

describe('a selector of pull oauth2-agents', () => {
  test('-i pulls exactly that agent, and reads the lists of the realm once', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'zion-web'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/agents/WebAgent/zion-web.json',
    ]);
    expect(listCalls).toEqual(['agents@alpha', 'clients@alpha']);
    expect(frodo.agent.readAgentByTypeAndId).toHaveBeenCalledTimes(1);
    expect(frodo.agent.readAgentByTypeAndId).toHaveBeenCalledWith(
      'WebAgent',
      'zion-web'
    );
  });

  test('-i pulls an OAuth2 client as well, with its type', async () => {
    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'zion-client'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/agents/OAuth2Client/zion-client.json',
    ]);
  });

  test('the file of the object is the one that the pull of everything writes', async () => {
    await configManagerExportOAuth2Agents(null, false, undefined, 'alpha');
    const everything = tree();
    wipe();

    await configManagerExportOAuth2Agents(
      null,
      false,
      undefined,
      'alpha',
      'zion-ig'
    );

    const written = tree();
    expect(Object.keys(written)).toEqual([
      'realms/alpha/realm-config/agents/IdentityGatewayAgent/zion-ig.json',
    ]);
    for (const [file, content] of Object.entries(written)) {
      expect(everything[file]).toBe(content);
    }
  });

  test('an id that an agent and an OAuth2 client both have fails and names both types, and nothing is guessed', async () => {
    world.clients.alpha = ['zion-web'];

    for (const allowFailures of [false, true]) {
      jest.clearAllMocks();

      expect(
        await configManagerExportOAuth2Agents(
          null,
          allowFailures,
          undefined,
          'alpha',
          'zion-web'
        )
      ).toBe(false);

      expect(errorMessages()).toEqual([
        "More than one object of realm 'alpha' has the id 'zion-web': OAuth2Client, WebAgent. None is pulled; name the one you mean, with its type, in a config file.",
      ]);
      expect(paths()).toEqual([]);
      expect(frodo.agent.readAgentByTypeAndId).not.toHaveBeenCalled();
    }
  });

  test('an object that is listed once, with the same id in another type, is not mistaken for it when the id differs in case', async () => {
    world.clients.alpha = ['Zion-Web'];

    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'zion-web'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/agents/WebAgent/zion-web.json',
    ]);
  });

  test.each([
    ['ZION-WEB'],
    ['../../outside'],
    ['zion-issuer'],
    ['zion-profile'],
    ['zion-publisher'],
  ])(
    '-i %s: an id that the lists do not hold, or that an agent type of its own command has, fails whatever --allow-failures says, and nothing is read or written for it',
    async (id) => {
      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportOAuth2Agents(
            null,
            allowFailures,
            undefined,
            'alpha',
            id
          )
        ).toBe(false);

        expect(errorMessages()).toHaveLength(1);
        expect(errorMessages()[0]).toContain(
          `Agent or OAuth2 client '${id}' not found in realm 'alpha'.`
        );
        expect(paths()).toEqual([]);
        expect(frodo.agent.readAgentByTypeAndId).not.toHaveBeenCalled();
      }
    }
  );

  test('a selector needs a single realm: without one the command fails whatever --allow-failures says, and no list is read', async () => {
    for (const allowFailures of [false, true]) {
      jest.clearAllMocks();
      listCalls = [];

      expect(
        await configManagerExportOAuth2Agents(
          null,
          allowFailures,
          undefined,
          undefined,
          'zion-web'
        )
      ).toBe(false);

      expect(errorMessages()).toEqual([
        'Error: for a named agent or OAuth2 client, specify a single realm',
      ]);
      expect(listCalls).toEqual([]);
    }
  });

  test('lists that cannot be read fail the command whatever --allow-failures says', async () => {
    world.unreadable.add('alpha');

    expect(
      await configManagerExportOAuth2Agents(
        null,
        true,
        undefined,
        'alpha',
        'zion-web'
      )
    ).toBe(false);
    expect(paths()).toEqual([]);
  });

  test.each([
    ['an id', { _id: 'a/b', _type: { _id: 'WebAgent' } }, 'a/b', 'WebAgent'],
    ['an id', { _id: '..', _type: { _id: 'WebAgent' } }, '..', 'WebAgent'],
    ['a type', { _id: 'odd', _type: { _id: 'a/b' } }, 'odd', 'a/b'],
    ['a type', { _id: 'odd', _type: { _id: '..' } }, 'odd', '..'],
  ])(
    '-i names an agent that exists with %s that is not one name that a file can have: the command fails whatever --allow-failures says, and nothing is read or written',
    async (_what, agent, id, type) => {
      world.agents.alpha = [agent];
      world.clients.alpha = [];

      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportOAuth2Agents(
            null,
            allowFailures,
            undefined,
            'alpha',
            id
          )
        ).toBe(false);

        expect(errorMessages()).toEqual([
          `Agent '${id}' of type '${type}' of realm 'alpha' cannot be pulled: its type or its id is not one name that a file can have.`,
        ]);
        expect(warnings()).toEqual([]);
        expect(paths()).toEqual([]);
        expect(frodo.agent.readAgentByTypeAndId).not.toHaveBeenCalled();
      }
    }
  );

  test('-i with an id that is a prefix of the id of another agent is only that agent', async () => {
    world.agents.alpha = [
      { _id: 'zion-web-two', _type: { _id: 'WebAgent' } },
      { _id: 'zion-web', _type: { _id: 'WebAgent' } },
    ];
    world.clients.alpha = ['zion-web-client'];

    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        'alpha',
        'zion-web'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/agents/WebAgent/zion-web.json',
    ]);
    expect(frodo.agent.readAgentByTypeAndId).toHaveBeenCalledTimes(1);
  });

  test('-i with an id that is a prefix or a substring of the id of a listed agent or OAuth2 client finds nothing: only the exact id is the one', async () => {
    for (const id of ['zion', 'ion-we', 'web', 'zion-cl', 'client']) {
      for (const allowFailures of [false, true]) {
        jest.clearAllMocks();

        expect(
          await configManagerExportOAuth2Agents(
            null,
            allowFailures,
            undefined,
            'alpha',
            id
          )
        ).toBe(false);

        expect(errorMessages()).toHaveLength(1);
        expect(errorMessages()[0]).toContain(
          `Agent or OAuth2 client '${id}' not found in realm 'alpha'.`
        );
        expect(paths()).toEqual([]);
        expect(frodo.agent.readAgentByTypeAndId).not.toHaveBeenCalled();
      }
    }
  });

  test('a tenant that lists exactly one realm is a single realm: a selector needs no realm argument', async () => {
    world.realms = ['alpha'];

    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        undefined,
        'zion-web'
      )
    ).toBe(true);

    expect(paths()).toEqual([
      'realms/alpha/realm-config/agents/WebAgent/zion-web.json',
    ]);
    expect(listCalls).toEqual(['agents@alpha', 'clients@alpha']);
  });

  test('the root realm of an Identity Cloud tenant has no agents: the object is not found there', async () => {
    deployment = 'cloud';

    expect(
      await configManagerExportOAuth2Agents(
        null,
        false,
        undefined,
        '/',
        'root-agent'
      )
    ).toBe(false);

    expect(listCalls).toEqual([]);
  });
});
