import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `config-manager pull connector-mappings` on a tenant that has no sync configuration at all.
 *
 * The mappings live in one configuration entity, `sync`. A tenant that never had a mapping does not
 * have it, and the server answers the read with 404. That is "no mappings", which the step already
 * says for an empty list, and it must not fail `pull all` (decision record 0041: nothing to do is
 * success; a named item that does not exist fails whatever the flag says). Every other error still
 * fails: a refused request or a server error is not "nothing there". A 404 from anything else than
 * the read of `sync` (the read of the application ownership of a tree that uses the application
 * layout) is not covered by this rule.
 *
 * The library is a stub; the run tracker (OperationRun) and the error helper (ErrorCause) are real.
 */

const readConfigEntity = jest.fn();
const saveJsonToFile = jest.fn();
const printError = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
const skipsOwnedObjects = jest.fn(() => false);
const loadAllRealms = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    idm: {
      config: {
        readConfigEntity,
        importConfigEntities: jest.fn(),
        importSubConfigEntity: jest.fn(),
      },
    },
    utils: {
      getFilePath: (file) => `out/${file}`,
      saveJsonToFile,
      readJsonFile: jest.fn(),
      getWorkingDirectory: () => '.',
    },
  },
  state: {},
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/ApplicationOwnedObjects', () => ({
  objectNameInFile: jest.fn(),
  ownedObjectMessage: jest.fn(),
  skipsOwnedObjects,
  OwnedObjects: class {
    loadAllRealms = loadAllRealms;
    ownersInAnyRealm = () => [];
  },
}));

const { configManagerExportMappings } =
  await import('../../src/configManagerOps/FrConfigConnectorMappingOps');

/** What the library throws for a read that the server answered with `status`. */
const readError = (status) =>
  Object.assign(new Error('Error reading config entity sync'), {
    name: 'FrodoError',
    httpStatus: status,
    originalErrors: [
      Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status },
      }),
    ],
  });

const messages = (level) =>
  printMessage.mock.calls
    .filter(([, type]) => type === level)
    .map(([text]) => text);

beforeEach(() => {
  jest.resetAllMocks();
  skipsOwnedObjects.mockReturnValue(false);
});

describe('a tenant without a sync configuration (404)', () => {
  beforeEach(() => {
    readConfigEntity.mockRejectedValue(readError(404));
  });

  test('has nothing to export, which is success', async () => {
    expect(await configManagerExportMappings()).toBe(true);

    expect(readConfigEntity).toHaveBeenCalledWith('sync');
    expect(messages('info')).toEqual([
      'No connector mappings found to export.',
    ]);
    expect(printError).not.toHaveBeenCalled();
    expect(messages('error')).toEqual([]);
    expect(saveJsonToFile).not.toHaveBeenCalled();
  });

  test('says in the verbose output that the tenant has no sync configuration', async () => {
    await configManagerExportMappings();

    expect(verboseMessage).toHaveBeenCalledWith(
      'The tenant has no sync configuration.'
    );
  });

  test('is a success with --allow-failures too, and nothing is summarised', async () => {
    expect(await configManagerExportMappings(undefined, true)).toBe(true);

    expect(messages('warn')).toEqual([]);
    expect(messages('error')).toEqual([]);
  });

  test('is still a 404 when the library wraps the error twice', async () => {
    readConfigEntity.mockRejectedValue(
      Object.assign(new Error('Error reading config entities'), {
        httpStatus: null,
        originalErrors: [readError(404)],
      })
    );

    expect(await configManagerExportMappings()).toBe(true);
    expect(messages('info')).toEqual([
      'No connector mappings found to export.',
    ]);
  });

  test('a named mapping does not exist: an error, and the command fails whatever the flag says', async () => {
    expect(await configManagerExportMappings('zzz', true)).toBe(false);

    expect(messages('error')).toEqual(['Mapping zzz not found.']);
    expect(messages('info')).toEqual([]);
  });
});

describe('every other error still fails the step', () => {
  test.each([
    ['a refused request (403)', readError(403)],
    ['an expired login (401)', readError(401)],
    ['a server error (500)', readError(500)],
    ['a network error without a status', new Error('socket hang up')],
  ])('%s', async (_what, error) => {
    readConfigEntity.mockRejectedValue(error);

    expect(await configManagerExportMappings()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledWith(
      error,
      'Error exporting mappings to files'
    );
    expect(messages('info')).toEqual([]);
    expect(verboseMessage).not.toHaveBeenCalled();
  });

  test('also with --allow-failures: failing to read the sync configuration is not an item failure', async () => {
    readConfigEntity.mockRejectedValue(readError(500));

    expect(await configManagerExportMappings(undefined, true)).toBe(false);
  });

  test('a 404 while reading the ownership of the applications is not "no sync configuration"', async () => {
    skipsOwnedObjects.mockReturnValue(true);
    loadAllRealms.mockRejectedValue(readError(404));
    readConfigEntity.mockResolvedValue({ mappings: [{ name: 'a' }] });

    expect(await configManagerExportMappings()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(messages('info')).toEqual([]);
    expect(readConfigEntity).not.toHaveBeenCalled();
    expect(saveJsonToFile).not.toHaveBeenCalled();
  });
});

describe('a tenant with a sync configuration', () => {
  test('exports its mappings as before', async () => {
    readConfigEntity.mockResolvedValue({
      mappings: [{ name: 'systemLdapAccounts' }, { name: 'managedUser_b' }],
    });

    expect(await configManagerExportMappings()).toBe(true);

    expect(saveJsonToFile).toHaveBeenCalledTimes(2);
    expect(saveJsonToFile.mock.calls.map(([, file]) => file)).toEqual([
      'out/sync/mappings/systemLdapAccounts/systemLdapAccounts.json',
      'out/sync/mappings/managedUser_b/managedUser_b.json',
    ]);
    expect(messages('info')).toEqual([]);
  });

  test('an empty list of mappings has the same message as no configuration', async () => {
    readConfigEntity.mockResolvedValue({ mappings: [] });

    expect(await configManagerExportMappings()).toBe(true);

    expect(messages('info')).toEqual([
      'No connector mappings found to export.',
    ]);
  });
});
