import { Command } from 'commander';
import { jest } from '@jest/globals';

const getTokens = jest.fn();
const importJourneyFromFile = jest.fn();
const importJourneysFromFile = jest.fn();
const importJourneysFromFiles = jest.fn();
const importFirstJourneyFromFile = jest.fn();
const importEverythingFromFile = jest.fn();
const importEverythingFromFiles = jest.fn();
const importEntityfromFile = jest.fn();
const configManagerImportJourneys = jest.fn();
const compareExportToDirectory = jest.fn();
const verboseMessage = jest.fn();
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
  state: { getDirectory: () => '/tmp' },
}));

jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf() {
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { positive: (text) => text, command: (text) => text },
}));
jest.unstable_mockModule('../../src/ops/JourneyOps', () => ({
  importJourneyFromFile,
  importJourneysFromFile,
  importJourneysFromFiles,
  importFirstJourneyFromFile,
}));
jest.unstable_mockModule('../../src/ops/ConfigOps', () => ({
  importEverythingFromFile,
  importEverythingFromFiles,
  importEntityfromFile,
}));
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigJourneysOps',
  () => ({ configManagerImportJourneys })
);
jest.unstable_mockModule('../../src/ops/PromoteOps', () => ({
  compareExportToDirectory,
}));

const { default: setupJourneyImport } = await import(
  '../../src/cli/journey/journey-import'
);
const { default: setupConfigImport } = await import(
  '../../src/cli/config/config-import'
);
const { default: setupConfigManagerPush } = await import(
  '../../src/cli/config-manager/config-manager-push/config-manager-push-journeys'
);
const { default: setupPromote } = await import(
  '../../src/cli/promote/promote'
);

async function invoke(program, options, realm = 'alpha') {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  return program._actionHandler.call(program, [
    undefined,
    realm,
    undefined,
    undefined,
  ]);
}

describe('CLI import validation option wiring', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getTokens.mockResolvedValue(true);
    for (const operation of [
      importJourneyFromFile,
      importJourneysFromFile,
      importJourneysFromFiles,
      importFirstJourneyFromFile,
      importEverythingFromFile,
      importEverythingFromFiles,
      importEntityfromFile,
      configManagerImportJourneys,
      compareExportToDirectory,
    ]) {
      operation.mockResolvedValue(true);
    }
  });

  test.each([false, true])(
    'journey import forwards validate=%s to every import mode',
    async (validate) => {
      await invoke(setupJourneyImport(), {
        journeyId: 'login',
        file: 'journey.json',
        validate,
      });
      expect(importJourneyFromFile).toHaveBeenLastCalledWith(
        'login',
        'journey.json',
        expect.objectContaining({ validate })
      );

      await invoke(setupJourneyImport(), {
        all: true,
        file: 'journeys.json',
        validate,
      });
      expect(importJourneysFromFile).toHaveBeenLastCalledWith(
        'journeys.json',
        expect.objectContaining({ validate })
      );

      await invoke(setupJourneyImport(), { file: 'journey.json', validate });
      expect(importFirstJourneyFromFile).toHaveBeenLastCalledWith(
        'journey.json',
        expect.objectContaining({ validate })
      );

      await invoke(setupJourneyImport(), { allSeparate: true, validate });
      expect(importJourneysFromFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ validate })
      );
    }
  );

  test('default validation failure for the invalid journey fixture makes import fail', async () => {
    const program = setupJourneyImport();
    importJourneyFromFile.mockResolvedValueOnce(false);
    process.exitCode = 0;
    await program.parseAsync([
      'node',
      'frodo',
      '-i',
      'test',
      '-f',
      'test/e2e/exports/all/allAlphaJourneys.journey.json',
    ]);

    expect(importJourneyFromFile).toHaveBeenCalledWith(
      'test',
      'test/e2e/exports/all/allAlphaJourneys.journey.json',
      expect.objectContaining({ validate: true })
    );
    expect(process.exitCode).toBe(1);
  });

  test.each([false, true])(
    'full config import forwards validateJourneys=%s in every mode',
    async (validateJourneys) => {
      await invoke(setupConfigImport(), {
        all: true,
        file: 'config.json',
        validate: validateJourneys,
      });
      expect(importEverythingFromFile).toHaveBeenLastCalledWith(
        'config.json',
        expect.objectContaining({ validateJourneys })
      );

      await invoke(setupConfigImport(), {
        allSeparate: true,
        validate: validateJourneys,
      });
      expect(importEverythingFromFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ validateJourneys })
      );

      await invoke(setupConfigImport(), {
        file: 'journey.json',
        validate: validateJourneys,
      });
      expect(importEntityfromFile).toHaveBeenLastCalledWith(
        'journey.json',
        undefined,
        expect.objectContaining({ validateJourneys })
      );
    }
  );

  test.each([false, true])(
    'config-manager push forwards validate=%s',
    async (validate) => {
      const program = setupConfigManagerPush();
      await invoke(program, { validate });
      expect(configManagerImportJourneys).toHaveBeenCalledWith(
        undefined,
        'alpha',
        undefined,
        validate
      );
    }
  );

  test.each([false, true])(
    'promote forwards validate=%s',
    async (validate) => {
      const program = setupPromote();
      await invoke(program, {
        masterDir: 'master',
        frodoExportDir: 'current',
        validate,
      });
      expect(compareExportToDirectory).toHaveBeenCalledWith(
        'master',
        'current',
        false,
        false,
        false,
        undefined,
        undefined,
        false,
        validate
      );
    }
  );
});
