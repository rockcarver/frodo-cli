/**
 * Unit tests for `config-manager delete themes` (configManagerDeleteThemes in
 * src/configManagerOps/FrConfigThemeOps.ts), without a tenant. The facade and
 * the console are mocked before the module is imported (the bundled ESM of
 * frodo-lib cannot load under jest's ESM runtime). The errors of the mocked
 * library have the text of the real ones (a FrodoError whose combined message
 * holds the nested message). What these tests guard: a realm without themes does
 * not stop the realms after it, a realm that fails does not either and makes the
 * run fail, and a theme that is missing is an error in one realm and a warning
 * across several.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everything = () => printed.map((entry) => entry.msg).join('\n');

const deleted = [];
const realmsVisited = [];
let themesByRealm = {};
let currentRealm;
let failingRealms = new Set();
let deploymentType = 'forgeops';
let realms = ['/', 'alpha', 'bravo'];

/** An error like the library's: the message of the outer error, the nested one in the combined message. */
const libraryError = (outer, inner) =>
  Object.assign(new Error(outer), {
    originalErrors: [new Error(inner)],
    getCombinedMessage: () => `${outer}\n  ${inner}`,
  });

const theme = (name) => ({ _id: `id-${name}`, name });

const notFound = (name, realm) =>
  libraryError(
    `Error deleting ${realm} realm theme`,
    `'${name}' not found in realm '${realm}'`
  );

const readNotFound = (name, realm) =>
  libraryError(
    `Error reading ${realm} realm theme ${name}`,
    `Theme '${name}' not found in realm '${realm}'!`
  );

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      saveJsonToFile: () => {},
      saveTextToFile: () => {},
      getFilePath: (file) => file,
      getWorkingDirectory: () => '.',
      constants: {
        DEFAULT_REALM_KEY: '/',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
      },
    },
    theme: {
      readThemes: async () => themesByRealm[currentRealm] ?? [],
      readThemeByName: async (name) => {
        const found = (themesByRealm[currentRealm] ?? []).find(
          (t) => t.name === name
        );
        if (!found) throw readNotFound(name, currentRealm);
        return found;
      },
      deleteThemeByName: async (name) => {
        if (failingRealms.has(currentRealm))
          throw libraryError(
            `Error deleting ${currentRealm} realm theme`,
            'Request failed with status code 500'
          );
        const found = (themesByRealm[currentRealm] ?? []).find(
          (t) => t.name === name
        );
        if (!found) throw notFound(name, currentRealm);
        deleted.push(`${currentRealm}:${name}`);
        return found;
      },
      deleteThemes: async (realm) => {
        if (failingRealms.has(realm))
          throw libraryError(
            `Error deleting ${realm} realm themes`,
            'Request failed with status code 500'
          );
        const found = themesByRealm[realm] ?? [];
        if (found.length === 0)
          throw libraryError(
            `Error deleting ${realm} realm themes`,
            `No theme configuration found for realm '${realm}'`
          );
        found.forEach((t) => deleted.push(`${realm}:${t.name}`));
        return found;
      },
      importThemes: async () => {},
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
      msg: `${message ?? ''} ${error?.getCombinedMessage?.() ?? error?.message ?? error}`.trim(),
      type: 'error',
    }),
}));

jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  decodeOrNot: (value) => value,
  encodeOrNot: (value) => value,
  realmList: async () => realms,
}));

const { configManagerDeleteThemes } = await import(
  '../../src/configManagerOps/FrConfigThemeOps.ts'
);

beforeEach(() => {
  printed.length = 0;
  deleted.length = 0;
  realmsVisited.length = 0;
  failingRealms = new Set();
  deploymentType = 'forgeops';
  realms = ['/', 'alpha', 'bravo'];
  themesByRealm = {
    '/': [theme('Root Theme')],
    alpha: [theme('Mine'), theme('Test')],
    bravo: [theme('Test')],
  };
});

