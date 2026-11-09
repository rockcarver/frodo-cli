import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import {
  FrodoError,
  httpError,
  innerNodeError,
  journeyError,
  passwordBreachDetectionError,
  readNodeError,
} from '../utils/LibErrorShapes.js';

/**
 * `config-manager pull journeys` (and the journeys step of `pull all`) when a
 * journey cannot be exported because nodes of it are not on the tenant: one
 * line instead of the title twice and a network-error block per node, URLs
 * and blocks only with verbose output, the same wording in the summary, and
 * every other journey still exported (decision record 0040).
 *
 * The library is a stub whose `exportJourneys` reports the journeys of the
 * test to the result callback, as the real one does; OperationRun, ErrorCause
 * and the module under test are real. Files go to a folder in the temp
 * directory.
 */

let workingDirectory;
let currentRealm;
let verbose;
const exportJourneys = jest.fn();
const printError = jest.fn();
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    authn: {
      journey: {
        createSingleTreeExportTemplate: () => ({}),
        exportJourneys,
        importJourneys: jest.fn(),
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
      readJsonFile: jest.fn(),
    },
  },
  state: {
    getDeploymentType: () => 'classic',
    getRealm: () => currentRealm,
    setRealm: (realm) => {
      currentRealm = realm;
    },
    getVerbose: () => verbose,
  },
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  existScript: jest.fn(),
  realmList: jest.fn().mockResolvedValue(['alpha']),
  safeFileName: (name) => name,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
}));

const { configManagerExportJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps');

const IDS = ['Login', 'PasswordBreachDetection', 'Registration'];
const NODE = '53bbcda5-0f75-4f95-bafe-6208020e9d8f';

/** The library reports `errors` (by journey) and hands the other journeys on. */
function arrange(errors) {
  exportJourneys.mockReset().mockImplementation(async (options, callback) => {
    const trees = {};
    for (const id of IDS) {
      if (errors[id]) {
        callback(errors[id], undefined);
      } else {
        trees[id] = {
          tree: { _id: id, nodes: {} },
          nodes: {},
        };
        callback(undefined, trees[id]);
      }
    }
    return { trees };
  });
}

const run = (allowFailures = false) =>
  configManagerExportJourneys(
    undefined,
    undefined,
    false,
    false,
    allowFailures
  );

/** The messages printed with printMessage, in order, without their level. */
const messages = () => printMessage.mock.calls.map(([text]) => String(text));
const summary = () =>
  messages().find((m) => /^\d+ of \d+ journeys? failed/.test(m));

beforeEach(() => {
  workingDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frodo-pull-journeys-')
  );
  currentRealm = undefined;
  verbose = false;
  printError.mockReset();
  printMessage.mockReset();
});

afterEach(() => {
  fs.rmSync(workingDirectory, { recursive: true, force: true });
});

