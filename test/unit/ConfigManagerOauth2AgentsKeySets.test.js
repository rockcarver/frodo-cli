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
 * Private and secret key material in the files of the generic `config-manager
 * pull|push oauth2-agents` kind (record 0055, core record 0013): the types that it
 * handles and that have a key set are the remote consent agent (`jwkSet`) and the
 * OAuth2 client (`signEncOAuth2ClientConfig.jwkSet`). A key set with a private or a
 * symmetric key is not written: the file has `${<ID>_JWKSET}` in its place and a
 * warning says so; a push fills the variable from the key set as it is.
 *
 * Technique as in ConfigManagerOauth2AgentsCimd.test.js: the library is a fake (its
 * `readJsonFile` fills a placeholder into the TEXT of the file, as the real one
 * does), the module under test is real, the working directory is a real temporary
 * directory. No tenant is contacted.
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

const escapePlaceholders = (content) =>
  JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'));

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

/** The library's `readJsonFile`: placeholders are put into the text, an escaped one stays literal. */
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

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  state: {
    getDeploymentType: () => deployment,
    setRealm: (realm) => {
      currentRealm = realm;
    },
    getRealm: () => currentRealm,
    getEnv: (key) => environment[key],
    getEnvs: () => environment,
    setEnv: (key, value) => {
      environment[key] = value;
    },
    setEnvs: (env, clear) => {
      environment = clear ? { ...env } : { ...environment, ...env };
    },
    getUseProcessEnvironmentForPlaceholders: () => false,
  },
  frodo: {
    utils: {
      constants: {
        DEFAULT_REALM_KEY: '__default__realm__',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
      },
      getFilePath: (relative, create) => {
        const target = path.join(tmp, relative);
        if (create) fs.mkdirSync(path.dirname(target), { recursive: true });
        return target;
      },
      getWorkingDirectory: () => tmp,
      saveJsonToFile: (data, filename, includeMeta, keepRev) => {
        const copy = structuredClone(data);
        if (!keepRev) delete copy._rev;
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, JSON.stringify(copy, null, 2));
      },
      readJsonFile,
      escapePlaceholders,
      findFilesByName: jest.fn(),
      isBase64Encoded: jest.fn(),
      json: { mergeDeep },
    },
    realm: { readRealms: jest.fn(async () => []) },
    agent: { readAgentByTypeAndId, importAgent },
    app: {
      readApplicationOwnership: jest.fn(async () => ({ entries: [] })),
      getApplicationOwners: jest.fn(() => []),
    },
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
const readRaw = (relative) => fs.readFileSync(path.join(tmp, relative), 'utf8');
const AGENT_PATH = (agentType, id, realm = 'alpha') =>
  `realms/${realm}/realm-config/agents/${agentType}/${id}.json`;

const keys = (members) =>
  JSON.stringify({
    keys: [{ kty: 'RSA', n: 'modulus', e: 'AQAB', ...members }],
  });
const set = (value) => ({ inherited: false, value });

/** A remote consent agent as the single read returns it: every property wrapped. */
const consentAgent = (id, jwkSet) => ({
  _id: id,
  _rev: '-1',
  _type: {
    _id: 'RemoteConsentAgent',
    name: 'Remote Consent Agent',
    collection: true,
  },
  jwkSet: jwkSet === undefined ? { inherited: false } : set(jwkSet),
  jwksCacheTimeout: set(3600000),
});

/** An OAuth2 client as the single read returns it: its key set is in the signing and encryption group. */
const oauth2Client = (id, jwkSet) => ({
  _id: id,
  _rev: '-1',
  _type: { _id: 'OAuth2Client', name: 'OAuth2 Clients', collection: true },
  coreOAuth2ClientConfig: {
    clientName: set(['Zion client']),
    status: set('Active'),
  },
  signEncOAuth2ClientConfig: {
    jwkSet: jwkSet === undefined ? { inherited: false } : set(jwkSet),
    tokenEndpointAuthMethod: set('private_key_jwt'),
  },
});

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  environment = {};
  printed = [];
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-oauth2-agents-keysets-'));
  readAgentByTypeAndId.mockReset();
  importAgent.mockReset().mockResolvedValue({});
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const pull = async (agentType, id, object) => {
  readAgentByTypeAndId.mockResolvedValue(object);
  const file = write('config/oauth2-agents.json', {
    alpha: { [agentType]: [{ id }] },
  });
  return configManagerExportOAuth2Agents(file);
};

