import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

let workingDirectory;
let currentRealm;
const importJourneys = jest.fn();
const printError = jest.fn();
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    authn: {
      journey: {
        createSingleTreeExportTemplate: () => ({
          nodes: {},
          innerNodes: {},
          scripts: {},
        }),
        exportJourneys: jest.fn(),
        importJourneys,
      },
    },
    script: { exportScript: jest.fn() },
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
      getFilePath: (file) => path.join(workingDirectory, file),
      saveJsonToFile: jest.fn(),
    },
  },
  state: {
    getDeploymentType: () => 'classic',
    getRealm: () => currentRealm,
    setRealm: (realm) => {
      currentRealm = realm;
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  existScript: jest.fn(),
  realmList: jest.fn(),
  safeFileName: (name) => name,
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
}));

const { configManagerImportJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps');

describe('config-manager journey import validation', () => {
  beforeEach(() => {
    workingDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'frodo-config-manager-journey-')
    );
    currentRealm = undefined;
    importJourneys.mockReset().mockResolvedValue(undefined);
    printError.mockReset();
    printMessage.mockReset();
    const journeyDirectory = path.join(
      workingDirectory,
      'realms',
      'root',
      'journeys',
      'login'
    );
    fs.mkdirSync(journeyDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(journeyDirectory, 'login.json'),
      JSON.stringify({ _id: 'login' })
    );
  });

  afterEach(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  test.each([
    [undefined, true],
    [false, false],
  ])('forwards validate=%s to importJourneys', async (validate, expected) => {
    await expect(
      configManagerImportJourneys(undefined, '/', false, validate)
    ).resolves.toBe(true);

    expect(importJourneys).toHaveBeenCalledWith(
      expect.objectContaining({
        trees: expect.objectContaining({ login: expect.anything() }),
      }),
      expect.objectContaining({ validate: expected })
    );
  });

  test('enables validation by default', async () => {
    await expect(
      configManagerImportJourneys(undefined, '/', false)
    ).resolves.toBe(true);

    expect(importJourneys).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ validate: true })
    );
  });
});
