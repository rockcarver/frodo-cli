/**
 * Unit tests for `config-manager delete terms-and-conditions`
 * (configManagerDeleteTermsAndConditions in
 * src/configManagerOps/FrConfigTermsAndConditionsOps.ts), without a tenant. The
 * facade and the console are mocked before the module is imported (the bundled
 * ESM of frodo-lib cannot load under jest's ESM runtime); OperationRun and
 * ErrorCause stay real.
 *
 * All versions live in ONE config entity, `selfservice.terms`, and a version is
 * deleted by writing the entity again without it. The fake tenant below keeps
 * that entity: a write that removes a refused version fails, any other write is
 * kept, so what the tests compare is what the command printed against what is
 * left on the tenant. What these tests guard (decision records 0037, 0040 and
 * 0041): the list that a write is built from changes only after the write
 * succeeded, so a version that cannot be deleted does not take the ones after
 * it along; every version is tried and the failures are summarised; a named
 * version that is not there, and an empty name, are errors; a tenant without
 * terms and conditions has nothing to delete, which is a success; a read that
 * fails is an error whatever --allow-failures says; nothing is written in a dry
 * run.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

// what the tenant holds: the entity, as the writes so far left it
let stored;
let reads;
const writes = [];
let refused;
let readError;

const version = (id) => ({
  version: id,
  createDate: '2026-01-01T00:00:00.000Z',
  termsTranslations: { en: `terms ${id}` },
});
const entity = (...ids) => ({
  _id: 'selfservice.terms',
  active: ids[0],
  versions: ids.map(version),
});
const idsOf = (body) => body.versions.map((entry) => entry.version);

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
      getWorkingDirectory: () => '.',
    },
    idm: {
      config: {
        readConfigEntity: async () => {
          reads++;
          if (readError) throw readError;
          return JSON.parse(JSON.stringify(stored));
        },
        importConfigEntities: async () => {},
        updateConfigEntity: async (id, body) => {
          // the body as it was sent, not as the command may change it later
          const sent = JSON.parse(JSON.stringify(body));
          writes.push(sent);
          const removed = idsOf(stored).filter(
            (entry) => !idsOf(sent).includes(entry)
          );
          for (const entry of removed) {
            if (refused.get(entry) > 0) {
              refused.set(entry, refused.get(entry) - 1);
              throw new Error(`refused ${entry}`);
            }
          }
          stored = sent;
          return sent;
        },
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: () => {},
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
  verboseMessage: (msg) => printed.push({ msg: String(msg), type: 'verbose' }),
}));

const { configManagerDeleteTermsAndConditions } =
  await import('../../src/configManagerOps/FrConfigTermsAndConditionsOps.ts');

/** The answer of a tenant for an entity it does not have, as the library wraps it. */
const notFound = () =>
  Object.assign(new Error('Error reading config entity selfservice.terms'), {
    httpStatus: 404,
    originalErrors: [
      Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 },
      }),
    ],
  });
const httpError = (status) =>
  Object.assign(new Error('Error reading config entity selfservice.terms'), {
    httpStatus: status,
    originalErrors: [
      Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status },
      }),
    ],
  });

const remaining = () => idsOf(stored);

beforeEach(() => {
  printed.length = 0;
  writes.length = 0;
  reads = 0;
  refused = new Map();
  readError = undefined;
  stored = entity('0.0', '0.1', '0.2');
});

