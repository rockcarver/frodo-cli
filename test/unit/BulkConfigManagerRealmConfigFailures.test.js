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
 * Decision records 0040 and 0041 for `config-manager pull` and `push` of
 * `authentication`, `authz-policies`, `journeys`, `oauth2-agents` and
 * `org-privileges`. When one item fails, the others still run, one summary
 * names the failed one, and the command fails, unless --allow-failures was
 * given. A failure to read what there is to export or the files to import
 * fails the command whatever the flag says.
 *
 * Same technique as ConfigManagerDeleteFailures.test.js: the library is a deep
 * stub and every relative import of the modules under test is a set of spies,
 * while OperationRun, ErrorCause and the modules themselves stay real. The push
 * commands read the file system, so they run on a folder in the temp
 * directory.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** A function that is a spy and, for any property read, another such function. */
function deepStub() {
  const children = new Map();
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}

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
const frodo = deepStub();
const state = deepStub();
// the modules read these constants when they are loaded
const DEFAULT_REALM_KEY = '__default__realm__';
frodo.utils.constants = {
  DEFAULT_REALM_KEY,
  CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
  FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
};
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state,
  FrodoError,
}));

const IDS = ['a', 'b', 'c'];
const nameOf = (id) => id;
const boom = (id) => new Error(`could not process ${id}`);

/** The realm that the module under test has set last. */
let currentRealm;
/** The folder that the push commands read. */
let folder;

const write = (relative, content = {}) => {
  const file = path.join(folder, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(content));
};

/** Leaves an empty folder where there were files. */
const emptyFolder = (relative) => {
  fs.rmSync(path.join(folder, relative), { recursive: true, force: true });
  fs.mkdirSync(path.join(folder, relative), { recursive: true });
};

