/**
 * Unit tests for `config-manager delete scripts` (configManagerDeleteScripts in
 * src/configManagerOps/FrConfigScriptOps.ts), without a tenant. The facade and
 * the console are mocked before the module is imported (the bundled ESM of
 * frodo-lib cannot load under jest's ESM runtime). What these tests guard:
 * default scripts are never deleted (AM answers 403 and the library's own
 * delete-all leaves them alone), one script that cannot be deleted does not stop
 * the others, and every line names the realm.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everything = () => printed.map((entry) => entry.msg).join('\n');

const deletedIds = [];
const realmsVisited = [];
let scriptsByRealm = {};
let currentRealm;
let failingIds = new Set();
let deploymentType = 'forgeops';
let realms = ['/alpha', '/bravo'];

const script = (name, overrides = {}) => ({
  _id: `id-${name}`,
  name,
  language: 'JAVASCRIPT',
  context: 'AUTHENTICATION_TREE_DECISION_NODE',
  default: false,
  ...overrides,
});

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      decodeBase64: (text) => text,
      saveTextToFile: () => {},
      readJsonFile: () => ({}),
      getWorkingDirectory: () => '.',
      constants: { DEFAULT_REALM_KEY: '/', CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' },
    },
    script: {
      readScripts: async () => scriptsByRealm[currentRealm] ?? [],
      readScriptByName: async () => ({}),
      updateScript: async () => ({}),
      deleteScript: async (id) => {
        if (failingIds.has(id)) throw new Error(`refused ${id}`);
        deletedIds.push(`${currentRealm}:${id}`);
        return {};
      },
    },
  },
  state: {
    getDeploymentType: () => deploymentType,
    setRealm: (realm) => {
      currentRealm = realm;
      realmsVisited.push(realm);
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
  createProgressIndicator: () => 'indicator',
  stopProgressIndicator: () => {},
}));

jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  fileFilter: () => true,
  safeFileName: (name) => name,
  realmList: async () => realms,
}));

const { configManagerDeleteScripts } = await import(
  '../../src/configManagerOps/FrConfigScriptOps.ts'
);

beforeEach(() => {
  printed.length = 0;
  deletedIds.length = 0;
  realmsVisited.length = 0;
  failingIds = new Set();
  deploymentType = 'forgeops';
  realms = ['/alpha', '/bravo'];
  scriptsByRealm = {
    '/alpha': [
      script('Mine'),
      script('Mine Too', { context: 'OIDC_CLAIMS' }),
      script('OIDC Claims Script', { default: true, context: 'OIDC_CLAIMS' }),
      script('Device Id (Match) - Client Side', { default: true }),
      script('A Groovy One', { language: 'GROOVY' }),
    ],
    '/bravo': [script('Theirs'), script('Library Script', { default: true })],
  };
});

describe('delete all eligible scripts', () => {
  test('default scripts and scripts of other languages are left alone', async () => {
    expect(await configManagerDeleteScripts([], undefined, undefined, false)).toBe(true);

    expect(deletedIds.sort()).toEqual([
      '/alpha:id-Mine',
      '/alpha:id-Mine Too',
      '/bravo:id-Theirs',
    ]);
    expect(everything()).not.toContain('OIDC Claims Script');
    expect(everything()).not.toContain('Library Script');
    expect(everything()).not.toContain('A Groovy One');
  });

  test('every line names the realm', async () => {
    await configManagerDeleteScripts([], undefined, undefined, false);

    const lines = messages(undefined).filter((msg) => msg.startsWith('Successfully'));
    expect(lines).toHaveLength(3);
    expect(lines.filter((msg) => msg.endsWith('in realm /alpha'))).toHaveLength(2);
    expect(lines.filter((msg) => msg.endsWith('in realm /bravo'))).toHaveLength(1);
  });

  test('a script that cannot be deleted does not stop the others, and the result is false', async () => {
    failingIds = new Set(['id-Mine']);

    expect(await configManagerDeleteScripts([], undefined, undefined, false)).toBe(false);

    expect(deletedIds.sort()).toEqual(['/alpha:id-Mine Too', '/bravo:id-Theirs']);
    expect(messages('error').join('\n')).toContain('Failed to delete script Mine (id-Mine) in realm /alpha');
    expect(messages('error').join('\n')).toContain('Deleted 2 scripts, 1 failed.');
  });

  test('the root realm of a cloud tenant is skipped', async () => {
    deploymentType = 'cloud';
    realms = ['/', '/alpha'];

    await configManagerDeleteScripts([], undefined, undefined, true);

    expect(realmsVisited).toEqual(['/alpha']);
  });

  test('one realm is processed when it is given', async () => {
    await configManagerDeleteScripts([], '/bravo', undefined, false);

    expect(realmsVisited).toEqual(['/bravo']);
    expect(deletedIds).toEqual(['/bravo:id-Theirs']);
  });
});

describe('prefixes', () => {
  test('only the scripts that start with a prefix are deleted', async () => {
    await configManagerDeleteScripts(['Mine Too', 'Their'], undefined, undefined, false);

    expect(deletedIds.sort()).toEqual(['/alpha:id-Mine Too', '/bravo:id-Theirs']);
  });

  test('a prefix that only default scripts match deletes nothing and is not an error', async () => {
    expect(await configManagerDeleteScripts(['OIDC'], undefined, undefined, false)).toBe(true);

    expect(deletedIds).toEqual([]);
  });
});

describe('dry run', () => {
  test('sends no request, lists only what would be deleted and counts them by type', async () => {
    expect(await configManagerDeleteScripts([], undefined, undefined, true)).toBe(true);

    expect(deletedIds).toEqual([]);
    const output = everything();
    expect(output).toContain('Dry run: Deleting script Mine (id-Mine) in realm /alpha');
    expect(output).toContain('Dry run: Deleting script Theirs (id-Theirs) in realm /bravo');
    expect(output).not.toContain('OIDC Claims Script');
    expect(output).toContain('- AUTHENTICATION_TREE_DECISION_NODE: 2');
    expect(output).toContain('- OIDC_CLAIMS: 1');
  });
});

describe('one script by name', () => {
  test('is deleted in the one realm that is given', async () => {
    expect(await configManagerDeleteScripts([], '/alpha', 'Mine', false)).toBe(true);

    expect(deletedIds).toEqual(['/alpha:id-Mine']);
  });

  test('a default script is refused with a clear message and nothing is deleted', async () => {
    expect(await configManagerDeleteScripts([], '/alpha', 'OIDC Claims Script', false)).toBe(false);

    expect(deletedIds).toEqual([]);
    expect(messages('error').join('\n')).toContain(
      'Script OIDC Claims Script is a default script and cannot be deleted.'
    );
  });

  test('a script that does not exist is an error', async () => {
    expect(await configManagerDeleteScripts([], '/alpha', 'Nothing', false)).toBe(false);

    expect(messages('error').join('\n')).toContain('No script found with name: Nothing');
  });

  test('two scripts of that name are an error and nothing is deleted', async () => {
    scriptsByRealm['/alpha'].push(script('Mine', { _id: 'id-Mine-2' }));

    expect(await configManagerDeleteScripts([], '/alpha', 'Mine', false)).toBe(false);

    expect(deletedIds).toEqual([]);
    expect(messages('error').join('\n')).toContain('Multiple scripts found with name: Mine');
  });

  test('without a single realm there is no deleting by name', async () => {
    expect(await configManagerDeleteScripts([], undefined, 'Mine', false)).toBe(false);

    expect(deletedIds).toEqual([]);
    expect(messages('error').join('\n')).toContain('specify a single realm');
  });
});
