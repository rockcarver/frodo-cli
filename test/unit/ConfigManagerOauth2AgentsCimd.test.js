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
 * How the generic `config-manager pull|push oauth2-agents` kind treats a CIMD
 * profile (agent type `CIMDProfile`) today, pinned row by row (frodo-cli#1246).
 *
 * The generic kind works with any agent type by name and nothing in it knows the
 * type, so a CIMD profile listed in `oauth2-agents.json` is pulled and every
 * `realm-config/agents/CIMDProfile/*.json` file of a tree is pushed. These tests
 * pin that behaviour so that a change to it is deliberate and visible in a review:
 * they describe what IS, not what should be. The dedicated kind `oauth-cimd-profiles`
 * (pull, push and delete) is separate and has its own tests; the generic kind is
 * deliberately left as it is for now, because the library's agent type blacklist
 * only filters the type list and not the explicit calls by type and id that this
 * kind makes, so existing `oauth2-agents.json` entries keep working.
 *
 * Rows that are quirks of the generic kind for every agent type (the ownership
 * read of row 6, a stray file in a type folder, a sparse file that the server
 * completes on creation) are pinned as they are and are not CIMD-specific.
 *
 * The rows 7 and 8 of the issue (`pull all` runs the step `oauth2-agents`, `pull
 * all-static` has no agent step) are tests of `pull all` and live in the tests of
 * the `pull all` steps.
 *
 * Technique: the library is a fake, the module under test is real, and so are
 * OperationRun, ErrorCause, ApplicationOwnedObjects and TreeLayout. The working
 * directory is a real temporary directory; the per-user settings are a fake, so
 * nothing here can touch the real home. No tenant is contacted.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

let deployment;
let currentRealm;
let tmp;
let environment;
let printed;
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

/** What the library does to a file name that must exist: the directory is created. */
function filePath(relative, create) {
  const target = path.join(tmp, relative);
  if (create) fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

/** The library's `escapePlaceholders` (src/utils/ExportImportUtils.ts), copied. */
const escapePlaceholders = (content) =>
  JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'));

/** The library's `mergeDeep` (src/utils/JsonUtils.ts), copied: arrays merge element by element. */
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

/** The library's `readJsonFile`: placeholders are resolved from the environment, an escaped one stays literal. */
function readJsonFile(file, resolvePlaceholders = true) {
  let content = fs.readFileSync(file, 'utf8');
  if (resolvePlaceholders) {
    const placeholders = content.match(/\\*?\${.*?}/g) ?? [];
    for (const placeholder of placeholders.filter(
      (p) => !p.startsWith('\\\\')
    )) {
      const name = placeholder.replace(/\${(.*)}/, '$1');
      if (environment[name] === undefined) {
        throw new FrodoError(`No value found for placeholder "${name}"`);
      }
      content = content.replaceAll(placeholder, environment[name]);
    }
    content = content.replace(/\\\\\${/g, '${');
  }
  return JSON.parse(content);
}

const readAgentByTypeAndId = jest.fn();
const importAgent = jest.fn();
const readApplicationOwnership = jest.fn();
const getApplicationOwners = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  state: {
    getDeploymentType: () => deployment,
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
      getFilePath: filePath,
      getWorkingDirectory: () => tmp,
      // records the call and writes what the real one writes: the data without `_rev`
      saveJsonToFile: jest.fn(
        (data, filename, includeMeta, keepRev, keepModifiedProperties) => {
          savedFiles.push({
            filename,
            includeMeta,
            keepRev,
            keepModifiedProperties,
          });
          const copy = structuredClone(data);
          if (!keepRev) delete copy._rev;
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          fs.writeFileSync(filename, JSON.stringify(copy, null, 2));
        }
      ),
      readJsonFile,
      escapePlaceholders,
      findFilesByName: jest.fn(),
      isBase64Encoded: jest.fn(),
      json: { mergeDeep },
    },
    realm: { readRealms: jest.fn(async () => []) },
    agent: { readAgentByTypeAndId, importAgent },
    app: { readApplicationOwnership, getApplicationOwners },
  },
}));

