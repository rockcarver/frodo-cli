import { jest } from '@jest/globals';

const importFullConfiguration = jest.fn();
const getFullExportConfig = jest.fn();
const getFullExportConfigFromDirectory = jest.fn();
const getConfig = jest.fn();
const getRealmsForExport = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      getTypedFilename: jest.fn(),
      saveJsonToFile: jest.fn(),
      getFilePath: (file) => file,
      getWorkingDirectory: () => '/tmp',
      getRealmsForExport,
      getRealmUsingExportFormat: (realm) => realm,
    },
    config: {
      exportFullConfiguration: jest.fn(),
      importFullConfiguration,
    },
  },
  state: { getRealm: () => 'alpha' },
}));

jest.unstable_mockModule('../../src/utils/Config', () => ({
  getConfig,
  getFullExportConfig,
  getFullExportConfigFromDirectory,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  cleanupProgressIndicators: jest.fn(),
  printError: jest.fn(),
  printMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/classic/ServerOps', () => ({
  saveServersToFiles: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/cloud/iga/IgaWorkflowOps', () => ({
  extractWorkflowScriptsToFiles: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/IdmOps', () => ({
  writeIdmObjectToDirectory: jest.fn(),
  writeManagedJsonToDirectory: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/MappingOps', () => ({
  writeMappingJsonToDirectory: jest.fn(),
  writeSyncJsonToDirectory: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/NodeOps', () => ({
  extractCustomNodeScriptsToFiles: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/ScriptOps', () => ({
  extractScriptsToFiles: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/ThemeOps', () => ({
  extractThemeHTMLToFiles: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/utils/OpsUtils', () => ({
  errorHandler: jest.fn(),
}));

const {
  importEntityfromFile,
  importEverythingFromFile,
  importEverythingFromFiles,
} = await import('../../src/ops/ConfigOps');

describe('full configuration import validation options', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getFullExportConfig.mockResolvedValue({});
    getFullExportConfigFromDirectory.mockResolvedValue({});
    importFullConfiguration.mockResolvedValue([{}]);
    getConfig.mockResolvedValue(undefined);
  });

  test.each([false, true])(
    'all import forms pass validateJourneys=%s to the library',
    async (validateJourneys) => {
      const options = { validateJourneys };

      await expect(
        importEverythingFromFile('config.json', options)
      ).resolves.toBe(true);
      expect(importFullConfiguration).toHaveBeenLastCalledWith(
        {},
        options,
        expect.any(Function)
      );

      await expect(importEverythingFromFiles(options)).resolves.toBe(true);
      expect(importFullConfiguration).toHaveBeenLastCalledWith(
        {},
        options,
        expect.any(Function)
      );

      await expect(
        importEntityfromFile('journey.json', true, options)
      ).resolves.toBe(true);
      expect(importFullConfiguration).toHaveBeenLastCalledWith(
        { global: {}, realm: {} },
        options,
        expect.any(Function)
      );
    }
  );
});
