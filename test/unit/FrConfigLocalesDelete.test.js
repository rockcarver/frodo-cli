/**
 * Unit tests for `config-manager delete locales` (configManagerDeleteLocales in
 * src/configManagerOps/FrConfigLocalesOps.ts), without a tenant. The facade and
 * the console are mocked before the module is imported (the bundled ESM of
 * frodo-lib cannot load under jest's ESM runtime); OperationRun and ErrorCause
 * stay real. The recorded end-to-end replay cannot notice that no request was
 * sent, so what is deleted is asserted on the delete calls that reach the
 * (mocked) library.
 *
 * What these tests guard (cli records 0037, 0040 and 0041): a locale is the
 * config entity `uilocale/<name>` and nothing else is selected (the library
 * query matches every id that starts with `uilocale`, with or without the
 * slash); an empty name never means "all"; a named locale that does not exist is
 * an error; a locale that cannot be deleted does not hide the others, is named
 * with the cause, and is counted in one summary; a listing that fails deletes
 * nothing, whatever --allow-failures says; a dry run sends no delete.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

/** The ids that reached the (mocked) delete of the library, in order. */
const deleted = [];
/** The types the entities were listed for. */
const listed = [];
let entities = [];
let failingIds = new Set();
// what the listing does: 'ok' answers `entities`, 'fail' rejects, anything else
// (undefined, null, an object, a string) is answered as it is
let listing = 'ok';

const locale = (name) => ({ _id: `uilocale/${name}`, locale: name });

/** The error the pinned library lets through for a failed delete: a raw HTTP error that names no locale. */
const httpError = (status) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    name: 'AxiosError',
    code: 'ERR_BAD_RESPONSE',
  });

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
      getWorkingDirectory: () => '/nowhere',
    },
    idm: {
      config: {
        readConfigEntitiesByType: async (type) => {
          listed.push(type);
          if (listing === 'fail') {
            throw Object.assign(new Error('listing refused'), {
              name: 'FrodoError',
              getCombinedMessage: () => 'listing refused',
            });
          }
          return listing === 'ok' ? entities : listing;
        },
        importConfigEntities: async () => {},
        deleteConfigEntity: async (id) => {
          if (failingIds.has(id)) throw httpError(500);
          deleted.push(id);
          return {};
        },
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
}));

const { configManagerDeleteLocales } =
  await import('../../src/configManagerOps/FrConfigLocalesOps.ts');

beforeEach(() => {
  printed.length = 0;
  deleted.length = 0;
  listed.length = 0;
  listing = 'ok';
  failingIds = new Set();
  entities = [locale('en'), locale('fr'), locale('ko')];
});

