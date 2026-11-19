/**
 * Unit tests for `config-manager delete secret-mappings`
 * (configManagerDeleteSecretMappings in src/configManagerOps/FrConfigSecretMappingsOps.ts),
 * without a tenant. The facade, the realm list and the console are mocked before
 * the module is imported (the bundled ESM of frodo-lib cannot load under jest's
 * ESM runtime); OperationRun and ErrorCause stay real. The recorded end-to-end
 * replay cannot notice that no request was sent, so what is deleted is asserted
 * on the delete calls that reach the (mocked) library, with the realm that was
 * set on the state when each call was made.
 *
 * What these tests guard (cli records 0037, 0040 and 0041): the mappings are
 * those of the ESV secret store of each realm but the root realm; an empty or
 * blank ID never means "all"; naming the root realm is an error, not a silent
 * success; a named mapping is looked for in the list of the realm (exact,
 * case-sensitive) and only the listed ID is deleted, so an ID that is not a
 * mapping (`..`, `a#b`) sends no delete at all, and one that does not exist
 * is an error whatever --allow-failures says; a mapping that
 * cannot be deleted does not hide the others, is named by its ID with the cause
 * and is counted in one summary; a realm whose mappings cannot be read does not
 * stop the other realms; a list of realms that fails deletes nothing; a dry run
 * sends no delete; the realm of the state is left as the caller had it (the
 * question of the guard names it).
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

/** The calls that reached the (mocked) library: `{ call, realm, id }`, in order. */
const calls = [];
const deletesOf = () =>
  calls.filter((c) => c.call === 'delete').map((c) => `${c.realm}/${c.id}`);

/** The realm the state holds, as the library would use it for the next call. */
let currentRealm;
/** The mappings of the tenant, by realm. */
let tenant;
/** The realms the realm list answers. */
let realms;
let realmListFails;
let failingIds;
let failingReads;

const failure = (message, status) => {
  const cause = Object.assign(
    new Error(`Request failed with status code ${status}`),
    { name: 'AxiosError', code: 'ERR_BAD_RESPONSE' }
  );
  return Object.assign(new Error(message), {
    name: 'FrodoError',
    originalErrors: [cause],
    getCombinedMessage: () => `${message}\n  ${cause.message}`,
  });
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    getRealm: () => currentRealm,
    setRealm: (realm) => {
      currentRealm = realm;
    },
  },
  frodo: {
    utils: {
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
      constants: { DEFAULT_REALM_KEY: '__default__realm__' },
    },
    secretStore: {
      updateSecretStoreMapping: async () => ({}),
      readSecretStoreMappings: async (storeId, storeType) => {
        calls.push({ call: 'list', realm: currentRealm, storeId, storeType });
        if (failingReads.has(currentRealm)) {
          throw failure(
            `Error reading secret store mappings for the ${currentRealm} realm`,
            500
          );
        }
        return (tenant[currentRealm] ?? []).map((id) => ({ _id: id }));
      },
      readSecretStoreMapping: async (storeId, storeType, id) => {
        calls.push({ call: 'read', realm: currentRealm, id });
        if (!(tenant[currentRealm] ?? []).includes(id)) {
          throw failure(`Error reading secret store mapping '${id}'`, 404);
        }
        return { _id: id };
      },
      deleteSecretStoreMapping: async (storeId, storeType, id) => {
        calls.push({
          call: 'delete',
          realm: currentRealm,
          id,
          storeId,
          storeType,
        });
        if (failingIds.has(id)) {
          throw failure(`Error deleting the secret store mapping ${id}`, 500);
        }
        if (!(tenant[currentRealm] ?? []).includes(id)) {
          throw failure(`Error deleting the secret store mapping ${id}`, 404);
        }
        tenant[currentRealm] = tenant[currentRealm].filter((m) => m !== id);
        return { _id: id };
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  // like the real one: the message of the caller (when there is one), then the error
  printError: (error, message) => {
    if (message) printed.push({ msg: String(message), type: 'error' });
    printed.push({
      msg: String(error?.getCombinedMessage?.() ?? error?.message ?? error),
      type: 'error',
    });
  },
  verboseMessage: () => {},
}));

jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  realmList: async () => {
    calls.push({ call: 'realms' });
    if (realmListFails) throw failure('Error reading realms', 500);
    return realms;
  },
  fileFilter: () => true,
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: () => {},
}));

const { configManagerDeleteSecretMappings } =
  await import('../../src/configManagerOps/FrConfigSecretMappingsOps.ts');

const DEFAULT_REALM = '__default__realm__';

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  currentRealm = 'alpha';
  realms = ['/', 'alpha', 'bravo'];
  realmListFails = false;
  failingIds = new Set();
  failingReads = new Set();
  tenant = {
    alpha: ['am.one', 'am.two', 'am.three'],
    bravo: ['am.bravo.one'],
  };
});

describe('delete all secret mappings', () => {
  test('every mapping of every realm but the root realm is deleted, each is named with its realm', async () => {
    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false)
    ).toBe(true);

    expect(deletesOf()).toEqual([
      'alpha/am.one',
      'alpha/am.two',
      'alpha/am.three',
      'bravo/am.bravo.one',
    ]);
    // the root realm is never read
    expect(calls.filter((c) => c.call === 'list').map((c) => c.realm)).toEqual([
      'alpha',
      'bravo',
    ]);
    expect(messages(undefined)).toEqual([
      "Deleting secret ID mapping 'am.one' in realm 'alpha'",
      "Deleting secret ID mapping 'am.two' in realm 'alpha'",
      "Deleting secret ID mapping 'am.three' in realm 'alpha'",
      "Deleting secret ID mapping 'am.bravo.one' in realm 'bravo'",
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('the ESV secret store of Google Secret Manager is the one that is read and deleted from', async () => {
    await configManagerDeleteSecretMappings(undefined, 'alpha', false);

    const touched = calls.filter(
      (c) => c.call === 'list' || c.call === 'delete'
    );
    expect(touched.length).toBe(4);
    for (const c of touched) {
      expect(c.storeId).toBe('ESV');
      expect(c.storeType).toBe('GoogleSecretManagerSecretStoreProvider');
    }
  });

  test('a realm that is named is the only one touched', async () => {
    expect(
      await configManagerDeleteSecretMappings(undefined, 'bravo', false)
    ).toBe(true);

    expect(calls.some((c) => c.call === 'realms')).toBe(false);
    expect(deletesOf()).toEqual(['bravo/am.bravo.one']);
  });

  test('a realm without mappings is told so and the other realms go on', async () => {
    tenant = { alpha: [], bravo: ['am.bravo.one'] };

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false)
    ).toBe(true);

    expect(deletesOf()).toEqual(['bravo/am.bravo.one']);
    expect(messages('warn')).toEqual([
      "No secret mappings found to delete in realm 'alpha'.",
    ]);
  });

  test('a tenant without any realm but the root realm has nothing to delete, and says so', async () => {
    realms = ['/'];

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false)
    ).toBe(true);

    expect(deletesOf()).toEqual([]);
    expect(messages('warn')).toEqual([
      'No realms found to delete secret mappings from.',
    ]);
  });

  test('a clean run prints no summary', async () => {
    await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false);

    expect(printed.map((entry) => entry.msg).join('\n')).not.toMatch(
      /failed|exit code/
    );
  });
});

