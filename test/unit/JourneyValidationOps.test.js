import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

let workingDirectory;
let realm;
const validateJourneys = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    authn: { journey: { validateJourneys } },
    utils: {
      constants: { DEFAULT_REALM_KEY: '__default__realm__' },
      getFilePath: (file) => path.join(workingDirectory, file),
    },
  },
  state: {
    getRealm: () => realm,
    setRealm: (value) => {
      realm = value;
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
}));

const { validateJourneys: validateJourneyExports } =
  await import('../../src/ops/JourneyValidationOps');

describe('validateJourneys', () => {
  beforeEach(() => {
    realm = undefined;
    workingDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'frodo-journey-validation-')
    );
    jest.resetAllMocks();
    validateJourneys.mockResolvedValue([]);
  });

  afterEach(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  test('validates tenant journeys and lets warnings pass by default', async () => {
    validateJourneys.mockResolvedValue([
      {
        code: 'UNREACHABLE_NODE',
        severity: 'warning',
        journeyId: 'login',
        message: 'Node debug is unreachable',
      },
    ]);

    await expect(validateJourneyExports(['login'])).resolves.toBe(true);

    expect(validateJourneys).toHaveBeenCalledWith(['login'], undefined);
    expect(realm).toBe('__default__realm__');
    expect(printMessage).toHaveBeenCalledWith(
      '1 warning in journey login',
      'warn'
    );
    expect(printMessage).toHaveBeenCalledWith(
      '  [UNREACHABLE_NODE] Node debug is unreachable',
      'warn'
    );
  });

  test('fails on warnings in strict mode and on errors in every mode', async () => {
    validateJourneys.mockResolvedValue([
      {
        code: 'UNREACHABLE_NODE',
        severity: 'warning',
        journeyId: 'login',
        message: 'Node debug is unreachable',
      },
    ]);
    await expect(validateJourneyExports(undefined, undefined, true)).resolves
      .toBe(false);

    validateJourneys.mockResolvedValue([
      {
        code: 'MISSING_ENTRY_NODE',
        severity: 'error',
        journeyId: 'broken',
        message: 'Entry node is missing',
      },
    ]);
    await expect(validateJourneyExports()).resolves.toBe(false);
  });

  test.each([
    [
      'classic',
      {
        tree: { _id: 'classic', entryNodeId: 'start', nodes: {} },
        nodes: {},
      },
    ],
    [
      'cloud',
      {
        tree: {
          _id: 'cloud',
          entryNodeId: 'page',
          nodes: { page: { connections: { 'inner-outcome': 'inner' } } },
          staticNodes: {},
        },
        nodes: {},
        innerNodes: { inner: { _id: 'inner' } },
      },
    ],
  ])('wraps a single %s journey export for offline validation', async (name, journey) => {
    fs.writeFileSync(
      path.join(workingDirectory, `${name}.json`),
      JSON.stringify(journey)
    );

    await expect(
      validateJourneyExports(undefined, `${name}.json`)
    ).resolves.toBe(true);

    expect(validateJourneys).toHaveBeenCalledWith(undefined, {
      trees: { [name]: journey },
    });
  });

  test('passes multi-journey export files to the library unchanged', async () => {
    const journeys = {
      trees: {
        classic: { tree: { _id: 'classic', nodes: {} } },
        cloud: { tree: { _id: 'cloud', nodes: {}, staticNodes: {} } },
      },
    };
    fs.writeFileSync(
      path.join(workingDirectory, 'journeys.json'),
      JSON.stringify(journeys)
    );

    await expect(
      validateJourneyExports(['cloud'], 'journeys.json')
    ).resolves.toBe(true);

    expect(validateJourneys).toHaveBeenCalledWith(['cloud'], journeys);
  });
});
