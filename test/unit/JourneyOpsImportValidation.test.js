import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

let workingDirectory;
const importJourney = jest.fn();
const importJourneys = jest.fn();
const readJourneys = jest.fn();
const resolveDependencies = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    authn: {
      journey: {
        readJourneys,
        resolveDependencies,
        importJourney,
        importJourneys,
      },
      node: {},
    },
    utils: {
      getTypedFilename: jest.fn(),
      saveJsonToFile: jest.fn(),
      getRealmString: () => '/',
      getFilePath: (file) => path.join(workingDirectory, file),
      getWorkingDirectory: () => workingDirectory,
    },
  },
  state: { getVerbose: () => false },
}));

jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: {
    heading: (text) => text,
    negative: (text) => text,
    positive: (text) => text,
    warning: (text) => text,
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: () => 'progress',
  createTable: () => [],
  debugMessage: jest.fn(),
  printError: jest.fn(),
  printMessage: jest.fn(),
  stopProgressIndicator: jest.fn(),
  updateProgressIndicator: jest.fn(),
}));
for (const modulePath of [
  '../../src/ops/CirclesOfTrustOps',
  '../../src/ops/EmailTemplateOps',
  '../../src/ops/IdpOps',
  '../../src/ops/NodeOps',
  '../../src/ops/Saml2Ops',
  '../../src/ops/ScriptOps',
  '../../src/ops/ThemeOps',
]) {
  jest.unstable_mockModule(modulePath, () => ({}));
}
jest.unstable_mockModule('../../src/ops/utils/OpsUtils', () => ({
  errorHandler: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/utils/Wordwrap', () => ({
  default: (text) => text,
}));

const {
  importFirstJourneyFromFile,
  importJourneyFromFile,
  importJourneysFromFile,
  importJourneysFromFiles,
} = await import('../../src/ops/JourneyOps');

describe('journey operation validation options', () => {
  beforeEach(() => {
    workingDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'frodo-journey-import-validation-')
    );
    jest.resetAllMocks();
    readJourneys.mockResolvedValue([]);
    resolveDependencies.mockImplementation(
      async (_installed, _journeys, unresolved) => {
        Object.keys(unresolved).forEach((key) => delete unresolved[key]);
      }
    );
    importJourney.mockResolvedValue(undefined);
    importJourneys.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  test.each([false, true])(
    'single journey imports pass validate=%s to the library',
    async (validate) => {
      const journey = { tree: { _id: 'login' }, nodes: {} };
      fs.writeFileSync(
        path.join(workingDirectory, 'journey.json'),
        JSON.stringify(journey)
      );

      await expect(
        importJourneyFromFile('login', 'journey.json', { validate })
      ).resolves.toBe(true);
      expect(importJourney).toHaveBeenCalledWith(journey, { validate });

      await expect(
        importFirstJourneyFromFile('journey.json', { validate })
      ).resolves.toBe(true);
      expect(importJourney).toHaveBeenLastCalledWith(journey, { validate });
    }
  );

  test.each([false, true])(
    'all-journey imports pass validate=%s to the library',
    async (validate) => {
      const journeys = {
        trees: { login: { tree: { _id: 'login' }, nodes: {} } },
      };
      fs.writeFileSync(
        path.join(workingDirectory, 'journeys.json'),
        JSON.stringify(journeys)
      );
      fs.writeFileSync(
        path.join(workingDirectory, 'login.journey.json'),
        JSON.stringify(journeys.trees.login)
      );

      await expect(
        importJourneysFromFile('journeys.json', { validate })
      ).resolves.toBe(true);
      expect(importJourneys).toHaveBeenCalledWith(
        journeys,
        { validate },
        expect.any(Function)
      );

      await expect(importJourneysFromFiles({ validate })).resolves.toBe(true);
      expect(importJourneys).toHaveBeenLastCalledWith(
        { trees: journeys.trees },
        { validate },
        expect.any(Function)
      );
    }
  );
});