/** Stubs of the library that every case needs: the realm and the file system. */
function arrangeCommon() {
  currentRealm = undefined;
  state.setRealm.mockReset().mockImplementation((realm) => {
    currentRealm = realm;
  });
  state.getRealm.mockReset().mockImplementation(() => currentRealm);
  state.getDeploymentType.mockReset().mockReturnValue('classic');
  frodo.utils.getFilePath
    .mockReset()
    .mockImplementation((relative) => path.join(folder, relative));
  frodo.utils.getWorkingDirectory.mockReset().mockImplementation(() => folder);
  frodo.utils.readJsonFile
    .mockReset()
    .mockImplementation((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  frodo.utils.saveJsonToFile.mockReset();
  frodo.utils.escapePlaceholders.mockReset().mockImplementation((x) => x);
}

/**
 * Every case arranges the stubs so that the items `a`, `b` and `c` exist and
 * the ones in `failing` cannot be processed. `attempted` collects what was
 * tried. `run(module, allowFailures)` calls the function under test for all
 * items. `total` is the number of items the run counts (default 3), `unit` what
 * the summary calls them and `summaryName(id)` how it names the failed one.
 */
const CASES = [
  {
    name: 'config-manager pull authentication',
    file: 'src/configManagerOps/FrConfigAuthenticationOps.ts',
    summaryName: nameOf,
    unit: 'realm',
    arrange({ failing, attempted, spy }) {
      spy('src/utils/FrConfig').realmList.mockResolvedValue(IDS);
      frodo.authn.settings.readAuthenticationSettings
        .mockReset()
        .mockImplementation(async () => {
          attempted.push(currentRealm);
          if (failing.has(currentRealm)) throw boom(currentRealm);
          return {};
        });
    },
    empty: ({ spy }) =>
      spy('src/utils/FrConfig').realmList.mockResolvedValue([]),
    failToRead: ({ spy }) =>
      spy('src/utils/FrConfig').realmList.mockRejectedValue(
        new Error('read failed')
      ),
    run: (m, allowFailures) =>
      m.configManagerExportAuthentication(undefined, allowFailures),
  },
  {
    name: 'config-manager push authentication',
    file: 'src/configManagerOps/FrConfigAuthenticationOps.ts',
    summaryName: nameOf,
    unit: 'realm',
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`realms/${id}/realm-config/authentication.json`, { _id: id });
      }
      frodo.authn.settings.importAuthenticationSettings
        .mockReset()
        .mockImplementation(async () => {
          attempted.push(currentRealm);
          if (failing.has(currentRealm)) throw boom(currentRealm);
        });
    },
    empty: () => emptyFolder('realms'),
    failMessage:
      /No realms folder found to import authentication settings from/,
    failToRead: () =>
      fs.rmSync(path.join(folder, 'realms'), {
        recursive: true,
        force: true,
      }),
    notFound: (m) => m.configManagerImportAuthentication('zzz', false),
    run: (m, allowFailures) =>
      m.configManagerImportAuthentication(undefined, allowFailures),
  },
  {
    name: 'config-manager pull authz-policies',
    file: 'src/configManagerOps/FrConfigAuthzPoliciesOps.ts',
    summaryName: (id) => `alpha/${id}`,
    unit: 'policy set',
    arrange({ failing, attempted }) {
      write('authz-policies.json', { alpha: IDS });
      frodo.authz.policySet.readPolicySet
        .mockReset()
        .mockImplementation(async (setName) => {
          attempted.push(setName);
          if (failing.has(setName)) throw boom(setName);
          return { name: setName };
        });
      frodo.authz.policy.readPoliciesByPolicySet
        .mockReset()
        .mockResolvedValue([]);
    },
    empty: () => write('authz-policies.json', {}),
    failToRead: () => fs.rmSync(path.join(folder, 'authz-policies.json')),
    run: (m, allowFailures) =>
      m.configManagerExportAuthzPolicySets(
        path.join(folder, 'authz-policies.json'),
        allowFailures
      ),
  },
  {
    name: 'config-manager push authz-policies',
    file: 'src/configManagerOps/FrConfigAuthzPoliciesOps.ts',
    summaryName: nameOf,
    unit: 'realm',
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        fs.mkdirSync(path.join(folder, 'realms', id, 'authorization'), {
          recursive: true,
        });
      }
      frodo.authz.resourceType.importResourceTypes
        .mockReset()
        .mockImplementation(async () => {
          attempted.push(currentRealm);
          if (failing.has(currentRealm)) throw boom(currentRealm);
          return [];
        });
      frodo.authz.policySet.importPolicySets.mockReset().mockResolvedValue([]);
      frodo.authz.policy.importPolicies.mockReset().mockResolvedValue([]);
    },
    empty: () => emptyFolder('realms'),
    failMessage: /No realms folder found to import policy sets from/,
    failToRead: () =>
      fs.rmSync(path.join(folder, 'realms'), { recursive: true }),
    run: (m, allowFailures) =>
      m.configManagerImportAuthzPolicies(allowFailures),
  },
  {
    name: 'config-manager pull oauth2-agents',
    file: 'src/configManagerOps/FrConfigOauth2AgentOps.ts',
    summaryName: (id) => `alpha/OAuth2Client/${id}`,
    unit: 'agent',
    arrange({ failing, attempted }) {
      write('oauth2-agents.json', {
        alpha: { OAuth2Client: IDS.map((id) => ({ id })) },
      });
      frodo.agent.readAgentByTypeAndId
        .mockReset()
        .mockImplementation(async (type, id) => {
          attempted.push(id);
          if (failing.has(id)) throw boom(id);
          return { _id: id };
        });
    },
    empty: () => write('oauth2-agents.json', {}),
    failToRead: () => fs.rmSync(path.join(folder, 'oauth2-agents.json')),
    run: (m, allowFailures) =>
      m.configManagerExportOAuth2Agents(
        path.join(folder, 'oauth2-agents.json'),
        allowFailures
      ),
  },
  {
    name: 'config-manager push oauth2-agents',
    file: 'src/configManagerOps/FrConfigOauth2AgentOps.ts',
    summaryName: (id) => `alpha/OAuth2Client/${id}.json`,
    unit: 'agent',
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`realms/alpha/realm-config/agents/OAuth2Client/${id}.json`, {
          _id: id,
        });
      }
      frodo.agent.importAgent.mockReset().mockImplementation(async (id) => {
        attempted.push(id);
        if (failing.has(id)) throw boom(id);
      });
    },
    empty: () =>
      fs.rmSync(path.join(folder, 'realms/alpha'), { recursive: true }),
    failMessage: /No realms folder found to import OAuth2 agents from/,
    failToRead: () =>
      fs.rmSync(path.join(folder, 'realms'), { recursive: true }),
    run: (m, allowFailures) => m.configManagerImportAgents(allowFailures),
  },
  {
    name: 'config-manager pull org-privileges',
    file: 'src/configManagerOps/FrConfigOrgPrivilegesOps.ts',
    summaryName: (id) => `${id}OrgPrivileges`,
    unit: 'configuration',
    total: 4, // the privilege assignments and the three realms
    arrange({ failing, attempted }) {
      frodo.realm.readRealms
        .mockReset()
        .mockResolvedValue(IDS.map((id) => ({ name: id })));
      frodo.idm.config.readConfigEntity
        .mockReset()
        .mockImplementation(async (entity) => {
          const id = entity.replace(/OrgPrivileges$/, '');
          if (IDS.includes(id)) attempted.push(id);
          if (failing.has(id)) throw boom(id);
          return { _id: entity };
        });
    },
    empty: () => frodo.realm.readRealms.mockReset().mockResolvedValue([]),
    failToRead: () =>
      frodo.realm.readRealms
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportOrgPrivilegesAllRealms(undefined, allowFailures),
  },
  {
    name: 'config-manager push org-privileges',
    file: 'src/configManagerOps/FrConfigOrgPrivilegesOps.ts',
    summaryName: (id) => `${id}OrgPrivileges`,
    unit: 'configuration',
    total: 4,
    arrange({ failing, attempted }) {
      write('org-privileges/privilegeAssignments.json', {
        _id: 'privilegeAssignments',
      });
      for (const id of IDS) {
        write(`org-privileges/${id}OrgPrivileges.json`, {
          _id: `${id}OrgPrivileges`,
        });
      }
      frodo.realm.readRealms
        .mockReset()
        .mockResolvedValue(IDS.map((id) => ({ name: id })));
      frodo.idm.config.importConfigEntities
        .mockReset()
        .mockImplementation(async ({ idm }) => {
          const [entity] = Object.keys(idm);
          const id = entity.replace(/OrgPrivileges$/, '');
          if (IDS.includes(id)) attempted.push(id);
          if (failing.has(id)) throw boom(id);
        });
    },
    empty: () => emptyFolder('org-privileges'),
    failMessage: /No org-privileges folder found to import from/,
    failToRead: () =>
      fs.rmSync(path.join(folder, 'org-privileges'), { recursive: true }),
    run: (m, allowFailures) =>
      m.configManagerImportOrgPrivilegesAllRealms(allowFailures),
  },
  {
    name: 'config-manager pull journeys (a journey that cannot be read)',
    file: 'src/configManagerOps/FrConfigJourneysOps.ts',
    summaryName: (id) => `Error exporting the alpha realm journey ${id}`,
    unit: 'journey',
    arrange({ failing, attempted, spy }) {
      spy('src/utils/FrConfig').realmList.mockResolvedValue(['alpha']);
      frodo.authn.journey.exportJourneys
        .mockReset()
        .mockImplementation(async (options, callback) => {
          const trees = {};
          for (const id of IDS) {
            attempted.push(id);
            if (failing.has(id)) {
              callback(
                new FrodoError(
                  `Error exporting the alpha realm journey ${id}`,
                  boom(id)
                ),
                undefined
              );
            } else {
              trees[id] = { tree: { _id: id, nodes: {} }, nodes: {} };
              callback(undefined, trees[id]);
            }
          }
          return { trees };
        });
    },
    empty: () =>
      frodo.authn.journey.exportJourneys
        .mockReset()
        .mockResolvedValue({ trees: {} }),
    failToRead: () =>
      frodo.authn.journey.exportJourneys
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    notFound: (m) =>
      m.configManagerExportJourneys('zzz', undefined, false, false, false),
    notFoundAttempted: IDS, // the journeys of the realm are read before the name is looked for
    run: (m, allowFailures) =>
      m.configManagerExportJourneys(
        undefined,
        undefined,
        false,
        false,
        allowFailures
      ),
  },
  {
    name: 'config-manager pull journeys (a journey that cannot be written)',
    file: 'src/configManagerOps/FrConfigJourneysOps.ts',
    summaryName: (id) => `alpha/${id}`,
    unit: 'journey',
    arrange({ failing, attempted, spy }) {
      spy('src/utils/FrConfig').realmList.mockResolvedValue(['alpha']);
      frodo.authn.journey.exportJourneys
        .mockReset()
        .mockImplementation(async (options, callback) => {
          const trees = {};
          for (const id of IDS) {
            trees[id] = { tree: { _id: id, nodes: {} }, nodes: {} };
            callback(undefined, trees[id]);
          }
          return { trees };
        });
      frodo.utils.saveJsonToFile.mockImplementation((data) => {
        attempted.push(data._id);
        if (failing.has(data._id)) throw boom(data._id);
      });
    },
    failToRead: () =>
      frodo.authn.journey.exportJourneys
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportJourneys(
        undefined,
        undefined,
        false,
        false,
        allowFailures
      ),
  },
  {
    name: 'config-manager push journeys',
    file: 'src/configManagerOps/FrConfigJourneysOps.ts',
    summaryName: (id) => `Error importing the alpha realm journey ${id}`,
    unit: 'journey',
    arrange({ failing, attempted }) {
      for (const id of IDS)
        write(`realms/alpha/journeys/${id}/${id}.json`, { _id: id });
      frodo.authn.journey.createSingleTreeExportTemplate
        .mockReset()
        .mockImplementation(() => ({ nodes: {}, innerNodes: {}, scripts: {} }));
      frodo.authn.journey.importJourneys
        .mockReset()
        .mockImplementation(async ({ trees }, options, callback) => {
          for (const id of Object.keys(trees)) {
            attempted.push(id);
            if (failing.has(id)) {
              callback(
                new FrodoError(
                  `Error importing the alpha realm journey ${id}`,
                  boom(id)
                ),
                undefined
              );
            } else {
              callback(undefined, { _id: id });
            }
          }
          return [];
        });
    },
    // no journey file at all is still a failure of this command (the message says so)
    emptyFails: true,
    empty: () =>
      fs.rmSync(path.join(folder, 'realms/alpha/journeys'), {
        recursive: true,
      }),
    failMessage: /No journey files found to import\./,
    failToRead: () =>
      fs.rmSync(path.join(folder, 'realms'), { recursive: true }),
    notFound: (m) =>
      m.configManagerImportJourneys(
        'zzz',
        DEFAULT_REALM_KEY,
        false,
        true,
        false
      ),
    run: (m, allowFailures) =>
      m.configManagerImportJourneys(
        undefined,
        DEFAULT_REALM_KEY,
        false,
        true,
        allowFailures
      ),
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker, the cause helper and the modules under test themselves
const modulesUnderTest = new Set(
  CASES.map((c) => path.resolve(root, c.file).replace(/\.ts$/, ''))
);
const mocked = new Map();
for (const file of new Set(CASES.map((c) => c.file))) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      modulesUnderTest.has(target) ||
      target.endsWith('/utils/OperationRun') ||
      target.endsWith('/utils/ErrorCause')
    ) {
      continue;
    }
    const names = mocked.get(target) ?? new Set();
    const named = clause.match(/\{([^}]*)\}/s)?.[1] ?? '';
    for (const part of named.split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (name && !part.trim().startsWith('type ')) names.add(name);
    }
    if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim())) names.add('default');
    mocked.set(target, names);
  }
}
// the real OperationRun prints through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([...(mocked.get(consoleTarget) ?? []), 'printError', 'printMessage'])
);
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage } = spies.get(consoleTarget);
const spy = (file) => spies.get(path.resolve(root, file));