describe('dry run', () => {
  test('sends no delete and lists what would be deleted', async () => {
    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, true)
    ).toBe(true);

    expect(deletesOf()).toEqual([]);
    expect(messages(undefined)).toEqual([
      "Dry run: Deleting secret ID mapping 'am.one' in realm 'alpha'",
      "Dry run: Deleting secret ID mapping 'am.two' in realm 'alpha'",
      "Dry run: Deleting secret ID mapping 'am.three' in realm 'alpha'",
      "Dry run: Deleting secret ID mapping 'am.bravo.one' in realm 'bravo'",
    ]);
  });

  test('the dry run of a named mapping reads the list of the realm, finds the mapping and deletes nothing', async () => {
    expect(
      await configManagerDeleteSecretMappings('am.two', 'alpha', true)
    ).toBe(true);

    expect(calls.map((c) => c.call)).toEqual(['list']);
    expect(messages(undefined)).toEqual([
      "Dry run: Deleting secret ID mapping 'am.two' in realm 'alpha'",
    ]);
  });

  test('a mapping that cannot be deleted does not matter to a dry run', async () => {
    failingIds = new Set(['am.two']);

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, true)
    ).toBe(true);

    expect(messages('error')).toEqual([]);
  });

  test('the dry run of a named mapping that does not exist fails whatever --allow-failures says, and names the mapping and the realm', async () => {
    expect(
      await configManagerDeleteSecretMappings('nosuch', 'alpha', true)
    ).toBe(false);
    expect(
      await configManagerDeleteSecretMappings('nosuch', 'alpha', true, true)
    ).toBe(false);

    expect(calls.map((c) => c.call)).toEqual(['list', 'list']);
    expect(messages('error')).toEqual([
      "Secret mapping 'nosuch' not found in realm 'alpha'.",
      "Secret mapping 'nosuch' not found in realm 'alpha'.",
    ]);
  });
});

describe('delete one secret mapping', () => {
  test('reads the list of the realm first, then deletes the mapping that it lists', async () => {
    expect(
      await configManagerDeleteSecretMappings('am.two', 'alpha', false)
    ).toBe(true);

    expect(calls.map((c) => c.call)).toEqual(['list', 'delete']);
    expect(deletesOf()).toEqual(['alpha/am.two']);
    expect(messages(undefined)).toEqual([
      "Deleting secret ID mapping 'am.two' in realm 'alpha'",
    ]);
  });

  test('the ID is matched exactly and only in the named realm: the mapping of another realm is not deleted', async () => {
    expect(
      await configManagerDeleteSecretMappings('am.bravo.one', 'alpha', false)
    ).toBe(false);

    expect(calls.map((c) => c.call)).toEqual(['list']);
    expect(tenant.bravo).toEqual(['am.bravo.one']);
    expect(messages('error')).toEqual([
      "Secret mapping 'am.bravo.one' not found in realm 'alpha'.",
    ]);
  });

  test('a mapping that does not exist is an error, named with its realm, and the result is false whatever --allow-failures says; nothing is deleted', async () => {
    expect(
      await configManagerDeleteSecretMappings('nosuch', 'alpha', false)
    ).toBe(false);
    expect(
      await configManagerDeleteSecretMappings('nosuch', 'alpha', false, true)
    ).toBe(false);

    expect(messages(undefined)).toEqual([]);
    expect(calls.map((c) => c.call)).toEqual(['list', 'list']);
    expect(messages('error')).toEqual([
      "Secret mapping 'nosuch' not found in realm 'alpha'.",
      "Secret mapping 'nosuch' not found in realm 'alpha'.",
    ]);
  });

  test('a realm without any mapping does not have the named one either: an error, not "nothing to delete"', async () => {
    tenant = { alpha: [] };

    expect(
      await configManagerDeleteSecretMappings('am.two', 'alpha', false)
    ).toBe(false);

    expect(calls.map((c) => c.call)).toEqual(['list']);
    expect(messages('warn')).toEqual([]);
    expect(messages('error')).toEqual([
      "Secret mapping 'am.two' not found in realm 'alpha'.",
    ]);
  });

  test('without a realm the mapping is looked for in every realm but the root realm: deleted where it is, an error where it is not', async () => {
    expect(
      await configManagerDeleteSecretMappings('am.bravo.one', DEFAULT_REALM)
    ).toBe(false);

    expect(deletesOf()).toEqual(['bravo/am.bravo.one']);
    expect(messages('error')).toEqual([
      "Secret mapping 'am.bravo.one' not found in realm 'alpha'.",
    ]);
  });

  test('a mapping that cannot be deleted fails the command, also with --allow-failures it is reported but the result is true: the list was read first', async () => {
    failingIds = new Set(['am.two']);

    expect(
      await configManagerDeleteSecretMappings('am.two', 'alpha', false)
    ).toBe(false);
    expect(calls.map((c) => c.call)).toEqual(['list', 'delete']);
    printed.length = 0;
    expect(
      await configManagerDeleteSecretMappings('am.two', 'alpha', false, true)
    ).toBe(true);
    // with --allow-failures the summary is a warning and says why the exit code stays 0
    expect(messages('warn').join('\n')).toContain(
      '1 of 1 secret mapping failed:\n  - am.two: Request failed with status code 500\nThe exit code stays 0 because --allow-failures was given.'
    );
  });
});

