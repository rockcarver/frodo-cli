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
 * How the generic `config-manager pull|push oauth2-agents` kind treats an agent
 * type that has a config-manager kind of its own: `CIMDProfile`
 * (`oauth-cimd-profiles`, frodo-cli#1249) and `TrustedJwtIssuer`
 * (`oauth-issuers`, frodo-cli#1259).
 *
 * The generic kind works with any agent type by name. Before the skip it read
 * and wrote these two like every other type (frodo-cli#1246 pinned that row by
 * row, and the first commit of #1259 pinned it for issuers); now it leaves them
 * to their own kind: one warning per realm and type, no read, no write, no
 * import, not a failure and not an operation of the run, the config file never
 * changed. Everything else, the types the generic kind does handle, behaves as
 * it did, and the cases that pin that stay here.
 *
 * Rows that are quirks of the generic kind for every agent type (a stray file
 * in the agents folder) are pinned as they are and are not specific to the
 * two types.
 *
 * The rows 7 and 8 of #1246 (`pull all` runs the step `oauth2-agents`, `pull
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
/**
 * The committed content of an issuer in the e2e tree: the object as the single
 * read returns it and as `pull oauth2-agents` used to write it.
 */
const ISSUER_FIXTURE = JSON.parse(
  fs.readFileSync(
    path.resolve(
      root,
      'test/e2e/exports/fr-config-manager/forgeops/realms/alpha/realm-config/agents/TrustedJwtIssuer/testJWT.json'
    ),
    'utf8'
  )
);

/** The agent types that have a kind of their own, with an object of each as the single read returns it. */
const SKIPPED = [
  {
    agentType: 'CIMDProfile',
    plural: 'CIMD profiles',
    kind: 'oauth-cimd-profiles',
    make: (id, extra = {}) => cimdProfile(id, extra),
  },
  {
    agentType: 'TrustedJwtIssuer',
    plural: 'trusted JWT issuers',
    kind: 'oauth-issuers',
    make: (id, extra = {}) => ({
      ...ISSUER_FIXTURE,
      _id: id,
      _rev: '-77',
      ...extra,
    }),
  },
  {
    agentType: 'SoftwarePublisher',
    plural: 'software publishers',
    kind: 'oauth-software-publishers',
    make: (id, extra = {}) => ({
      _id: id,
      _rev: '-77',
      _type: {
        _id: 'SoftwarePublisher',
        collection: true,
        name: 'OAuth2 Software Publisher',
      },
      issuer: { inherited: false },
      jwksUri: { inherited: false },
      ...extra,
    }),
  },
];

const AGENT_PATH = (agentType, id, realm = 'alpha') =>
  `realms/${realm}/realm-config/agents/${agentType}/${id}.json`;

const warnings = () => printed.filter((line) => line.startsWith('WARN '));

const OTHER_AGENT = (id, type = 'RemoteConsentAgent') => ({
  _id: id,
  _type: { _id: type },
});

describe.each(SKIPPED)(
  'pull oauth2-agents leaves $agentType to $kind',
  ({ agentType, plural, kind, make }) => {
    const command = `"frodo config-manager pull ${kind}"`;

    test('an entry is neither read nor written, and one warning names the realm, the id and the command', async () => {
      readAgentByTypeAndId.mockResolvedValue(make('zion-agents'));
      const file = configFile({
        alpha: { [agentType]: [{ id: 'zion-agents' }] },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(readAgentByTypeAndId).not.toHaveBeenCalled();
      expect(savedFiles).toEqual([]);
      expect(exists('realms')).toBe(false);
      expect(warnings()).toEqual([
        `WARN Skipping 1 ${agentType} entry of realm 'alpha' (zion-agents): ${plural} are pulled by ${command}.`,
      ]);
    });

    test('one warning per realm and type, not per entry, and the entries of other types in the same file are still pulled', async () => {
      readAgentByTypeAndId.mockImplementation(async (type, id) =>
        OTHER_AGENT(id, type)
      );
      const file = configFile({
        alpha: {
          [agentType]: [{ id: 'zion-one' }, { id: 'zion-two' }],
          RemoteConsentAgent: [{ id: 'zion-consent' }],
        },
        bravo: { [agentType]: [{ id: 'matrix-one' }] },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(warnings()).toEqual([
        `WARN Skipping 2 ${agentType} entries of realm 'alpha' (zion-one, zion-two): ${plural} are pulled by ${command}.`,
        `WARN Skipping 1 ${agentType} entry of realm 'bravo' (matrix-one): ${plural} are pulled by ${command}.`,
      ]);
      expect(readAgentByTypeAndId.mock.calls).toEqual([
        ['RemoteConsentAgent', 'zion-consent'],
      ]);
      expect(exists(AGENT_PATH('RemoteConsentAgent', 'zion-consent'))).toBe(
        true
      );
      expect(exists(AGENT_PATH(agentType, 'zion-one'))).toBe(false);
    });

    test('an entry with overrides gets the extra sentence, one without does not, and the overrides are not applied', async () => {
      const file = configFile({
        alpha: {
          [agentType]: [
            { id: 'zion-one', overrides: { cimdConfig: { x: 1 } } },
            { id: 'zion-two' },
          ],
        },
        bravo: { [agentType]: [{ id: 'matrix-one' }] },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(warnings()).toEqual([
        `WARN Skipping 2 ${agentType} entries of realm 'alpha' (zion-one, zion-two): ${plural} are pulled by ${command}. Their overrides are not applied here: move them to the overrides file of that command (--config-file).`,
        `WARN Skipping 1 ${agentType} entry of realm 'bravo' (matrix-one): ${plural} are pulled by ${command}.`,
      ]);
      expect(readAgentByTypeAndId).not.toHaveBeenCalled();
    });

    test('a skip is not an operation: the result is true, a read that would fail is never tried, --allow-failures makes no difference, and the failures of other types are counted without it', async () => {
      readAgentByTypeAndId.mockImplementation(async (type, id) => {
        throw new FrodoError(`cannot read ${type} ${id}`);
      });
      const only = configFile({ alpha: { [agentType]: [{ id: 'zion-one' }] } });

      expect(await configManagerExportOAuth2Agents(only)).toBe(true);
      const withoutFlag = output();
      printed = [];
      expect(await configManagerExportOAuth2Agents(only, true)).toBe(true);
      expect(output()).toBe(withoutFlag);
      expect(readAgentByTypeAndId).not.toHaveBeenCalled();
      expect(withoutFlag).not.toContain('failed');

      printed = [];
      const mixed = configFile({
        alpha: {
          [agentType]: [{ id: 'zion-one' }, { id: 'zion-two' }],
          RemoteConsentAgent: [{ id: 'zion-consent' }],
        },
      });
      expect(await configManagerExportOAuth2Agents(mixed)).toBe(false);
      // the two skipped entries are not in the count
      expect(output()).toContain('1 of 1 agent failed');
      expect(output()).toContain('alpha/RemoteConsentAgent/zion-consent');
      expect(output()).not.toContain(`alpha/${agentType}`);
      printed = [];
      expect(await configManagerExportOAuth2Agents(mixed, true)).toBe(true);
    });

    test('the config file is never changed', async () => {
      const file = configFile({
        alpha: {
          [agentType]: [{ id: 'zion-one', overrides: { a: '${B}' } }],
        },
      });
      const before = fs.readFileSync(file);

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(fs.readFileSync(file).equals(before)).toBe(true);
    });

    test.each([
      ['an empty list', []],
      ['a value that is not a list', { id: 'zion-one' }],
    ])('%s says nothing and reads nothing', async (_name, entries) => {
      const file = configFile({ alpha: { [agentType]: entries } });

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(warnings()).toEqual([]);
      expect(readAgentByTypeAndId).not.toHaveBeenCalled();
    });

    test('the skip does not depend on the deployment: Cloud, ForgeOps and classic skip a realm; ForgeOps and classic name the root realm "/"; the root realm of a Cloud tenant is left alone as before', async () => {
      for (const shape of ['cloud', 'forgeops', 'classic']) {
        deployment = shape;
        printed = [];
        const file = configFile({
          '/': { [agentType]: [{ id: 'zion-root' }] },
          alpha: { [agentType]: [{ id: 'zion-one' }] },
        });

        expect(await configManagerExportOAuth2Agents(file)).toBe(true);

        expect(readAgentByTypeAndId).not.toHaveBeenCalled();
        expect(exists('realms')).toBe(false);
        const expected = [
          `WARN Skipping 1 ${agentType} entry of realm 'alpha' (zion-one): ${plural} are pulled by ${command}.`,
        ];
        if (shape !== 'cloud') {
          expected.unshift(
            `WARN Skipping 1 ${agentType} entry of realm '/' (zion-root): ${plural} are pulled by ${command}.`
          );
        }
        expect(warnings()).toEqual(expected);
      }
    });

    describe('a tree that uses the application layout (folders)', () => {
      beforeEach(() => {
        write('frodo-config-manager.json', {
          applications: 'folders',
          formatVersion: 1,
        });
      });

      test('the ownership of a realm is not read for these entries alone, and a failure to read it would not fail the command', async () => {
        readApplicationOwnership.mockRejectedValue(
          new FrodoError('cannot read the applications')
        );
        const file = configFile({
          alpha: { [agentType]: [{ id: 'zion-agents' }] },
        });

        expect(await configManagerExportOAuth2Agents(file)).toBe(true);

        expect(readApplicationOwnership).not.toHaveBeenCalled();
        expect(output()).not.toContain('ownership of realm');
        expect(warnings()).toHaveLength(1);
      });

      test('a realm that also has other types still reads the ownership once, and a client is still asked about its owner', async () => {
        readAgentByTypeAndId.mockImplementation(async (type, id) =>
          OTHER_AGENT(id, type)
        );
        const file = configFile({
          alpha: {
            [agentType]: [{ id: 'zion-agents' }],
            OAuth2Client: [{ id: 'zion-client' }],
          },
        });

        expect(await configManagerExportOAuth2Agents(file)).toBe(true);

        expect(readApplicationOwnership).toHaveBeenCalledTimes(1);
        expect(getApplicationOwners).toHaveBeenCalledTimes(1);
        expect(readAgentByTypeAndId.mock.calls).toEqual([
          ['OAuth2Client', 'zion-client'],
        ]);
      });
    });
  }
);

describe('pull oauth2-agents still handles the other types as before', () => {
  test('every other type is read by type and id and written, with the overrides merged in and a ${ escaped', async () => {
    readAgentByTypeAndId.mockImplementation(async (type, id) => ({
      ...OTHER_AGENT(id, type),
      note: 'https://${HOST}/',
    }));
    const types = [
      'OAuth2Client',
      'IdentityGatewayAgent',
      'J2EEAgent',
      'WebAgent',
      '2.2_Agent',
      'SharedAgent',
      'RemoteConsentAgent',
    ];
    const file = configFile({
      alpha: Object.fromEntries(
        types.map((type) => [
          type,
          [{ id: 'zion', overrides: { extra: type } }],
        ])
      ),
    });

    expect(await configManagerExportOAuth2Agents(file)).toBe(true);

    expect(readAgentByTypeAndId.mock.calls).toEqual(
      types.map((type) => [type, 'zion'])
    );
    for (const type of types) {
      const raw = fs.readFileSync(
        path.join(tmp, AGENT_PATH(type, 'zion')),
        'utf8'
      );
      expect(raw).toContain('\\\\${HOST}');
      expect(JSON.parse(raw).extra).toBe(type);
    }
    expect(warnings()).toEqual([]);
  });

  test('a type that cannot be read is one failed operation, the others are still pulled, and --allow-failures keeps the exit code at 0', async () => {
    readAgentByTypeAndId.mockImplementation(async (type, id) => {
      if (type === 'WebAgent') throw new FrodoError(`cannot read ${id}`);
      return OTHER_AGENT(id, type);
    });
    const config = {
      alpha: {
        WebAgent: [{ id: 'zion-web' }],
        RemoteConsentAgent: [{ id: 'zion-consent' }],
      },
    };

    expect(await configManagerExportOAuth2Agents(configFile(config))).toBe(
      false
    );

    expect(exists(AGENT_PATH('WebAgent', 'zion-web'))).toBe(false);
    expect(exists(AGENT_PATH('RemoteConsentAgent', 'zion-consent'))).toBe(true);
    expect(output()).toContain('1 of 2 agents failed');

    printed = [];
    expect(
      await configManagerExportOAuth2Agents(configFile(config), true)
    ).toBe(true);
    expect(output()).toContain('The exit code stays 0');
  });

  test('the root realm of a Cloud tenant is skipped, nothing is read', async () => {
    const file = configFile({ '/': { WebAgent: [{ id: 'zion-web' }] } });

    expect(await configManagerExportOAuth2Agents(file)).toBe(true);

    expect(readAgentByTypeAndId).not.toHaveBeenCalled();
    expect(exists('realms/root')).toBe(false);
  });

  test.each(['forgeops', 'classic'])(
    'the root realm of %s is pulled into the folder root',
    async (shape) => {
      deployment = shape;
      readAgentByTypeAndId.mockResolvedValue(
        OTHER_AGENT('zion-web', 'WebAgent')
      );
      const file = configFile({ '/': { WebAgent: [{ id: 'zion-web' }] } });

      expect(await configManagerExportOAuth2Agents(file)).toBe(true);

      expect(currentRealm).toBe('/');
      expect(exists(AGENT_PATH('WebAgent', 'zion-web', 'root'))).toBe(true);
    }
  );

  describe('in a tree that uses the application layout (folders)', () => {
    beforeEach(() => {
      write('frodo-config-manager.json', {
        applications: 'folders',
        formatVersion: 1,
      });
    });

    test('a failure to read the ownership is recorded as a failed operation and fails the command, although another type is pulled (an existing quirk, pinned)', async () => {
      readApplicationOwnership.mockRejectedValue(
        new FrodoError('cannot read the applications')
      );
      readAgentByTypeAndId.mockResolvedValue(
        OTHER_AGENT('zion-consent', 'RemoteConsentAgent')
      );
      const file = configFile({
        alpha: { RemoteConsentAgent: [{ id: 'zion-consent' }] },
      });

      expect(await configManagerExportOAuth2Agents(file)).toBe(false);

      expect(output()).toContain('ownership of realm alpha');
      expect(exists(AGENT_PATH('RemoteConsentAgent', 'zion-consent'))).toBe(
        true
      );
    });
  });
});

describe.each(SKIPPED)(
  'push oauth2-agents leaves $agentType to $kind',
  ({ agentType, kind, make }) => {
    const command = `"frodo config-manager push ${kind}"`;

    test('the files of the folder are not imported, and one warning counts them and names the command', async () => {
      write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));
      write(AGENT_PATH(agentType, 'zion-two'), make('zion-two'));
      write(`realms/alpha/realm-config/agents/${agentType}/notes.txt`, 'x');

      expect(await configManagerImportAgents()).toBe(true);

      expect(importAgent).not.toHaveBeenCalled();
      expect(warnings()).toEqual([
        `WARN Skipping the 2 ${agentType} file(s) of realm 'alpha': they are pushed by ${command}.`,
      ]);
    });

    test('the files of other types in the same realm are still imported, and one warning per realm and type', async () => {
      write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));
      write(AGENT_PATH(agentType, 'matrix-one', 'bravo'), make('matrix-one'));
      write(
        AGENT_PATH('OAuth2Client', 'zion-client'),
        OTHER_AGENT('zion-client', 'OAuth2Client')
      );

      expect(await configManagerImportAgents()).toBe(true);

      expect(importAgent).toHaveBeenCalledTimes(1);
      expect(importAgent.mock.calls[0][0]).toBe('zion-client');
      expect(warnings().sort()).toEqual([
        `WARN Skipping the 1 ${agentType} file(s) of realm 'alpha': they are pushed by ${command}.`,
        `WARN Skipping the 1 ${agentType} file(s) of realm 'bravo': they are pushed by ${command}.`,
      ]);
    });

    test('nothing in the folder is read: a file that cannot be parsed and one with a placeholder without a value fail nothing', async () => {
      write(AGENT_PATH(agentType, 'broken'), '{ not json');
      write(
        AGENT_PATH(agentType, 'placeholder'),
        make('placeholder', { note: 'https://${NOT_SET}/' })
      );

      expect(await configManagerImportAgents()).toBe(true);
      expect(await configManagerImportAgents(true)).toBe(true);

      expect(importAgent).not.toHaveBeenCalled();
      expect(output()).not.toContain('NOT_SET');
      expect(output()).not.toContain('failed');
    });

    test('a skip is not an operation: failures of other types are counted without it, and --allow-failures makes no difference to the skip', async () => {
      write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));
      write(AGENT_PATH(agentType, 'zion-two'), make('zion-two'));
      write(
        AGENT_PATH('OAuth2Client', 'zion-client'),
        OTHER_AGENT('zion-client', 'OAuth2Client')
      );
      importAgent.mockRejectedValue(new FrodoError('cannot import'));

      expect(await configManagerImportAgents()).toBe(false);
      expect(output()).toContain('1 of 1 agent failed');
      expect(output()).toContain(`alpha/OAuth2Client/zion-client.json`);
      expect(output()).not.toContain(`alpha/${agentType}`);

      printed = [];
      expect(await configManagerImportAgents(true)).toBe(true);
      expect(importAgent).toHaveBeenCalledTimes(2);
    });

    test('an empty folder, and a stray file where the folder would be, say nothing and add no failure', async () => {
      fs.mkdirSync(
        path.join(tmp, `realms/alpha/realm-config/agents/${agentType}`),
        {
          recursive: true,
        }
      );
      write(
        `realms/bravo/realm-config/agents/${agentType}`,
        'a file, not a folder'
      );

      expect(await configManagerImportAgents()).toBe(true);

      expect(warnings()).toEqual([]);
      expect(importAgent).not.toHaveBeenCalled();
    });

    test('the skip does not depend on the deployment: the root realm of a Cloud tenant is left alone as before, ForgeOps and classic name it "/"', async () => {
      for (const shape of ['cloud', 'forgeops', 'classic']) {
        deployment = shape;
        printed = [];
        write(AGENT_PATH(agentType, 'zion-root', 'root'), make('zion-root'));
        write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));

        expect(await configManagerImportAgents()).toBe(true);

        expect(importAgent).not.toHaveBeenCalled();
        const expected = [
          `WARN Skipping the 1 ${agentType} file(s) of realm 'alpha': they are pushed by ${command}.`,
        ];
        if (shape !== 'cloud') {
          expected.push(
            `WARN Skipping the 1 ${agentType} file(s) of realm '/': they are pushed by ${command}.`
          );
        }
        expect(warnings().sort()).toEqual(expected.sort());
      }
    });

    test('no file of the tree is changed', async () => {
      const target = write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));
      const before = fs.readFileSync(target);

      expect(await configManagerImportAgents()).toBe(true);

      expect(fs.readFileSync(target).equals(before)).toBe(true);
    });

    describe('a tree that uses the application layout (folders)', () => {
      beforeEach(() => {
        write('frodo-config-manager.json', {
          applications: 'folders',
          formatVersion: 1,
        });
        // an application folder that cannot be read: it fails the client files of its realm
        write(
          'realms/alpha/applications/Broken/application.json',
          '{ not json'
        );
      });

      test('the application folders are not read for these files alone, so a broken one fails nothing', async () => {
        write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));

        expect(await configManagerImportAgents()).toBe(true);

        expect(output()).not.toContain('application folders of realm');
        expect(warnings()).toHaveLength(1);
      });

      test('a realm that also has other types still reads them, and the broken folder fails the clients as before', async () => {
        write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));
        write(
          AGENT_PATH('OAuth2Client', 'zion-client'),
          OTHER_AGENT('zion-client', 'OAuth2Client')
        );

        expect(await configManagerImportAgents()).toBe(false);

        expect(output()).toContain('application folders of realm alpha');
        expect(importAgent).not.toHaveBeenCalled();
      });
    });
  }
);