const modules = {};
for (const { file } of CASES) {
  modules[file] ??= await import(path.resolve(root, file));
}

// the summary is the one message of the shape "N of M <units> failed"
const SUMMARY = /^\d+ of \d+ [\w ]+ failed/;
const summaries = () =>
  printMessage.mock.calls.filter(([text]) => SUMMARY.test(String(text)));
const summary = () =>
  summaries()
    .map(([text]) => text)
    .join('\n');
const level = () => summaries()[0]?.[1];
const messages = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-realm-config-'));
});
afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe.each(CASES)('$name', (c) => {
  let attempted;
  let failing;
  const ctx = () => ({ failing, attempted, spy });

  beforeEach(() => {
    jest.clearAllMocks();
    arrangeCommon();
    attempted = [];
    failing = new Set(['b']);
    c.arrange(ctx());
  });

  const run = (allowFailures) => c.run(modules[c.file], allowFailures);

  test('runs every item after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(IDS);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      new RegExp(
        `^1 of ${c.total ?? 3} ${c.unit}s failed:\\n {2}- ${c.summaryName('b').replace(/[/]/g, '\\/')}: could not process b`
      )
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(IDS);
    expect(level()).toBe('warn');
    expect(summary()).toContain(c.summaryName('b'));
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every item succeeds', async () => {
    failing = new Set();
    c.arrange(ctx());

    expect(await run()).toBe(true);
    expect(attempted).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read what there is to process', async () => {
    c.failToRead(ctx());

    expect(await run(true)).toBe(false);
    expect(
      printError.mock.calls.length + printMessage.mock.calls.length
    ).toBeGreaterThan(0);
    expect(summaries()).toHaveLength(0); // the error is shown once, no summary
  });

  if (c.failMessage) {
    test('says plainly what is missing, not with a file system error', async () => {
      c.failToRead(ctx());

      expect(await run()).toBe(false);
      expect(messages()).toMatch(c.failMessage);
      expect(printError).not.toHaveBeenCalled();
    });
  }

  if (c.empty && !c.emptyFails) {
    test('nothing to process is a success', async () => {
      c.empty(ctx());

      expect(await run()).toBe(true);
      expect(printError).not.toHaveBeenCalled();
      expect(summaries()).toHaveLength(0);
    });
  }

  if (c.emptyFails) {
    test('no journey files at all still fails, and says so', async () => {
      c.empty(ctx());

      expect(await run()).toBe(false);
      expect(messages()).toContain('No journey files found to import.');
    });
  }

  if (c.notFound) {
    test('a named item that is not there fails the command', async () => {
      // nothing else failed, so the missing name is the one thing the command says
      failing = new Set();
      c.arrange(ctx());

      expect(await c.notFound(modules[c.file])).toBe(false);
      expect(attempted).toEqual(c.notFoundAttempted ?? []);
      expect(summaries()).toHaveLength(0);
    });
  }
});