describe('an ID is an ID, never a path', () => {
  // none of these is a mapping: the list is read once, nothing is deleted, the command fails
  test.each([
    ['..'],
    ['%2e%2e'],
    ['.'],
    ['a#b'],
    ['a?b=c'],
    ['../ESV'],
    ['../../x'],
    ['am.two/..'],
    ['am.two/'],
    ['am.two#x'],
    ['AM.TWO'],
    ['Am.X'],
    // strict prefixes of listed ids (am.one, am.two, am.three): an id is matched whole
    ['am'],
    ['am.'],
    ['am.t'],
    ['am.tw'],
    ['am.thre'],
    ['am.on'],
  ])('%j is not a mapping: one list read, no delete, an error', async (id) => {
    for (const [dryRun, allowFailures] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]) {
      calls.length = 0;
      printed.length = 0;

      expect(
        await configManagerDeleteSecretMappings(
          id,
          'alpha',
          dryRun,
          allowFailures
        )
      ).toBe(false);

      expect(calls.map((c) => c.call)).toEqual(['list']);
      expect(messages('error')).toEqual([
        `Secret mapping '${id}' not found in realm 'alpha'.`,
      ]);
    }
    expect(tenant.alpha).toEqual(['am.one', 'am.two', 'am.three']);
  });
});

describe('an empty ID is never "all"', () => {
  test.each([[''], [' '], ['   '], ['\t']])(
    'the ID %j is refused before anything is read or deleted',
    async (name) => {
      expect(
        await configManagerDeleteSecretMappings(name, 'alpha', false)
      ).toBe(false);
      expect(await configManagerDeleteSecretMappings(name, 'alpha', true)).toBe(
        false
      );
      expect(
        await configManagerDeleteSecretMappings(
          name,
          DEFAULT_REALM,
          false,
          true
        )
      ).toBe(false);

      expect(calls).toEqual([]);
      expect(messages('error')).toEqual([
        'The secret mapping ID must not be empty. To delete all secret mappings, leave out the ID.',
        'The secret mapping ID must not be empty. To delete all secret mappings, leave out the ID.',
        'The secret mapping ID must not be empty. To delete all secret mappings, leave out the ID.',
      ]);
    }
  );
});

describe('the root realm has no secret mappings', () => {
  test.each([
    ['all mappings', undefined, false],
    ['a named mapping', 'am.one', false],
    ['a dry run', undefined, true],
  ])(
    'naming it for %s is an error, not a silent success',
    async (_, name, dry) => {
      expect(await configManagerDeleteSecretMappings(name, '/', dry)).toBe(
        false
      );

      expect(calls).toEqual([]);
      expect(messages('error')).toEqual([
        'The root realm has no secret mappings to delete. Name a realm such as alpha, or leave the realm out to use every realm except the root realm.',
      ]);
    }
  );
});

