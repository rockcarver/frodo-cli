import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `frodo config-manager pull managed-objects` writes every script of a managed
 * object to its own file and leaves a `file` reference in the JSON. That holds
 * for the scripts on the object itself, for the ones under `actions` and for
 * the ones in the hooks of a property.
 */

const readConfigEntity = jest.fn();
const saveJsonToFile = jest.fn();
const extractFrConfigDataToFile = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    idm: {
      config: {
        readConfigEntity,
        importConfigEntities: jest.fn(),
        importSubConfigEntity: jest.fn(),
      },
      managed: { schema: { readManagedObjectSchemaProperty: jest.fn() } },
    },
    utils: {
      getFilePath: (p) => p,
      saveJsonToFile,
      readJsonFile: jest.fn(),
    },
  },
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError: jest.fn(),
}));

const { configManagerExportManagedObjects } =
  await import('../../src/configManagerOps/FrConfigManagedObjectsOps');

describe('configManagerExportManagedObjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readConfigEntity.mockResolvedValue({
      objects: [
        {
          name: 'alpha_user',
          onCreate: { type: 'text/javascript', source: 'create();' },
          actions: {
            resetPassword: { type: 'text/javascript', source: 'reset();' },
            audit: { type: 'groovy', source: 'not javascript' },
          },
          schema: {
            properties: {
              mail: {
                onStore: { type: 'text/javascript', source: 'store();' },
              },
            },
          },
        },
      ],
    });
  });

  it('extracts the scripts of the object, of its actions and of its property hooks', async () => {
    expect(await configManagerExportManagedObjects()).toBe(true);
    const dir = 'managed-objects/alpha_user';
    expect(extractFrConfigDataToFile).toHaveBeenCalledWith(
      'create();',
      'alpha_user.onCreate.js',
      dir
    );
    expect(extractFrConfigDataToFile).toHaveBeenCalledWith(
      'reset();',
      'alpha_user.actions.resetPassword.js',
      dir
    );
    expect(extractFrConfigDataToFile).toHaveBeenCalledWith(
      'store();',
      'alpha_user.mail.onStore.js',
      dir
    );
    expect(extractFrConfigDataToFile).toHaveBeenCalledTimes(3);
  });

  it('replaces the source of an action script with a file reference', async () => {
    await configManagerExportManagedObjects();
    const saved = saveJsonToFile.mock.calls[0][0];
    expect(saved.actions.resetPassword).toEqual({
      type: 'text/javascript',
      file: 'alpha_user.actions.resetPassword.js',
    });
    expect(saved.actions.audit.source).toBe('not javascript');
  });
});