describe('a journey whose nodes are not on the tenant', () => {
  test('is one line and one summary entry, and the other journeys are exported', async () => {
    arrange({ PasswordBreachDetection: passwordBreachDetectionError() });

    expect(await run()).toBe(false);

    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenNthCalledWith(
      1,
      'Journey PasswordBreachDetection of the alpha realm could not be exported: ' +
        '4 of its nodes were not found on the tenant (HTTP 404): ' +
        `ValidatedPasswordNode ${NODE}, ` +
        'MessageNode 84a508f5-7f31-44ec-981f-a64dcfe8ffdd, ' +
        'MessageNode e90307e7-8e1a-4b08-bc23-8810f9308758, ' +
        'MessageNode d0b058da-3d5a-41e0-92d5-5dfc3892ee6c',
      'error'
    );
    // the two that could be exported are counted with the failed one
    expect(summary()).toBe(
      '1 of 3 journeys failed:\n' +
        '  - alpha/PasswordBreachDetection: 4 of its nodes were not found on the tenant (HTTP 404)'
    );
    expect(printMessage).toHaveBeenCalledTimes(2);
    expect(printMessage.mock.calls[1][1]).toBe('error');
  });

  test('--allow-failures keeps the exit code at 0 and prints the summary as a warning', async () => {
    arrange({ PasswordBreachDetection: passwordBreachDetectionError() });

    expect(await run(true)).toBe(true);

    expect(printError).not.toHaveBeenCalled();
    expect(messages()[0]).toContain('Journey PasswordBreachDetection');
    expect(summary()).toContain(
      'alpha/PasswordBreachDetection: 4 of its nodes were not found on the tenant (HTTP 404)'
    );
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    expect(printMessage.mock.calls[1][1]).toBe('warn');
  });

  test('a single node that was read directly is also one line, in the singular', async () => {
    arrange({
      Registration: journeyError('Registration', [
        readNodeError('ValidatedPasswordNode', NODE),
      ]),
    });

    expect(await run()).toBe(false);

    expect(printError).not.toHaveBeenCalled();
    expect(messages()[0]).toBe(
      `Journey Registration of the alpha realm could not be exported: 1 of its nodes was not found on the tenant (HTTP 404): ValidatedPasswordNode ${NODE}`
    );
    expect(summary()).toBe(
      '1 of 3 journeys failed:\n  - alpha/Registration: 1 of its nodes was not found on the tenant (HTTP 404)'
    );
  });

  test('two such journeys are two lines and two entries of one summary', async () => {
    arrange({
      Login: journeyError('Login', [innerNodeError('MessageNode', NODE)]),
      Registration: journeyError('Registration', [
        innerNodeError('MessageNode', NODE),
      ]),
    });

    expect(await run()).toBe(false);

    expect(messages().filter((m) => m.startsWith('Journey '))).toHaveLength(2);
    expect(summary()).toMatch(
      /^2 of 3 journeys failed:\n {2}- alpha\/Login: .*\n {2}- alpha\/Registration: /
    );
  });

  test('with verbose output the error is printed in full, as it always was', async () => {
    verbose = true;
    const error = passwordBreachDetectionError();
    arrange({ PasswordBreachDetection: error });

    expect(await run()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledWith(error);
    expect(messages().some((m) => m.startsWith('Journey '))).toBe(false);
    // the summary is the one that every other failed item gets
    expect(summary()).toContain(
      '- Error exporting the alpha realm journey PasswordBreachDetection'
    );
  });
});

describe('an error that says more than "not found" keeps its detail', () => {
  test.each([
    [
      'a 404 and a 500',
      () =>
        journeyError('PasswordBreachDetection', [
          innerNodeError('MessageNode', NODE),
          innerNodeError('MessageNode', 'b', 500, {
            code: 500,
            reason: 'Internal Server Error',
            message: 'boom',
          }),
        ]),
    ],
    [
      'a part that is not a node',
      () =>
        journeyError('PasswordBreachDetection', [
          innerNodeError('MessageNode', NODE),
          new FrodoError(
            'Error reading email templates',
            httpError('https://matrix.example.com/openidm/config', 404)
          ),
        ]),
    ],
    [
      'a 404 with a text of the server',
      () =>
        journeyError('PasswordBreachDetection', [
          readNodeError('MessageNode', NODE, 404, {
            reason: 'Not Found',
            message: 'No such node type in this version',
          }),
        ]),
    ],
    [
      'a failure that is not about nodes',
      () =>
        new FrodoError(
          'Error exporting the alpha realm journey PasswordBreachDetection',
          new Error('could not process')
        ),
    ],
  ])('%s', async (name, make) => {
    const error = make();
    arrange({ PasswordBreachDetection: error });

    expect(await run()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledWith(error);
    expect(messages().some((m) => m.startsWith('Journey '))).toBe(false);
    expect(summary()).toMatch(
      /^1 of 3 journeys failed:\n {2}- Error exporting the alpha realm journey PasswordBreachDetection/
    );
  });
});

describe('when nothing fails', () => {
  test('nothing is printed', async () => {
    arrange({});

    expect(await run()).toBe(true);

    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
  });
});