describe('config-manager push authz-policies', () => {
  const file = 'src/configManagerOps/FrConfigAuthzPoliciesOps.ts';
  let order;

  beforeEach(() => {
    jest.clearAllMocks();
    arrangeCommon();
    order = [];
    for (const id of IDS) {
      fs.mkdirSync(path.join(folder, 'realms', id, 'authorization'), {
        recursive: true,
      });
    }
    frodo.authz.resourceType.importResourceTypes
      .mockReset()
      .mockImplementation(async () => {
        order.push(`${currentRealm}:types`);
        if (currentRealm === 'b') throw boom('b');
        return [];
      });
    frodo.authz.policySet.importPolicySets
      .mockReset()
      .mockImplementation(async () => {
        order.push(`${currentRealm}:sets`);
        return [];
      });
    frodo.authz.policy.importPolicies
      .mockReset()
      .mockImplementation(async () => {
        order.push(`${currentRealm}:policies`);
        return [];
      });
  });

  test('a realm whose resource types failed does not import its policy sets or policies, and the other realms still do', async () => {
    expect(await modules[file].configManagerImportAuthzPolicies()).toBe(false);

    expect(order).toEqual([
      'a:types',
      'a:sets',
      'a:policies',
      'b:types',
      'c:types',
      'c:sets',
      'c:policies',
    ]);
  });
});