describe('delete all versions', () => {
  test('every version is deleted, one write each, and the entity keeps its other fields', async () => {
    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      true
    );

    expect(writes.map(idsOf)).toEqual([['0.1', '0.2'], ['0.2'], []]);
    for (const body of writes) {
      expect(body._id).toBe('selfservice.terms');
      expect(body.active).toBe('0.0');
    }
    expect(remaining()).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Deleting terms and conditions version: 0.0',
      'Deleting terms and conditions version: 0.1',
      'Deleting terms and conditions version: 0.2',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('the versions that stay are sent as they were read', async () => {
    await configManagerDeleteTermsAndConditions(undefined, false);

    expect(writes[0].versions).toEqual([version('0.1'), version('0.2')]);
  });

  test('a version that cannot be deleted is named, the result is false, and the versions after it are still deleted', async () => {
    refused.set('0.1', Infinity);

    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      false
    );

    // 0.2 is deleted with 0.1 still in the list that is sent
    expect(writes.map(idsOf)).toEqual([['0.1', '0.2'], ['0.2'], ['0.1']]);
    expect(remaining()).toEqual(['0.1']);
    expect(messages(undefined)).toEqual([
      'Deleting terms and conditions version: 0.0',
      'Deleting terms and conditions version: 0.2',
    ]);
    const errors = messages('error').join('\n');
    expect(errors).toContain(
      'Error deleting terms and conditions version 0.1 refused 0.1'
    );
    expect(errors).toContain('1 of 3 versions failed:\n  - 0.1: refused 0.1');
  });

  test('a write that failed once does not remove its version with a later write, and the report matches the tenant', async () => {
    refused.set('0.1', 1);

    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      false
    );

    // the last write must still carry 0.1: it was reported as not deleted
    expect(writes.map(idsOf)).toEqual([['0.1', '0.2'], ['0.2'], ['0.1']]);
    expect(remaining()).toEqual(['0.1']);
    expect(messages('error').join('\n')).toContain(
      '1 of 3 versions failed:\n  - 0.1: refused 0.1'
    );
  });

  test('when every write is refused each version is tried on its own and each is named', async () => {
    refused.set('0.0', Infinity);
    refused.set('0.1', Infinity);
    refused.set('0.2', Infinity);

    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      false
    );

    expect(writes.map(idsOf)).toEqual([
      ['0.1', '0.2'],
      ['0.0', '0.2'],
      ['0.0', '0.1'],
    ]);
    expect(remaining()).toEqual(['0.0', '0.1', '0.2']);
    expect(messages(undefined)).toEqual([]);
    expect(messages('error').join('\n')).toContain(
      '3 of 3 versions failed:\n  - 0.0: refused 0.0\n  - 0.1: refused 0.1\n  - 0.2: refused 0.2'
    );
  });

  test('the summary counts versions, in the singular for one', async () => {
    stored = entity('0.0');
    refused.set('0.0', Infinity);

    await configManagerDeleteTermsAndConditions(undefined, false);

    expect(messages('error').join('\n')).toContain(
      '1 of 1 version failed:\n  - 0.0: refused 0.0'
    );
  });
});

describe('--allow-failures', () => {
  test('a version that cannot be deleted is still summarised, and the result is true', async () => {
    refused.set('0.1', Infinity);

    expect(
      await configManagerDeleteTermsAndConditions(undefined, false, true)
    ).toBe(true);

    expect(remaining()).toEqual(['0.1']);
    expect(messages('warn').join('\n')).toContain(
      '1 of 3 versions failed:\n  - 0.1: refused 0.1\nThe exit code stays 0 because --allow-failures was given.'
    );
    expect(messages('error').join('\n')).toContain(
      'Error deleting terms and conditions version 0.1'
    );
  });

  test('a read that fails stays a failure', async () => {
    readError = httpError(500);

    expect(
      await configManagerDeleteTermsAndConditions(undefined, false, true)
    ).toBe(false);

    expect(writes).toEqual([]);
  });

  test('a named version that does not exist stays a failure', async () => {
    expect(
      await configManagerDeleteTermsAndConditions('9.9', false, true)
    ).toBe(false);
  });
});

describe('a read that fails', () => {
  test('is reported, nothing is written, and the result is false', async () => {
    readError = new Error('read refused');

    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      false
    );

    expect(writes).toEqual([]);
    expect(messages('error')).toEqual([
      'Error deleting terms and conditions versions read refused',
    ]);
  });

  test.each([401, 403, 500])(
    'with the status %i is not taken for a tenant without terms and conditions',
    async (status) => {
      readError = httpError(status);

      expect(
        await configManagerDeleteTermsAndConditions(undefined, false)
      ).toBe(false);
      expect(await configManagerDeleteTermsAndConditions(undefined, true)).toBe(
        false
      );
      expect(await configManagerDeleteTermsAndConditions('0.1', false)).toBe(
        false
      );

      expect(writes).toEqual([]);
    }
  );

  test('a network error without a status is a failure too', async () => {
    readError = Object.assign(new Error('connect ECONNREFUSED'), {
      originalErrors: [new Error('connect ECONNREFUSED')],
    });

    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      false
    );
  });
});