describe('delete all locales', () => {
  test('every locale is deleted, in the order of the listing, and each is named', async () => {
    expect(await configManagerDeleteLocales(undefined, false)).toBe(true);

    expect(listed).toEqual(['uilocale']);
    expect(deleted).toEqual(['uilocale/en', 'uilocale/fr', 'uilocale/ko']);
    expect(messages(undefined)).toEqual([
      'Deleting uilocale: en',
      'Deleting uilocale: fr',
      'Deleting uilocale: ko',
    ]);
    expect(messages('error')).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('a tenant without locales is told so and it is not an error', async () => {
    entities = [];

    expect(await configManagerDeleteLocales(undefined, false)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages('warn')).toEqual(['No locales found to delete.']);
    expect(messages('error')).toEqual([]);
  });

  test('a clean run prints no summary', async () => {
    await configManagerDeleteLocales(undefined, false);

    expect(printed.map((entry) => entry.msg).join('\n')).not.toMatch(
      /failed|exit code/
    );
  });
});

describe('only entities of the form uilocale/<name> are locales', () => {
  beforeEach(() => {
    // the library lists every id that starts with `uilocale`, slash or not
    entities = [
      locale('en'),
      { _id: 'uilocaleExtra/foo' },
      { _id: 'uilocale' },
      { _id: 'uilocales/fr' },
      locale('fr'),
    ];
  });

  test('delete all deletes the locales and nothing else', async () => {
    expect(await configManagerDeleteLocales(undefined, false)).toBe(true);

    expect(deleted).toEqual(['uilocale/en', 'uilocale/fr']);
    expect(messages(undefined)).toEqual([
      'Deleting uilocale: en',
      'Deleting uilocale: fr',
    ]);
  });

  test('the dry run names the locales and nothing else', async () => {
    expect(await configManagerDeleteLocales(undefined, true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting uilocale: en',
      'Dry run: Deleting uilocale: fr',
    ]);
  });

  test('a name does not select an entity that only starts like a locale', async () => {
    expect(await configManagerDeleteLocales('Extra/foo', false)).toBe(false);
    expect(await configManagerDeleteLocales('s/fr', false)).toBe(false);
    expect(await configManagerDeleteLocales('', false)).toBe(false);

    expect(deleted).toEqual([]);
  });

  test('a tenant whose entities are all of that other kind has no locales', async () => {
    entities = [{ _id: 'uilocaleExtra/foo' }, { _id: 'uilocale' }];

    expect(await configManagerDeleteLocales(undefined, false)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages('warn')).toEqual(['No locales found to delete.']);
  });
});

describe('dry run', () => {
  test('sends no delete and lists what would be deleted', async () => {
    expect(await configManagerDeleteLocales(undefined, true)).toBe(true);

    expect(listed).toEqual(['uilocale']);
    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting uilocale: en',
      'Dry run: Deleting uilocale: fr',
      'Dry run: Deleting uilocale: ko',
    ]);
  });

  test('a tenant without locales is told so', async () => {
    entities = [];

    expect(await configManagerDeleteLocales(undefined, true)).toBe(true);

    expect(messages('warn')).toEqual(['No locales found to delete.']);
  });

  test('the dry run of a named locale deletes nothing', async () => {
    expect(await configManagerDeleteLocales('fr', true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual(['Dry run: Deleting uilocale: fr']);
  });

  test('a locale that cannot be deleted does not matter to a dry run', async () => {
    failingIds = new Set(['uilocale/fr']);

    expect(await configManagerDeleteLocales(undefined, true)).toBe(true);

    expect(messages('error')).toEqual([]);
  });
});

describe('a listing that fails deletes nothing', () => {
  test('the command fails, nothing is deleted and the reason is shown', async () => {
    listing = 'fail';

    expect(await configManagerDeleteLocales(undefined, false)).toBe(false);

    expect(listed).toEqual(['uilocale']);
    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual([
      'Error deleting config entity locales',
      'listing refused',
    ]);
    expect(messages(undefined)).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test.each([
    ['answers undefined', undefined],
    ['answers null', null],
    ['answers an object', { result: [] }],
    ['answers a string', '<html>oops</html>'],
  ])('a listing that %s fails the command and deletes nothing', async (_, answer) => {
    listing = answer;

    expect(await configManagerDeleteLocales(undefined, false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).not.toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('also with --allow-failures, for all locales and for a named one, and not as "no locales"', async () => {
    listing = 'fail';

    expect(await configManagerDeleteLocales(undefined, false, true)).toBe(
      false
    );
    expect(await configManagerDeleteLocales('en', false, true)).toBe(false);

    expect(deleted).toEqual([]);
    expect(printed.map((entry) => entry.msg)).not.toContain(
      'No locales found to delete.'
    );
  });

  test('the dry run of a listing that fails fails too', async () => {
    listing = 'fail';

    expect(await configManagerDeleteLocales(undefined, true)).toBe(false);
  });
});

describe('a locale that cannot be deleted', () => {
  test('does not hide the others, is named with its cause, and the result is false', async () => {
    failingIds = new Set(['uilocale/fr']);

    expect(await configManagerDeleteLocales(undefined, false)).toBe(false);

    expect(deleted).toEqual(['uilocale/en', 'uilocale/ko']);
    expect(messages(undefined)).toEqual([
      'Deleting uilocale: en',
      'Deleting uilocale: ko',
    ]);
    const errors = messages('error');
    // the error of the library names no locale, so the line before it does
    expect(errors[0]).toBe('Error deleting uilocale fr');
    expect(errors[1]).toBe('Request failed with status code 500');
    expect(errors).toHaveLength(3);
    expect(errors[2]).toBe(
      '1 of 3 locales failed:\n  - fr: Request failed with status code 500'
    );
  });

  test('the failed locale is not reported as deleted', async () => {
    failingIds = new Set(['uilocale/en']);

    await configManagerDeleteLocales(undefined, false);

    expect(messages(undefined)).not.toContain('Deleting uilocale: en');
    expect(deleted).not.toContain('uilocale/en');
  });

  test('--allow-failures keeps the result true, still names the locale and says why', async () => {
    failingIds = new Set(['uilocale/fr']);

    expect(await configManagerDeleteLocales(undefined, false, true)).toBe(true);

    expect(deleted).toEqual(['uilocale/en', 'uilocale/ko']);
    expect(messages('error')).toEqual([
      'Error deleting uilocale fr',
      'Request failed with status code 500',
    ]);
    expect(messages('warn')).toEqual([
      '1 of 3 locales failed:\n  - fr: Request failed with status code 500\nThe exit code stays 0 because --allow-failures was given.',
    ]);
  });

  test('without --allow-failures the result is false, and a false flag is not a true one', async () => {
    failingIds = new Set(['uilocale/en']);

    expect(await configManagerDeleteLocales(undefined, false, false)).toBe(
      false
    );
    expect(messages('warn')).toEqual([]);
  });

  test('every locale that cannot be deleted is named', async () => {
    failingIds = new Set(['uilocale/en', 'uilocale/fr', 'uilocale/ko']);

    expect(await configManagerDeleteLocales(undefined, false)).toBe(false);

    expect(deleted).toEqual([]);
    const summary = messages('error').find((text) => /^3 of 3/.test(text));
    expect(summary).toContain('  - en: Request failed with status code 500');
    expect(summary).toContain('  - fr: Request failed with status code 500');
    expect(summary).toContain('  - ko: Request failed with status code 500');
  });

  test('one that cannot be deleted by name is an error and is named once in the summary', async () => {
    failingIds = new Set(['uilocale/fr']);

    expect(await configManagerDeleteLocales('fr', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error').join('\n')).toContain('Error deleting uilocale fr');
    expect(messages('error').at(-1)).toBe(
      '1 of 1 locale failed:\n  - fr: Request failed with status code 500'
    );
  });
});

describe('one locale by name', () => {
  test('only that locale is deleted', async () => {
    expect(await configManagerDeleteLocales('fr', false)).toBe(true);

    expect(deleted).toEqual(['uilocale/fr']);
    expect(messages(undefined)).toEqual(['Deleting uilocale: fr']);
  });

  test('the name must match exactly: not a prefix, not another case', async () => {
    expect(await configManagerDeleteLocales('f', false)).toBe(false);
    expect(await configManagerDeleteLocales('FR', false)).toBe(false);
    expect(await configManagerDeleteLocales('fr ', false)).toBe(false);
    expect(await configManagerDeleteLocales('uilocale/fr', false)).toBe(false);

    expect(deleted).toEqual([]);
  });

  test('a locale that does not exist is an error and nothing is deleted', async () => {
    expect(await configManagerDeleteLocales('zz', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Locale 'zz' not found."]);
    expect(messages(undefined)).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('a locale that does not exist is an error also with --allow-failures', async () => {
    expect(await configManagerDeleteLocales('zz', false, true)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Locale 'zz' not found."]);
  });

  test('the dry run of a locale that does not exist is an error too', async () => {
    expect(await configManagerDeleteLocales('zz', true)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Locale 'zz' not found."]);
  });

  test('a tenant without locales does not have the named one either', async () => {
    entities = [];

    expect(await configManagerDeleteLocales('en', false)).toBe(false);

    expect(messages('error')).toEqual(["Locale 'en' not found."]);
    expect(messages('warn')).toEqual([]);
  });
});

describe('an empty name is not "all"', () => {
  test.each([[''], ['  '], ['\t']])(
    'the name %j is an error, nothing is read and nothing is deleted',
    async (name) => {
      expect(await configManagerDeleteLocales(name, false)).toBe(false);

      expect(listed).toEqual([]);
      expect(deleted).toEqual([]);
      expect(messages('error')).toEqual([
        'The locale name must not be empty. To delete all locales, leave out the name.',
      ]);
      expect(messages(undefined)).toEqual([]);
    }
  );

  test('also in a dry run and with --allow-failures', async () => {
    expect(await configManagerDeleteLocales('', true)).toBe(false);
    expect(await configManagerDeleteLocales('', false, true)).toBe(false);

    expect(listed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([]);
  });

  test('no name at all (undefined) is still all locales', async () => {
    expect(await configManagerDeleteLocales(undefined, false)).toBe(true);

    expect(deleted).toEqual(['uilocale/en', 'uilocale/fr', 'uilocale/ko']);
  });
});

describe('the plan shown before the question is the dry run of all locales', () => {
  test('it names every locale and deletes nothing', async () => {
    expect(await configManagerDeleteLocales(undefined, true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting uilocale: en',
      'Dry run: Deleting uilocale: fr',
      'Dry run: Deleting uilocale: ko',
    ]);
  });
});