describe('config-manager pull org-privileges', () => {
  const file = 'src/configManagerOps/FrConfigOrgPrivilegesOps.ts';

  beforeEach(() => {
    jest.clearAllMocks();
    arrangeCommon();
    frodo.realm.readRealms
      .mockReset()
      .mockResolvedValue(IDS.map((id) => ({ name: id })));
  });

  test('exports the global assignments and every realm even when the assignments failed', async () => {
    const saved = [];
    frodo.utils.saveJsonToFile.mockImplementation((data) =>
      saved.push(data._id)
    );
    frodo.idm.config.readConfigEntity
      .mockReset()
      .mockImplementation(async (entity) => {
        if (entity === 'privilegeAssignments') throw boom('assignments');
        return { _id: entity };
      });

    expect(
      await modules[file].configManagerExportOrgPrivilegesAllRealms()
    ).toBe(false);

    expect(saved).toEqual([
      'aOrgPrivileges',
      'bOrgPrivileges',
      'cOrgPrivileges',
    ]);
    expect(summary()).toMatch(
      /^1 of 4 configurations failed:\n {2}- privilegeAssignments: /
    );
  });

  test.each([
    ['a realm that was asked for by name fails', false, false],
    ['a realm that the tenant lists is nothing to export', true, true],
  ])(
    'a realm without configuration: %s',
    async (_, ignoreMissing, expected) => {
      frodo.idm.config.readConfigEntity
        .mockReset()
        .mockImplementation(async (entity) => {
          if (entity === 'aOrgPrivileges') {
            throw Object.assign(new Error('Not Found'), { httpStatus: 404 });
          }
          return { _id: entity };
        });

      expect(
        await modules[file].configManagerExportOrgPrivilegesAllRealms(
          'a',
          false,
          ignoreMissing
        )
      ).toBe(expected);
    }
  );
});