describe('a named version', () => {
  test('only that version is deleted, and the others are sent as they were', async () => {
    expect(await configManagerDeleteTermsAndConditions('0.1', false)).toBe(
      true
    );

    expect(writes.map(idsOf)).toEqual([['0.0', '0.2']]);
    expect(writes[0].active).toBe('0.0');
    expect(remaining()).toEqual(['0.0', '0.2']);
    expect(messages(undefined)).toEqual([
      'Deleting terms and conditions version: 0.1',
    ]);
  });

  test('a version that does not exist is an error and nothing is written', async () => {
    expect(await configManagerDeleteTermsAndConditions('9.9', false)).toBe(
      false
    );

    expect(writes).toEqual([]);
    expect(messages('error')).toEqual([
      "Terms and conditions version '9.9' not found.",
    ]);
    expect(messages('warn')).toEqual([]);
  });

  test('the name must match exactly, not as a prefix', async () => {
    expect(await configManagerDeleteTermsAndConditions('0', false)).toBe(false);

    expect(writes).toEqual([]);
    expect(messages('error')).toEqual([
      "Terms and conditions version '0' not found.",
    ]);
  });

  test('the dry run of a version that does not exist is an error too', async () => {
    expect(await configManagerDeleteTermsAndConditions('9.9', true)).toBe(
      false
    );

    expect(writes).toEqual([]);
    expect(messages('error')).toEqual([
      "Terms and conditions version '9.9' not found.",
    ]);
  });

  test('a version that cannot be deleted is an error', async () => {
    refused.set('0.1', Infinity);

    expect(await configManagerDeleteTermsAndConditions('0.1', false)).toBe(
      false
    );

    expect(remaining()).toEqual(['0.0', '0.1', '0.2']);
    expect(messages('error').join('\n')).toContain(
      '1 of 1 version failed:\n  - 0.1: refused 0.1'
    );
  });

  test('a name on a tenant without versions is an error', async () => {
    stored = entity();

    expect(await configManagerDeleteTermsAndConditions('0.1', false)).toBe(
      false
    );

    expect(messages('error')).toEqual([
      "Terms and conditions version '0.1' not found.",
    ]);
  });
});

describe('an empty name', () => {
  test('is an error, not "all": nothing is read and nothing is written', async () => {
    expect(await configManagerDeleteTermsAndConditions('', false)).toBe(false);

    expect(reads).toBe(0);
    expect(writes).toEqual([]);
    expect(remaining()).toEqual(['0.0', '0.1', '0.2']);
    expect(messages('error')).toEqual([
      'The terms and conditions version must not be empty.',
    ]);
    expect(messages(undefined)).toEqual([]);
  });

  test('is an error in a dry run too', async () => {
    expect(await configManagerDeleteTermsAndConditions('', true)).toBe(false);

    expect(reads).toBe(0);
    expect(messages(undefined)).toEqual([]);
  });

  test('is an error with --allow-failures', async () => {
    expect(await configManagerDeleteTermsAndConditions('', false, true)).toBe(
      false
    );

    expect(writes).toEqual([]);
  });
});

describe('nothing to delete', () => {
  test('a tenant with an empty list of versions is told so and it is a success', async () => {
    stored = entity();

    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      true
    );

    expect(writes).toEqual([]);
    expect(messages(undefined)).toEqual([
      'No terms and conditions versions found to delete.',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('an entity without a list of versions is the same', async () => {
    stored = { _id: 'selfservice.terms', active: '0.0' };

    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      true
    );

    expect(writes).toEqual([]);
    expect(messages(undefined)).toEqual([
      'No terms and conditions versions found to delete.',
    ]);
  });

  test('the dry run says so too', async () => {
    stored = entity();

    expect(await configManagerDeleteTermsAndConditions(undefined, true)).toBe(
      true
    );

    expect(messages(undefined)).toEqual([
      'No terms and conditions versions found to delete.',
    ]);
  });
});

describe('a tenant that has no terms and conditions at all', () => {
  beforeEach(() => {
    readError = notFound();
  });

  test('has nothing to delete, which is a success', async () => {
    expect(await configManagerDeleteTermsAndConditions(undefined, false)).toBe(
      true
    );

    expect(writes).toEqual([]);
    expect(messages(undefined)).toEqual([
      'No terms and conditions versions found to delete.',
    ]);
    expect(messages('error')).toEqual([]);
    expect(messages('verbose')).toEqual([
      'The tenant has no terms and conditions configured.',
    ]);
  });

  test('the dry run is a success too', async () => {
    expect(await configManagerDeleteTermsAndConditions(undefined, true)).toBe(
      true
    );

    expect(messages('error')).toEqual([]);
  });

  test('a named version is not there, which is an error', async () => {
    expect(await configManagerDeleteTermsAndConditions('0.1', false)).toBe(
      false
    );

    expect(writes).toEqual([]);
    expect(messages('error')).toEqual([
      "Terms and conditions version '0.1' not found.",
    ]);
  });
});

describe('dry run', () => {
  test('writes nothing and lists what would be deleted', async () => {
    expect(await configManagerDeleteTermsAndConditions(undefined, true)).toBe(
      true
    );

    expect(writes).toEqual([]);
    expect(remaining()).toEqual(['0.0', '0.1', '0.2']);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting terms and conditions version: 0.0',
      'Dry run: Deleting terms and conditions version: 0.1',
      'Dry run: Deleting terms and conditions version: 0.2',
    ]);
  });

  test('of one version writes nothing and names only that version', async () => {
    expect(await configManagerDeleteTermsAndConditions('0.1', true)).toBe(true);

    expect(writes).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting terms and conditions version: 0.1',
    ]);
  });
});