jest.unstable_mockModule(src('utils/Console'), () => ({
  printError: jest.fn((error, message) => {
    printed.push(`ERROR ${message ? `${message}: ` : ''}${error.message}`);
  }),
  printMessage: jest.fn((message, type) => {
    printed.push(`${(type ?? 'text').toUpperCase()} ${message}`);
  }),
  verboseMessage: jest.fn(),
  createProgressIndicator: jest.fn(() => 'indicator'),
  stopProgressIndicator: jest.fn(),
}));

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'kind-paths',
}));

const { configManagerExportOAuth2Agents, configManagerImportAgents } =
  await import(src('configManagerOps/FrConfigOauth2AgentOps.ts'));

const output = () => printed.join('\n');

const write = (relative, content) => {
  const target = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
  return target;
};

/** Writes the config file of `pull oauth2-agents` and returns its path. */
const configFile = (config) => write('config/oauth2-agents.json', config);

const read = (relative) =>
  JSON.parse(fs.readFileSync(path.join(tmp, relative), 'utf8'));
const exists = (relative) => fs.existsSync(path.join(tmp, relative));

/** A CIMD profile as the single read returns it: wrapped, with `_rev`. */
const cimdProfile = (id, extra = {}) => ({
  _id: id,
  _rev: '-1234',
  _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
  cimdConfig: {
    cimdClientIdUrlPatterns: {
      inherited: false,
      value: ['https://agents.example.com/*'],
    },
  },
  ...extra,
});