describe('config-manager push org-privileges', () => {
  const file = 'src/configManagerOps/FrConfigOrgPrivilegesOps.ts';
  let imported;

  beforeEach(() => {
    jest.clearAllMocks();
    arrangeCommon();
    imported = [];
    frodo.realm.readRealms
      .mockReset()
      .mockResolvedValue(IDS.map((id) => ({ name: id })));
    frodo.idm.config.importConfigEntities
      .mockReset()
      .mockImplementation(async ({ idm }) => {
        imported.push(...Object.keys(idm));
      });
  });

  test('a realm of the tenant without a file has nothing to import, and does not fail the push', async () => {
    write('org-privileges/privilegeAssignments.json', {
      _id: 'privilegeAssignments',
    });
    write('org-privileges/aOrgPrivileges.json', { _id: 'aOrgPrivileges' });

    expect(
      await modules[file].configManagerImportOrgPrivilegesAllRealms()
    ).toBe(true);

    expect(imported).toEqual(['privilegeAssignments', 'aOrgPrivileges']);
    expect(printError).not.toHaveBeenCalled();
  });

  test('says that the privilege assignments are missing, and still imports the realms', async () => {
    write('org-privileges/bOrgPrivileges.json', { _id: 'bOrgPrivileges' });

    expect(
      await modules[file].configManagerImportOrgPrivilegesAllRealms()
    ).toBe(true);

    expect(imported).toEqual(['bOrgPrivileges']);
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('no privilegeAssignments.json'),
      'warn'
    );
  });

  test('says plainly that the org-privileges folder is missing', async () => {
    expect(
      await modules[file].configManagerImportOrgPrivilegesAllRealms(true)
    ).toBe(false);

    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('No org-privileges folder found'),
      'error'
    );
    expect(printError).not.toHaveBeenCalled();
  });

  test('-n fails plainly when the named file is not there', async () => {
    expect(
      await modules[file].configManagerImportOrgPrivilegesByName(
        'zzzOrgPrivileges'
      )
    ).toBe(false);

    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('Organization privileges file not found'),
      'error'
    );
    expect(imported).toEqual([]);
  });
});

describe('config-manager push journeys', () => {
  const file = 'src/configManagerOps/FrConfigJourneysOps.ts';
  let imported;

  beforeEach(() => {
    jest.clearAllMocks();
    arrangeCommon();
    imported = [];
    frodo.authn.journey.createSingleTreeExportTemplate
      .mockReset()
      .mockImplementation(() => ({ nodes: {}, innerNodes: {}, scripts: {} }));
    frodo.authn.journey.importJourneys
      .mockReset()
      .mockImplementation(async ({ trees }, options, callback) => {
        for (const id of Object.keys(trees)) {
          imported.push(`${currentRealm}:${id}`);
          callback(undefined, { _id: id });
        }
        return [];
      });
  });

  const writeJourney = (realm, id) =>
    write(`realms/${realm}/journeys/${id}/${id}.json`, { _id: id });

  test('a realm whose batch the library rejects fails, and the other realms are still imported', async () => {
    for (const realm of ['alpha', 'bravo', 'charlie']) writeJourney(realm, 'x');
    frodo.authn.journey.importJourneys.mockImplementation(
      async ({ trees }, options, callback) => {
        if (currentRealm === 'bravo') {
          throw new FrodoError(
            '1 bravo realm journeys with unresolved dependencies:',
            [new Error('x requires y')]
          );
        }
        for (const id of Object.keys(trees)) {
          imported.push(`${currentRealm}:${id}`);
          callback(undefined, { _id: id });
        }
        return [];
      }
    );

    expect(
      await modules[file].configManagerImportJourneys(
        undefined,
        DEFAULT_REALM_KEY,
        false,
        true,
        false
      )
    ).toBe(false);

    expect(imported).toEqual(['alpha:x', 'charlie:x']);
    expect(printError).toHaveBeenCalled();
    expect(summary()).toMatch(
      /^1 of 3 journeys failed:\n {2}- bravo realm: x requires y/
    );
  });

  test('a journey whose files cannot be read fails, and the others are still imported', async () => {
    writeJourney('alpha', 'a');
    write('realms/alpha/journeys/b/b.json', {});
    fs.writeFileSync(
      path.join(folder, 'realms/alpha/journeys/b/b.json'),
      '{ not json'
    );
    writeJourney('alpha', 'c');

    expect(
      await modules[file].configManagerImportJourneys(
        undefined,
        DEFAULT_REALM_KEY,
        false,
        true,
        false
      )
    ).toBe(false);

    expect(imported).toEqual(['alpha:a', 'alpha:c']);
    expect(summary()).toMatch(/^1 of 3 journeys failed:\n {2}- alpha\/b: /);
  });

  test('a journey that is only named fails when no realm has it, whatever --allow-failures says', async () => {
    writeJourney('alpha', 'a');

    expect(
      await modules[file].configManagerImportJourneys(
        'zzz',
        DEFAULT_REALM_KEY,
        false,
        true,
        true
      )
    ).toBe(false);

    expect(imported).toEqual([]);
    expect(messages()).toContain('No journey files found to import.');
  });
});