describe('pull oauth2-agents', () => {
  test.each([
    [
      'a remote consent agent',
      'RemoteConsentAgent',
      'zion-consent',
      consentAgent,
      'jwkSet',
      (file) => file.jwkSet,
      '${ZION_CONSENT_JWKSET}',
    ],
    [
      'an OAuth2 client',
      'OAuth2Client',
      'zion-client',
      oauth2Client,
      'signEncOAuth2ClientConfig.jwkSet',
      (file) => file.signEncOAuth2ClientConfig.jwkSet,
      '${ZION_CLIENT_JWKSET}',
    ],
  ])(
    '%s with a private key in its key set is written with the placeholder, and the warning names the object, the property and the variable',
    async (_what, agentType, id, make, field, valueOf, variable) => {
      expect(
        await pull(agentType, id, make(id, keys({ d: 'private-part' })))
      ).toBe(true);

      const text = readRaw(AGENT_PATH(agentType, id));
      expect(valueOf(JSON.parse(text))).toBe(variable);
      expect(text).toContain(`"jwkSet": "${variable}"`);
      expect(text).not.toContain('private-part');
      expect(output()).toContain(
        `WARN ${agentType} '${id}' of realm 'alpha' holds private or secret key material in ${field}: it is not written. The file has ${variable} in its place; set that variable to the key set when you push.`
      );
      expect(output()).not.toContain('private-part');
    }
  );

  test('the rest of the OAuth2 client is written as it was', async () => {
    await pull(
      'OAuth2Client',
      'zion-client',
      oauth2Client('zion-client', keys({ k: 'private-part' }))
    );

    const file = JSON.parse(readRaw(AGENT_PATH('OAuth2Client', 'zion-client')));
    expect(file.coreOAuth2ClientConfig).toEqual({
      clientName: ['Zion client'],
      status: 'Active',
    });
    expect(file.signEncOAuth2ClientConfig.tokenEndpointAuthMethod).toBe(
      'private_key_jwt'
    );
  });

  test('a key set with public keys only is written as it is and nothing is said', async () => {
    const value = keys({ kid: 'k1', use: 'sig' });

    expect(
      await pull(
        'RemoteConsentAgent',
        'zion-consent',
        consentAgent('zion-consent', value)
      )
    ).toBe(true);

    expect(
      JSON.parse(readRaw(AGENT_PATH('RemoteConsentAgent', 'zion-consent')))
        .jwkSet
    ).toBe(value);
    expect(output()).toBe('');
  });

  test('an agent without a key set is silent', async () => {
    expect(
      await pull(
        'RemoteConsentAgent',
        'zion-consent',
        consentAgent('zion-consent')
      )
    ).toBe(true);

    expect(output()).toBe('');
  });
});

describe('push oauth2-agents', () => {
  test('fills the variable that the pull named with the key set as it is', async () => {
    const keySet = keys({ d: 'private-"part"' });
    await pull(
      'RemoteConsentAgent',
      'zion-consent',
      consentAgent('zion-consent', keySet)
    );
    environment = { ZION_CONSENT_JWKSET: keySet };

    expect(await configManagerImportAgents()).toBe(true);

    expect(importAgent).toHaveBeenCalledTimes(1);
    const [id, data] = importAgent.mock.calls[0];
    expect(id).toBe('zion-consent');
    expect(data.agent['zion-consent'].jwkSet).toBe(keySet);
    // what the state held before is back
    expect(environment).toEqual({ ZION_CONSENT_JWKSET: keySet });
  });

  test('refuses the file and names the variable when it has no value, and sends nothing for it', async () => {
    await pull(
      'RemoteConsentAgent',
      'zion-consent',
      consentAgent('zion-consent', keys({ d: 'private-part' }))
    );

    expect(await configManagerImportAgents()).toBe(false);

    expect(importAgent).not.toHaveBeenCalled();
    expect(output()).toContain(
      'No value found for placeholder "ZION_CONSENT_JWKSET"'
    );
  });

  test('a file that never had a key set is read as before', async () => {
    write(AGENT_PATH('RemoteConsentAgent', 'zion-consent'), {
      _id: 'zion-consent',
      jwksCacheTimeout: 3600000,
    });

    expect(await configManagerImportAgents()).toBe(true);

    expect(importAgent).toHaveBeenCalledTimes(1);
  });
});