describe('push oauth2-agents with the folders of several skipped types', () => {
  test('warns in the order of the type names, whatever order the file system lists the folders in', async () => {
    for (const { agentType, make } of SKIPPED) {
      write(AGENT_PATH(agentType, 'zion-one'), make('zion-one'));
    }
    // a file system may list the folders in any order (ext4 does, by hash): list them in reverse
    const real = fs.readdirSync;
    const spy = jest
      .spyOn(fs, 'readdirSync')
      .mockImplementation((dir, ...rest) => {
        const result = real(dir, ...rest);
        return String(dir).endsWith(
          path.join('alpha', 'realm-config', 'agents')
        )
          ? [...result].reverse()
          : result;
      });
    try {
      expect(await configManagerImportAgents()).toBe(true);
    } finally {
      spy.mockRestore();
    }

    expect(
      warnings().map((line) => line.match(/Skipping the 1 (\w+) file/)[1])
    ).toEqual(['CIMDProfile', 'SoftwarePublisher', 'TrustedJwtIssuer']);
  });
});

describe('push oauth2-agents still handles the other types as before', () => {
  test('every file of every other type folder is pushed with importAgent(id, {agent: {id: object}}, false) and without _id and _rev', async () => {
    const types = [
      'OAuth2Client',
      'SharedAgent',
      'WebAgent',
      'RemoteConsentAgent',
    ];
    for (const type of types) {
      write(AGENT_PATH(type, `zion-${type}`), {
        ...OTHER_AGENT(`zion-${type}`, type),
        _rev: '-1',
      });
    }

    expect(await configManagerImportAgents()).toBe(true);

    expect(importAgent).toHaveBeenCalledTimes(types.length);
    for (const type of types) {
      const call = importAgent.mock.calls.find(([id]) => id === `zion-${type}`);
      expect(call[2]).toBe(false);
      expect(Object.keys(call[1].agent)).toEqual([`zion-${type}`]);
      expect(call[1].agent[`zion-${type}`]).not.toHaveProperty('_id');
      expect(call[1].agent[`zion-${type}`]).not.toHaveProperty('_rev');
      expect(call[1].agent[`zion-${type}`]._type._id).toBe(type);
    }
    expect(warnings()).toEqual([]);
  });

  test('a ${NAME} without an environment variable fails that file by name and nothing is sent for it; the other files are still pushed', async () => {
    write(AGENT_PATH('WebAgent', 'zion-web'), {
      ...OTHER_AGENT('zion-web', 'WebAgent'),
      note: 'https://${NAME}/',
    });
    write(
      AGENT_PATH('WebAgent', 'zion-other'),
      OTHER_AGENT('zion-other', 'WebAgent')
    );

    expect(await configManagerImportAgents()).toBe(false);

    expect(importAgent).toHaveBeenCalledTimes(1);
    expect(importAgent.mock.calls[0][0]).toBe('zion-other');
    expect(output()).toContain('No value found for placeholder "NAME"');
    expect(output()).toContain('alpha/WebAgent/zion-web.json');

    importAgent.mockClear();
    printed = [];
    environment.NAME = 'agents.example.com';
    expect(await configManagerImportAgents()).toBe(true);
    expect(
      importAgent.mock.calls.find(([id]) => id === 'zion-web')[1].agent[
        'zion-web'
      ].note
    ).toBe('https://agents.example.com/');
  });

  test('a file without _type cannot be routed by the library; the item is a named failure and the others still run', async () => {
    const withoutType = OTHER_AGENT('zion-web', 'WebAgent');
    delete withoutType._type;
    write(AGENT_PATH('WebAgent', 'zion-web'), withoutType);
    write(
      AGENT_PATH('WebAgent', 'zion-other'),
      OTHER_AGENT('zion-other', 'WebAgent')
    );
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
    expect(output()).toContain('alpha/WebAgent/zion-web.json');
  });

  test('the root realm folder of a Cloud tenant is skipped', async () => {
    write(
      AGENT_PATH('WebAgent', 'zion-web', 'root'),
      OTHER_AGENT('zion-web', 'WebAgent')
    );

    expect(await configManagerImportAgents()).toBe(true);

    expect(importAgent).not.toHaveBeenCalled();
  });

  test.each(['forgeops', 'classic'])(
    'the root realm folder of %s is pushed as the realm /',
    async (shape) => {
      deployment = shape;
      write(
        AGENT_PATH('WebAgent', 'zion-web', 'root'),
        OTHER_AGENT('zion-web', 'WebAgent')
      );

      expect(await configManagerImportAgents()).toBe(true);

      expect(currentRealm).toBe('/');
      expect(importAgent).toHaveBeenCalledTimes(1);
    }
  );

  test('a stray file where a type folder would be fails the whole run, not just that file (an existing quirk of the generic kind, pinned)', async () => {
    write(
      AGENT_PATH('WebAgent', 'zion-web'),
      OTHER_AGENT('zion-web', 'WebAgent')
    );
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