describe('config-manager pull journeys', () => {
  const file = 'src/configManagerOps/FrConfigJourneysOps.ts';

  beforeEach(() => {
    jest.clearAllMocks();
    arrangeCommon();
    spy('src/utils/FrConfig').realmList.mockResolvedValue(['alpha']);
    frodo.authn.journey.exportJourneys
      .mockReset()
      .mockImplementation(async (options, callback) => {
        const trees = {
          a: { tree: { _id: 'a', nodes: {} }, nodes: {} },
          b: { tree: { _id: 'b', nodes: {} }, nodes: {} },
        };
        for (const tree of Object.values(trees)) callback(undefined, tree);
        return { trees };
      });
  });

  test('-n exports only the named journey', async () => {
    const saved = [];
    frodo.utils.saveJsonToFile.mockImplementation((data) =>
      saved.push(data._id)
    );

    expect(
      await modules[file].configManagerExportJourneys(
        'b',
        undefined,
        false,
        false
      )
    ).toBe(true);

    expect(saved).toEqual(['b']);
  });

  test('says that the named journey is not found, but does not say so for one that failed to be read', async () => {
    frodo.authn.journey.exportJourneys
      .mockReset()
      .mockImplementation(async (options, callback) => {
        callback(
          new FrodoError(
            'Error exporting the alpha realm journey b',
            boom('b')
          ),
          undefined
        );
        return { trees: {} };
      });

    expect(
      await modules[file].configManagerExportJourneys(
        'b',
        undefined,
        false,
        false
      )
    ).toBe(false);

    expect(messages()).not.toContain("Journey 'b' not found.");
    expect(summary()).toMatch(/^1 of 1 journey failed:/);
  });
});

describe('config-manager pull and push of the other kinds on a Cloud tenant', () => {
  test('the root realm is not exported or imported on Cloud', async () => {
    arrangeCommon();
    state.getDeploymentType.mockReturnValue('cloud');
    spy('src/utils/FrConfig').realmList.mockResolvedValue(['/', 'alpha']);
    const attempted = [];
    frodo.authn.settings.readAuthenticationSettings
      .mockReset()
      .mockImplementation(async () => {
        attempted.push(currentRealm);
        return {};
      });

    expect(
      await modules[
        'src/configManagerOps/FrConfigAuthenticationOps.ts'
      ].configManagerExportAuthentication()
    ).toBe(true);

    expect(attempted).toEqual(['alpha']);
  });

  test('config-manager push oauth2-agents skips the root folder on Cloud', async () => {
    arrangeCommon();
    state.getDeploymentType.mockReturnValue('cloud');
    write('realms/root/realm-config/agents/OAuth2Client/r.json', { _id: 'r' });
    write('realms/alpha/realm-config/agents/OAuth2Client/a.json', { _id: 'a' });
    const attempted = [];
    frodo.agent.importAgent.mockReset().mockImplementation(async (id) => {
      attempted.push(id);
    });

    expect(
      await modules[
        'src/configManagerOps/FrConfigOauth2AgentOps.ts'
      ].configManagerImportAgents()
    ).toBe(true);

    expect(attempted).toEqual(['a']);
  });
});