const PROFILE_PATH = (id, realm = 'alpha') =>
  `realms/${realm}/realm-config/agents/CIMDProfile/${id}.json`;

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  environment = {};
  printed = [];
  savedFiles.length = 0;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-oauth2-agents-cimd-'));
  readAgentByTypeAndId.mockReset();
  importAgent.mockReset().mockResolvedValue({});
  readApplicationOwnership.mockReset().mockResolvedValue({ entries: [] });
  getApplicationOwners.mockReset().mockReturnValue([]);
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('pull oauth2-agents with a CIMD profile in the config file (rows 1 to 6)', () => {
  test('row 1: reads the profile by type and id and writes the object as the single read returns it, without _rev', async () => {
    readAgentByTypeAndId.mockResolvedValue(cimdProfile('zion-agents'));
    const file = configFile({
      alpha: { CIMDProfile: [{ id: 'zion-agents' }] },
    });

    const outcome = await configManagerExportOAuth2Agents(file);

    expect(outcome).toBe(true);
    expect(readAgentByTypeAndId).toHaveBeenCalledTimes(1);
    expect(readAgentByTypeAndId).toHaveBeenCalledWith(
      'CIMDProfile',
      'zion-agents'
    );
    const written = read(PROFILE_PATH('zion-agents'));
    // the wrapped form of the single read, kept as it is
    expect(written.cimdConfig.cimdClientIdUrlPatterns).toEqual({
      inherited: false,
      value: ['https://agents.example.com/*'],
    });
    expect(written._id).toBe('zion-agents');
    expect(written._type._id).toBe('CIMDProfile');
    expect(written).not.toHaveProperty('_rev');
    expect(savedFiles).toEqual([
      {
        filename: path.join(tmp, PROFILE_PATH('zion-agents')),
        includeMeta: false,
        keepRev: false,
        keepModifiedProperties: true,
      },
    ]);
  });

  test('row 1: a ${ in a value is written escaped, and the overrides are merged in', async () => {
    readAgentByTypeAndId.mockResolvedValue(
      cimdProfile('zion-agents', {
        advancedOAuth2ClientConfig: {
          clientUri: { value: 'https://${HOST}/' },
        },
      })
    );
    const file = configFile({
      alpha: {
        CIMDProfile: [
          {
            id: 'zion-agents',
            overrides: {
              coreOAuth2ClientConfig: { clientName: { value: 'Zion' } },
            },
          },
        ],
      },
    });

    expect(await configManagerExportOAuth2Agents(file)).toBe(true);

    const raw = fs.readFileSync(
      path.join(tmp, PROFILE_PATH('zion-agents')),
      'utf8'
    );
    expect(raw).toContain('\\\\${HOST}');
    expect(JSON.parse(raw).coreOAuth2ClientConfig.clientName.value).toBe(
      'Zion'
    );
  });

  test('row 2: an override with an array replaces the profile array element by element, so one element changes only the first pattern', async () => {
    readAgentByTypeAndId.mockResolvedValue({
      ...cimdProfile('zion-agents'),
      cimdConfig: {
        cimdClientIdUrlPatterns: [
          'https://agents.example.com/*',
          'https://second.example.com/*',
        ],
      },
    });
    const file = configFile({
      alpha: {
        CIMDProfile: [
          {
            id: 'zion-agents',
            overrides: {
              cimdConfig: {
                cimdClientIdUrlPatterns: ['https://${AGENT_HOST}/*'],
              },
            },
          },
        ],
      },
    });

    expect(await configManagerExportOAuth2Agents(file)).toBe(true);

    // documented behaviour of the overrides of every kind: the second pattern stays
    expect(
      read(PROFILE_PATH('zion-agents')).cimdConfig.cimdClientIdUrlPatterns
    ).toEqual(['https://${AGENT_HOST}/*', 'https://second.example.com/*']);
  });

  test('row 3: a profile that cannot be read is one failed operation, the other agents are still pulled, and --allow-failures keeps the exit code at 0', async () => {
    readAgentByTypeAndId.mockImplementation(async (type, id) => {
      if (type === 'CIMDProfile') throw new FrodoError(`cannot read ${id}`);
      return { _id: id, _type: { _id: type } };
    });
    const config = {
      alpha: {
        CIMDProfile: [{ id: 'zion-agents' }],
        RemoteConsentAgent: [{ id: 'zion-consent' }],
      },
    };

    expect(await configManagerExportOAuth2Agents(configFile(config))).toBe(
      false
    );

    expect(exists(PROFILE_PATH('zion-agents'))).toBe(false);
    expect(
      exists(
        'realms/alpha/realm-config/agents/RemoteConsentAgent/zion-consent.json'
      )
    ).toBe(true);
    expect(output()).toContain('1 of 2 agents failed');
    expect(output()).toContain('alpha/CIMDProfile/zion-agents');

    printed = [];
    expect(
      await configManagerExportOAuth2Agents(configFile(config), true)
    ).toBe(true);
    expect(output()).toContain('1 of 2 agents failed');
    expect(output()).toContain('The exit code stays 0');
  });

  test.each(['cloud', 'forgeops', 'classic'])(
    'row 4: a deployment that does not offer the type answers the read with a 404 and it is the same failed operation (%s)',
    async (shape) => {
      deployment = shape;
      readAgentByTypeAndId.mockRejectedValue(
        new FrodoError(
          'Error reading agent zion-agents',
          Object.assign(new Error("Resource 'CIMDProfile' not found"), {
            httpStatus: 404,
          })
        )
      );
      // no check of the type list: the call is by type and id
      const file = configFile({
        alpha: { CIMDProfile: [{ id: 'zion-agents' }] },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(false);

      expect(readAgentByTypeAndId).toHaveBeenCalledTimes(1);
      expect(output()).toContain('1 of 1 agent failed');
      expect(output()).toContain('alpha/CIMDProfile/zion-agents');
    }
  );

  test.each(['forgeops', 'classic'])(
    'row 12 (pull): the root realm of %s is pulled into the folder root',
    async (shape) => {
      deployment = shape;
      readAgentByTypeAndId.mockResolvedValue(cimdProfile('zion-agents'));
      const file = configFile({
        '/': { CIMDProfile: [{ id: 'zion-agents' }] },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(currentRealm).toBe('/');
      expect(exists(PROFILE_PATH('zion-agents', 'root'))).toBe(true);
    }
  );

  test('row 5: the root realm of a Cloud tenant is skipped, nothing is read', async () => {
    const file = configFile({ '/': { CIMDProfile: [{ id: 'zion-agents' }] } });

    expect(await configManagerExportOAuth2Agents(file)).toBe(true);

    expect(readAgentByTypeAndId).not.toHaveBeenCalled();
    expect(exists('realms/root')).toBe(false);
  });

  describe('row 6: a tree that uses the application layout (folders)', () => {
    beforeEach(() => {
      write('frodo-config-manager.json', {
        applications: 'folders',
        formatVersion: 1,
      });
    });

    test('the ownership of the realm is read once, even when every entry is a CIMD profile, and a profile is never asked about an owner', async () => {
      readAgentByTypeAndId.mockResolvedValue(cimdProfile('zion-agents'));
      const file = configFile({
        alpha: {
          CIMDProfile: [{ id: 'zion-agents' }, { id: 'zion-other' }],
        },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(readApplicationOwnership).toHaveBeenCalledTimes(1);
      // only an OAuth2 client can be owned
      expect(getApplicationOwners).not.toHaveBeenCalled();
      expect(exists(PROFILE_PATH('zion-agents'))).toBe(true);
      expect(exists(PROFILE_PATH('zion-other'))).toBe(true);
    });

    test('a failure to read the ownership is recorded as a failed operation and fails the command, although a profile can never be owned (an existing quirk, pinned, not CIMD-specific)', async () => {
      readApplicationOwnership.mockRejectedValue(
        new FrodoError('cannot read the applications')
      );
      readAgentByTypeAndId.mockResolvedValue(cimdProfile('zion-agents'));
      const file = configFile({
        alpha: { CIMDProfile: [{ id: 'zion-agents' }] },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(false);

      expect(output()).toContain('ownership of realm alpha');
      // the profile itself was still pulled
      expect(exists(PROFILE_PATH('zion-agents'))).toBe(true);
    });
  });
});

describe('push oauth2-agents with CIMD profile files in the tree (rows 9 to 12, 16, 17)', () => {
  test('row 9: every file of every type folder is pushed, a CIMD profile with importAgent(id, {agent: {id: object}}, false) and without _id and _rev', async () => {
    write(PROFILE_PATH('zion-agents'), cimdProfile('zion-agents'));
    write('realms/alpha/realm-config/agents/OAuth2Client/zion-client.json', {
      _id: 'zion-client',
      _type: { _id: 'OAuth2Client' },
    });

    expect(await configManagerImportAgents()).toBe(true);

    expect(importAgent).toHaveBeenCalledTimes(2);
    const call = importAgent.mock.calls.find(([id]) => id === 'zion-agents');
    expect(call[2]).toBe(false);
    expect(Object.keys(call[1].agent)).toEqual(['zion-agents']);
    const pushed = call[1].agent['zion-agents'];
    expect(pushed).not.toHaveProperty('_id');
    expect(pushed).not.toHaveProperty('_rev');
    // the type travels in the object: the library routes by `_type._id`
    expect(pushed._type._id).toBe('CIMDProfile');
    expect(pushed.cimdConfig).toEqual(cimdProfile('x').cimdConfig);
    expect(importAgent.mock.calls.some(([id]) => id === 'zion-client')).toBe(
      true
    );
  });

  test('row 11: a ${NAME} without an environment variable fails that file by name and nothing is sent for it; the other files are still pushed', async () => {
    write(
      PROFILE_PATH('zion-agents'),
      cimdProfile('zion-agents', {
        advancedOAuth2ClientConfig: { clientUri: 'https://${NAME}/' },
      })
    );
    write(PROFILE_PATH('zion-other'), cimdProfile('zion-other'));

    expect(await configManagerImportAgents()).toBe(false);

    expect(importAgent).toHaveBeenCalledTimes(1);
    expect(importAgent.mock.calls[0][0]).toBe('zion-other');
    expect(output()).toContain('No value found for placeholder "NAME"');
    expect(output()).toContain('alpha/CIMDProfile/zion-agents.json');

    // with the variable set the same file is pushed with the value filled in
    importAgent.mockClear();
    printed = [];
    environment.NAME = 'agents.example.com';
    expect(await configManagerImportAgents()).toBe(true);
    const pushed = importAgent.mock.calls.find(
      ([id]) => id === 'zion-agents'
    )[1].agent['zion-agents'];
    expect(pushed.advancedOAuth2ClientConfig.clientUri).toBe(
      'https://agents.example.com/'
    );
  });

  test('row 10: a file without _type cannot be routed by the library; the item is a named failure and the others still run', async () => {
    const withoutType = cimdProfile('zion-agents');
    delete withoutType._type;
    write(PROFILE_PATH('zion-agents'), withoutType);
    write(PROFILE_PATH('zion-other'), cimdProfile('zion-other'));
    importAgent.mockImplementation(async (id, data) => {
      // the library reads `importData.agent[agentId]?._type._id`
      if (!data.agent[id]._type) {
        throw new FrodoError(`Error importing alpha realm agent ${id}`);
      }
      return {};
    });

    expect(await configManagerImportAgents()).toBe(false);

    expect(importAgent).toHaveBeenCalledTimes(2);
    expect(output()).toContain('1 of 2 agents failed');
    expect(output()).toContain('alpha/CIMDProfile/zion-agents.json');
  });

  test('rows 16 and 17: a sparse file is pushed with one importAgent call that is not repaired afterwards, and the id is passed as it is, not encoded', async () => {
    // comment-documented characterisation: the server completes a profile it creates (201),
    // and the generic kind never sends the file a second time
    write(PROFILE_PATH('Zion (Agents)'), {
      _id: 'Zion (Agents)',
      _type: { _id: 'CIMDProfile' },
      cimdConfig: { cimdClientIdUrlPatterns: ['https://agents.example.com/*'] },
    });
    importAgent.mockResolvedValue({ status: 201 });

    expect(await configManagerImportAgents()).toBe(true);

    expect(importAgent).toHaveBeenCalledTimes(1);
    expect(importAgent.mock.calls[0][0]).toBe('Zion (Agents)');
    expect(Object.keys(importAgent.mock.calls[0][1].agent)).toEqual([
      'Zion (Agents)',
    ]);
  });

  test('row 12: the root realm folder of a Cloud tenant is skipped', async () => {
    write(PROFILE_PATH('zion-agents', 'root'), cimdProfile('zion-agents'));

    expect(await configManagerImportAgents()).toBe(true);

    expect(importAgent).not.toHaveBeenCalled();
  });

  test.each(['forgeops', 'classic'])(
    'row 12: the root realm folder of %s is pushed as the realm /',
    async (shape) => {
      deployment = shape;
      write(PROFILE_PATH('zion-agents', 'root'), cimdProfile('zion-agents'));

      expect(await configManagerImportAgents()).toBe(true);

      expect(currentRealm).toBe('/');
      expect(importAgent).toHaveBeenCalledTimes(1);
    }
  );

  test('a stray file where a type folder would be fails the whole run, not just that file (an existing quirk of the generic kind, pinned, not CIMD-specific)', async () => {
    write(PROFILE_PATH('zion-agents'), cimdProfile('zion-agents'));
    write('realms/alpha/realm-config/agents/notes.json', {});

    expect(await configManagerImportAgents()).toBe(false);

    expect(output()).toContain('Oauth2 Agents import failed');
  });

  test('a tree without a realms folder is an error', async () => {
    expect(await configManagerImportAgents()).toBe(false);
    expect(output()).toContain('No realms folder found');
    expect(importAgent).not.toHaveBeenCalled();
  });
});