describe('a mapping that cannot be deleted', () => {
  test('does not hide the others, is named by its ID (not by its realm) with the cause, and the result is false', async () => {
    failingIds = new Set(['am.two']);

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false)
    ).toBe(false);

    expect(deletesOf()).toEqual([
      'alpha/am.one',
      'alpha/am.two',
      'alpha/am.three',
      'bravo/am.bravo.one',
    ]);
    expect(messages(undefined)).toEqual([
      "Deleting secret ID mapping 'am.one' in realm 'alpha'",
      "Deleting secret ID mapping 'am.three' in realm 'alpha'",
      "Deleting secret ID mapping 'am.bravo.one' in realm 'bravo'",
    ]);
    expect(messages('error')).toEqual([
      'Error deleting the secret store mapping am.two\n  Request failed with status code 500',
      '1 of 4 secret mappings failed:\n  - am.two: Request failed with status code 500',
    ]);
  });

  test('with --allow-failures the failure is reported and the result is true', async () => {
    failingIds = new Set(['am.two']);

    expect(
      await configManagerDeleteSecretMappings(
        undefined,
        DEFAULT_REALM,
        false,
        true
      )
    ).toBe(true);

    expect(messages('warn').join('\n')).toContain(
      '1 of 4 secret mappings failed:\n  - am.two: Request failed with status code 500\nThe exit code stays 0 because --allow-failures was given.'
    );
  });

  test('two failures are both named', async () => {
    failingIds = new Set(['am.one', 'am.bravo.one']);

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false)
    ).toBe(false);

    const summary = messages('error').at(-1);
    expect(summary).toContain('2 of 4 secret mappings failed:');
    expect(summary).toContain('- am.one:');
    expect(summary).toContain('- am.bravo.one:');
  });
});

describe('a realm whose mappings cannot be read', () => {
  test('does not stop the other realms, is named by its realm, and the result is false', async () => {
    failingReads = new Set(['alpha']);

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false)
    ).toBe(false);

    expect(deletesOf()).toEqual(['bravo/am.bravo.one']);
    expect(messages('error')).toEqual([
      'Error reading secret store mappings for the alpha realm\n  Request failed with status code 500',
      '1 of 2 secret mappings failed:\n  - alpha: Request failed with status code 500',
    ]);
    // alpha was not "empty": it must not be reported as having nothing to delete
    expect(messages('warn')).toEqual([]);
  });

  test('also in a dry run', async () => {
    failingReads = new Set(['alpha']);

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, true)
    ).toBe(false);

    expect(messages(undefined)).toEqual([
      "Dry run: Deleting secret ID mapping 'am.bravo.one' in realm 'bravo'",
    ]);
  });
});

describe('a list of realms that cannot be read', () => {
  test('deletes nothing, fails the command and is not "no realms", whatever --allow-failures says', async () => {
    realmListFails = true;

    expect(
      await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false)
    ).toBe(false);
    expect(
      await configManagerDeleteSecretMappings(
        undefined,
        DEFAULT_REALM,
        false,
        true
      )
    ).toBe(false);

    expect(deletesOf()).toEqual([]);
    expect(messages('error')).toContain('Error reading realms');
    expect(printed.map((entry) => entry.msg)).not.toContain(
      'No realms found to delete secret mappings from.'
    );
  });
});

describe('the realm of the state', () => {
  test("is set for each realm and is the caller's again afterwards", async () => {
    currentRealm = 'charlie';

    await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false);

    expect(currentRealm).toBe('charlie');
    expect(
      calls.filter((c) => c.call === 'delete').map((c) => c.realm)
    ).toEqual(['alpha', 'alpha', 'alpha', 'bravo']);
  });

  test("is the caller's again after a failed run and after a dry run", async () => {
    currentRealm = 'charlie';
    failingReads = new Set(['alpha']);

    await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, false);
    expect(currentRealm).toBe('charlie');

    await configManagerDeleteSecretMappings(undefined, DEFAULT_REALM, true);
    expect(currentRealm).toBe('charlie');
  });
});
