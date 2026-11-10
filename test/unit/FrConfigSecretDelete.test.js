/**
 * Unit tests for `config-manager delete secrets` (configManagerDeleteSecrets
 * and showSecretDeletePlan in src/configManagerOps/FrConfigSecretOps.ts),
 * without a tenant. The facade and the console are mocked before the module is
 * imported (the bundled ESM of frodo-lib cannot load under jest's ESM runtime);
 * OperationRun stays real. Deleting a secret destroys its values for good, so
 * what these tests guard is what makes the command safe: a listing that fails
 * or has an unexpected shape deletes nothing (the same as "no secrets" would be
 * a success and a wrong one), an empty name never selects every secret, a named
 * secret that does not exist is an error, nothing is deleted in a dry run, and
 * one secret that cannot be deleted does not hide the others (cli records 0040
 * and 0041).
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

const deleted = [];
let listed = 0;
let secrets = [];
let failingIds = new Set();
// what the listing does: 'ok' answers `secrets`, 'fail' rejects, anything else
// (undefined, null, an object, a string) is answered as it is
let listing = 'ok';

const secret = (id) => ({ _id: id, activeVersion: '1', loaded: false });

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
    },
    cloud: {
      secret: {
        readSecrets: async () => {
          listed++;
          if (listing === 'fail') throw new Error('listing refused');
          return listing === 'ok' ? secrets : listing;
        },
        createSecret: async () => ({}),
        createVersionOfSecret: async () => ({}),
        readVersionsOfSecret: async () => [],
        pruneVersionsOfSecret: async () => [],
        deleteSecret: async (id) => {
          if (failingIds.has(id)) throw new Error(`refused ${id}`);
          deleted.push(id);
          return {};
        },
      },
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
  updateProgressIndicator: () => {},
}));

jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  csvEscape: (value) => value,
  esvToEnv: (value) => value,
  friendlyTimestamp: () => 'now',
}));

const { configManagerDeleteSecrets, showSecretDeletePlan } =
  await import('../../src/configManagerOps/FrConfigSecretOps.ts');

beforeEach(() => {
  printed.length = 0;
  deleted.length = 0;
  listed = 0;
  listing = 'ok';
  failingIds = new Set();
  secrets = [secret('esv-a'), secret('esv-b'), secret('esv-c')];
});

describe('delete all secrets', () => {
  test('every secret is deleted, in the order of the listing, and each is named', async () => {
    expect(await configManagerDeleteSecrets(undefined, false)).toBe(true);

    expect(deleted).toEqual(['esv-a', 'esv-b', 'esv-c']);
    expect(messages(undefined)).toEqual([
      'Deleted secret: esv-a',
      'Deleted secret: esv-b',
      'Deleted secret: esv-c',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('a tenant without secrets is told so and it is not an error', async () => {
    secrets = [];

    expect(await configManagerDeleteSecrets(undefined, false)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual(['No secrets found to delete.']);
    expect(messages('error')).toEqual([]);
  });
});

describe('dry run', () => {
  test('sends no delete and lists what would be deleted', async () => {
    expect(await configManagerDeleteSecrets(undefined, true)).toBe(true);

    expect(listed).toBe(1);
    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting secret: esv-a',
      'Dry run: Deleting secret: esv-b',
      'Dry run: Deleting secret: esv-c',
    ]);
  });

  test('a tenant without secrets is told so', async () => {
    secrets = [];

    expect(await configManagerDeleteSecrets(undefined, true)).toBe(true);

    expect(messages(undefined)).toEqual(['No secrets found to delete.']);
  });

  test('the dry run of a named secret deletes nothing', async () => {
    expect(await configManagerDeleteSecrets('esv-b', true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual(['Dry run: Deleting secret: esv-b']);
  });
});

describe('a listing that fails deletes nothing', () => {
  test.each([
    ['rejects', 'fail'],
    ['answers undefined', undefined],
    ['answers null', null],
    ['answers an object', { result: [] }],
    ['answers a string', '<html>oops</html>'],
  ])(
    'a listing that %s: the command fails and nothing is deleted',
    async (_, answer) => {
      listing = answer;

      expect(await configManagerDeleteSecrets(undefined, false)).toBe(false);

      expect(listed).toBe(1);
      expect(deleted).toEqual([]);
      expect(messages('error')).not.toEqual([]);
      expect(messages(undefined)).toEqual([]);
    }
  );

  test.each([
    ['rejects', 'fail'],
    ['answers undefined', undefined],
    ['answers null', null],
  ])(
    'a listing that %s fails the command also with --allow-failures, and not as "no secrets"',
    async (_, answer) => {
      listing = answer;

      expect(await configManagerDeleteSecrets(undefined, false, true)).toBe(
        false
      );
      expect(await configManagerDeleteSecrets('esv-a', false, true)).toBe(
        false
      );

      expect(deleted).toEqual([]);
      expect(printed.map((entry) => entry.msg)).not.toContain(
        'No secrets found to delete.'
      );
    }
  );

  test('the reason of a listing that fails is shown', async () => {
    listing = 'fail';

    await configManagerDeleteSecrets(undefined, false);

    expect(messages('error')).toEqual(['listing refused']);
  });

  test('the dry run of a listing that fails fails too', async () => {
    listing = 'fail';

    expect(await configManagerDeleteSecrets(undefined, true)).toBe(false);
  });
});

describe('a secret that cannot be deleted', () => {
  test('does not hide the others, is named, and the result is false', async () => {
    failingIds = new Set(['esv-b']);

    expect(await configManagerDeleteSecrets(undefined, false)).toBe(false);

    expect(deleted).toEqual(['esv-a', 'esv-c']);
    expect(messages(undefined)).toEqual([
      'Deleted secret: esv-a',
      'Deleted secret: esv-c',
    ]);
    const errors = messages('error');
    expect(errors).toContain('Failed to delete secret esv-b refused esv-b');
    const summary = errors.find(
      (text) => /failed/.test(text) && /^1 of 3/.test(text)
    );
    expect(summary).toBe('1 of 3 secrets failed:\n  - esv-b: refused esv-b');
  });

  test('--allow-failures keeps the result true, still names the secret and says why', async () => {
    failingIds = new Set(['esv-b']);

    expect(await configManagerDeleteSecrets(undefined, false, true)).toBe(true);

    expect(deleted).toEqual(['esv-a', 'esv-c']);
    expect(messages('error')).toEqual([
      'Failed to delete secret esv-b refused esv-b',
    ]);
    expect(messages('warn')).toEqual([
      '1 of 3 secrets failed:\n  - esv-b: refused esv-b\nThe exit code stays 0 because --allow-failures was given.',
    ]);
  });

  test('without --allow-failures the result is false, and a false flag is not a true one', async () => {
    failingIds = new Set(['esv-a']);

    expect(await configManagerDeleteSecrets(undefined, false, false)).toBe(
      false
    );
    expect(messages('warn')).toEqual([]);
  });

  test('every secret that cannot be deleted is named', async () => {
    failingIds = new Set(['esv-a', 'esv-b', 'esv-c']);

    expect(await configManagerDeleteSecrets(undefined, false)).toBe(false);

    expect(deleted).toEqual([]);
    const summary = messages('error').find((text) => /^3 of 3/.test(text));
    expect(summary).toContain('  - esv-a: refused esv-a');
    expect(summary).toContain('  - esv-b: refused esv-b');
    expect(summary).toContain('  - esv-c: refused esv-c');
  });

  test('one that cannot be deleted by name is an error', async () => {
    failingIds = new Set(['esv-b']);

    expect(await configManagerDeleteSecrets('esv-b', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error').join('\n')).toContain('refused esv-b');
  });
});

describe('one secret by name', () => {
  test('only that secret is deleted', async () => {
    expect(await configManagerDeleteSecrets('esv-b', false)).toBe(true);

    expect(deleted).toEqual(['esv-b']);
    expect(messages(undefined)).toEqual(['Deleted secret: esv-b']);
  });

  test('the name must match exactly: not a prefix, not another case', async () => {
    expect(await configManagerDeleteSecrets('esv', false)).toBe(false);
    expect(await configManagerDeleteSecrets('ESV-A', false)).toBe(false);
    expect(await configManagerDeleteSecrets('esv-a ', false)).toBe(false);

    expect(deleted).toEqual([]);
  });

  test('a secret that does not exist is an error and nothing is deleted', async () => {
    expect(await configManagerDeleteSecrets('nope', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Secret 'nope' not found."]);
    expect(messages(undefined)).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('a secret that does not exist is an error also with --allow-failures', async () => {
    expect(await configManagerDeleteSecrets('nope', false, true)).toBe(false);

    expect(messages('error')).toEqual(["Secret 'nope' not found."]);
  });

  test('the dry run of a secret that does not exist is an error too', async () => {
    expect(await configManagerDeleteSecrets('nope', true)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Secret 'nope' not found."]);
  });

  test('a tenant without secrets does not have the named one either', async () => {
    secrets = [];

    expect(await configManagerDeleteSecrets('esv-a', false)).toBe(false);

    expect(messages('error')).toEqual(["Secret 'esv-a' not found."]);
    expect(messages(undefined)).toEqual([]);
  });
});

describe('an empty name is not "all"', () => {
  test.each([[''], ['  '], ['\t']])(
    'the name %j is an error, nothing is read and nothing is deleted',
    async (name) => {
      expect(await configManagerDeleteSecrets(name, false)).toBe(false);

      expect(listed).toBe(0);
      expect(deleted).toEqual([]);
      expect(messages('error')).toEqual([
        'The secret name must not be empty. To delete all secrets, leave out the name.',
      ]);
    }
  );

  test('also in a dry run and with --allow-failures', async () => {
    expect(await configManagerDeleteSecrets('', true)).toBe(false);
    expect(await configManagerDeleteSecrets('', false, true)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([]);
  });

  test('no name at all (undefined) is still all secrets', async () => {
    expect(await configManagerDeleteSecrets(undefined, false)).toBe(true);

    expect(deleted).toEqual(['esv-a', 'esv-b', 'esv-c']);
  });
});

describe('the plan shown before the question', () => {
  test('names every secret, says how many there are and that the values are lost, and deletes nothing', async () => {
    expect(await showSecretDeletePlan()).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting secret: esv-a',
      'Dry run: Deleting secret: esv-b',
      'Dry run: Deleting secret: esv-c',
    ]);
    expect(messages('warn')).toEqual([
      '3 secrets would be deleted. The values of a deleted secret cannot be recovered.',
    ]);
  });

  test('says "1 secret" for one', async () => {
    secrets = [secret('esv-a')];

    await showSecretDeletePlan();

    expect(messages('warn')).toEqual([
      '1 secret would be deleted. The values of a deleted secret cannot be recovered.',
    ]);
  });

  test('a tenant without secrets is told so and there is no warning', async () => {
    secrets = [];

    expect(await showSecretDeletePlan()).toBe(true);

    expect(messages(undefined)).toEqual(['No secrets found to delete.']);
    expect(messages('warn')).toEqual([]);
  });

  test.each([
    ['rejects', 'fail'],
    ['answers undefined', undefined],
    ['answers null', null],
  ])(
    'a listing that %s fails the plan, so the question is not asked',
    async (_, answer) => {
      listing = answer;

      expect(await showSecretDeletePlan()).toBe(false);

      expect(deleted).toEqual([]);
      expect(messages('error')).not.toEqual([]);
      expect(messages('warn')).toEqual([]);
    }
  );
});
