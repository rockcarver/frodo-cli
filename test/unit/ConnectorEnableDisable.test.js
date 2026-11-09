import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `connector enable` and `connector disable` (frodo-cli#374). The ops
 * functions call the connector functions of the library and turn the result
 * into the message and the answer the command exits with:
 * - enabling waits for the connector to answer its connection test; a connector
 *   that is enabled but does not answer in time is a failure (exit 1) whose
 *   message says it is switched on;
 * - a connector that already is in the requested state says so and succeeds;
 * - a connector that does not exist is an error from the library and fails;
 * - `--timeout` is seconds on the command line and milliseconds in the library
 *   (core record 0020), and without it no timeout is passed.
 * The library is a set of spies: the real one cannot load under jest's ESM
 * runtime.
 */

const connector = {
  enableConnector: jest.fn(),
  disableConnector: jest.fn(),
};
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {},
  frodo: {
    // the file functions of the other verbs are read when the module loads
    utils: {
      getTypedFilename: jest.fn(),
      saveJsonToFile: jest.fn(),
      getFilePath: jest.fn(),
      getWorkingDirectory: jest.fn(),
    },
    idm: { connector },
  },
}));
// the colour theme reads the terminal theme of the library
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const printError = jest.fn();
const printMessage = jest.fn();
const stopProgressIndicator = jest.fn();
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
  createProgressIndicator: jest.fn(() => 'spinner'),
  stopProgressIndicator,
  debugMessage: jest.fn(),
  // used by the other verbs of the module
  createTable: jest.fn(),
  failSpinner: jest.fn(),
  showSpinner: jest.fn(),
  succeedSpinner: jest.fn(),
  updateProgressIndicator: jest.fn(),
}));

const { enableConnector, disableConnector } =
  await import('../../src/ops/ConnectorOps');

const ID = 'ZionDirectory';
const result = (more = {}) => ({
  connectorId: ID,
  connector: {},
  enabled: true,
  changed: true,
  ...more,
});
const lastStop = () => stopProgressIndicator.mock.calls.at(-1);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('enableConnector', () => {
  test('without --timeout the library gets the id and no options at all', async () => {
    connector.enableConnector.mockResolvedValue(result({ ready: true }));

    await expect(enableConnector(ID)).resolves.toBe(true);

    expect(connector.enableConnector.mock.calls).toEqual([[ID]]);
  });

  test.each([
    [90, 90000],
    [1.5, 1500],
    [0, 0],
  ])(
    '--timeout %s seconds is %s milliseconds in the library',
    async (seconds, ms) => {
      connector.enableConnector.mockResolvedValue(result({ ready: true }));

      await enableConnector(ID, seconds);

      expect(connector.enableConnector.mock.calls).toEqual([
        [ID, { timeout: ms }],
      ]);
    }
  );

  test('a changed connector that answers: success', async () => {
    connector.enableConnector.mockResolvedValue(
      result({ changed: true, ready: true })
    );

    await expect(enableConnector(ID)).resolves.toBe(true);

    expect(lastStop()).toEqual([
      'spinner',
      `Enabled connector ${ID}`,
      'success',
    ]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a connector that is enabled already says so and succeeds', async () => {
    connector.enableConnector.mockResolvedValue(
      result({ changed: false, ready: true })
    );

    await expect(enableConnector(ID)).resolves.toBe(true);

    expect(lastStop()).toEqual([
      'spinner',
      `Connector ${ID} is enabled already`,
      'success',
    ]);
  });

  test('enabled but not answering in time: failure that says the connector is on and gives the last answer', async () => {
    connector.enableConnector.mockResolvedValue(
      result({ ready: false, error: 'connector not available' })
    );

    await expect(enableConnector(ID)).resolves.toBe(false);

    expect(lastStop()[2]).toBe('fail');
    const [message, level] = printMessage.mock.calls.at(-1);
    expect(level).toBe('error');
    expect(message).toContain(`connector ${ID} is enabled`);
    expect(message).toContain('connector not available');
    expect(message).toContain('--timeout');
  });

  test('a connector that was enabled already but does not answer is a failure too', async () => {
    connector.enableConnector.mockResolvedValue(
      result({ changed: false, ready: false })
    );

    await expect(enableConnector(ID)).resolves.toBe(false);
  });

  test('a connector that does not exist: the error is printed and the command fails', async () => {
    const error = new Error('Error reading connector ZionDirectory');
    connector.enableConnector.mockRejectedValue(error);

    await expect(enableConnector(ID)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(error);
    expect(lastStop()).toEqual([
      'spinner',
      `Error enabling connector ${ID}`,
      'fail',
    ]);
  });
});

describe('disableConnector', () => {
  test('the library gets the id; there is nothing to wait for, so no options', async () => {
    connector.disableConnector.mockResolvedValue(result({ enabled: false }));

    await expect(disableConnector(ID)).resolves.toBe(true);

    expect(connector.disableConnector.mock.calls).toEqual([[ID]]);
  });

  test('a changed connector: success', async () => {
    connector.disableConnector.mockResolvedValue(
      result({ enabled: false, changed: true })
    );

    await expect(disableConnector(ID)).resolves.toBe(true);

    expect(lastStop()).toEqual([
      'spinner',
      `Disabled connector ${ID}`,
      'success',
    ]);
  });

  test('a connector that is disabled already says so and succeeds', async () => {
    connector.disableConnector.mockResolvedValue(
      result({ enabled: false, changed: false })
    );

    await expect(disableConnector(ID)).resolves.toBe(true);

    expect(lastStop()).toEqual([
      'spinner',
      `Connector ${ID} is disabled already`,
      'success',
    ]);
  });

  test('a connector that does not exist: the error is printed and the command fails', async () => {
    const error = new Error('Error reading connector ZionDirectory');
    connector.disableConnector.mockRejectedValue(error);

    await expect(disableConnector(ID)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(error);
    expect(lastStop()).toEqual([
      'spinner',
      `Error disabling connector ${ID}`,
      'fail',
    ]);
  });
});