describe('delete all themes', () => {
  test('every theme of every realm is deleted and every line names the realm', async () => {
    expect(await configManagerDeleteThemes(undefined, undefined, false)).toBe(
      true
    );

    expect(deleted).toEqual([
      '/:Root Theme',
      'alpha:Mine',
      'alpha:Test',
      'bravo:Test',
    ]);
    expect(messages(undefined)).toEqual([
      "Deleting theme 'Root Theme' in realm '/'",
      "Deleting theme 'Mine' in realm 'alpha'",
      "Deleting theme 'Test' in realm 'alpha'",
      "Deleting theme 'Test' in realm 'bravo'",
    ]);
  });

  test('a realm without themes is skipped with a warning and the realms after it are still processed', async () => {
    themesByRealm.alpha = [];

    expect(await configManagerDeleteThemes(undefined, undefined, false)).toBe(
      true
    );

    expect(deleted).toEqual(['/:Root Theme', 'bravo:Test']);
    expect(messages('warn')).toEqual([
      "No themes found to delete in realm 'alpha'.",
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('a realm that has no theme configuration at all is the same', async () => {
    delete themesByRealm.alpha;

    expect(await configManagerDeleteThemes(undefined, undefined, false)).toBe(
      true
    );

    expect(deleted).toEqual(['/:Root Theme', 'bravo:Test']);
  });

  test('one realm that is given and has no themes is a warning, not an error', async () => {
    themesByRealm.alpha = [];

    expect(await configManagerDeleteThemes(undefined, 'alpha', false)).toBe(
      true
    );

    expect(realmsVisited).toEqual(['alpha']);
    expect(messages('warn')).toEqual([
      "No themes found to delete in realm 'alpha'.",
    ]);
  });

  test('a realm that fails does not stop the others, is named, and the result is false', async () => {
    failingRealms = new Set(['alpha']);

    expect(await configManagerDeleteThemes(undefined, undefined, false)).toBe(
      false
    );

    expect(deleted).toEqual(['/:Root Theme', 'bravo:Test']);
    const errors = messages('error').join('\n');
    expect(errors).toContain("Error deleting themes in realm 'alpha'");
    expect(errors).toContain('Request failed with status code 500');
    expect(errors).toContain(
      '1 of 3 realms failed:\n  - alpha: Request failed with status code 500'
    );
  });

  test('the root realm of a cloud tenant is skipped', async () => {
    deploymentType = 'cloud';

    await configManagerDeleteThemes(undefined, undefined, false);

    expect(realmsVisited).toEqual(['alpha', 'bravo']);
    expect(deleted).not.toContain('/:Root Theme');
  });

  test('one realm is processed when it is given', async () => {
    await configManagerDeleteThemes(undefined, 'bravo', false);

    expect(realmsVisited).toEqual(['bravo']);
    expect(deleted).toEqual(['bravo:Test']);
  });
});

describe('dry run', () => {
  test('sends no delete, lists what would be deleted, and says which realm has nothing', async () => {
    themesByRealm.bravo = [];

    expect(await configManagerDeleteThemes(undefined, undefined, true)).toBe(
      true
    );

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      "Dry run: Deleting theme 'Root Theme' in realm '/'",
      "Dry run: Deleting theme 'Mine' in realm 'alpha'",
      "Dry run: Deleting theme 'Test' in realm 'alpha'",
    ]);
    expect(messages('warn')).toEqual([
      "No themes found to delete in realm 'bravo'.",
    ]);
  });
});

describe('one theme by name', () => {
  test('is deleted in the one realm that is given', async () => {
    expect(await configManagerDeleteThemes('Test', 'alpha', false)).toBe(true);

    expect(deleted).toEqual(['alpha:Test']);
    expect(realmsVisited).toEqual(['alpha']);
  });

  test('a theme that is not in the one realm that is given is an error', async () => {
    expect(await configManagerDeleteThemes('Mine', 'bravo', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error').join('\n')).toContain(
      "'Mine' not found in realm 'bravo'"
    );
  });

  test('across several realms, a realm without it is a warning and the others are processed', async () => {
    expect(await configManagerDeleteThemes('Mine', undefined, false)).toBe(
      true
    );

    expect(deleted).toEqual(['alpha:Mine']);
    expect(messages('warn')).toEqual([
      "Theme 'Mine' not found in realm '/'.",
      "Theme 'Mine' not found in realm 'bravo'.",
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('a failure other than "not found" is an error even across several realms', async () => {
    failingRealms = new Set(['alpha']);

    expect(await configManagerDeleteThemes('Test', undefined, false)).toBe(
      false
    );

    expect(deleted).toEqual(['bravo:Test']);
    expect(messages('error').join('\n')).toContain(
      "Error deleting themes in realm 'alpha'"
    );
  });

  test('the dry run of a missing theme follows the same rules', async () => {
    expect(await configManagerDeleteThemes('Mine', undefined, true)).toBe(true);
    expect(messages(undefined)).toEqual([
      "Dry run: Deleting theme 'Mine' in realm 'alpha'",
    ]);

    printed.length = 0;
    expect(await configManagerDeleteThemes('Mine', 'bravo', true)).toBe(false);
    expect(messages('error').join('\n')).toContain(
      "Theme 'Mine' not found in realm 'bravo'"
    );
  });
});
