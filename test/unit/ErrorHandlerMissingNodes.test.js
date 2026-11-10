import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { passwordBreachDetectionError } from '../utils/LibErrorShapes.js';

// The usage listings (script list -u, esv variable list -u, ...) export the whole
// configuration, and the export reports each journey it cannot read to this
// handler. A journey that names nodes the tenant does not have used to print the
// nested error of every node; it is one line now, unless the output is verbose.

let verbose;
const printError = jest.fn();
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: { getVerbose: () => verbose },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
}));

const { errorHandler } = await import('../../src/ops/utils/OpsUtils.ts');

let exitCode;

beforeEach(() => {
  verbose = false;
  exitCode = process.exitCode;
  process.exitCode = undefined;
  printError.mockClear();
  printMessage.mockClear();
});

afterEach(() => {
  process.exitCode = exitCode;
});

describe('errorHandler', () => {
  test('a journey whose nodes are not on the tenant is one line, with the nodes', () => {
    errorHandler(passwordBreachDetectionError());

    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledTimes(1);
    const [message, type] = printMessage.mock.calls[0];
    expect(type).toBe('error');
    expect(message).toContain('PasswordBreachDetection');
    expect(message).toContain(
      '4 of its nodes were not found on the tenant (HTTP 404)'
    );
    expect(message).toContain(
      'ValidatedPasswordNode 53bbcda5-0f75-4f95-bafe-6208020e9d8f'
    );
    expect(message).not.toContain('\n');
  });

  test('it is still a failure: the exit code is 1', () => {
    errorHandler(passwordBreachDetectionError());

    expect(process.exitCode).toBe(1);
  });

  test('verbose output keeps the full error', () => {
    verbose = true;
    const error = passwordBreachDetectionError();

    errorHandler(error);

    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalledWith(error);
    expect(process.exitCode).toBe(1);
  });

  test('any other error is printed as it was', () => {
    const error = new Error('Error exporting something else');

    errorHandler(error);

    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalledWith(error);
    expect(process.exitCode).toBe(1);
  });

  test('no error is no output and no failure', () => {
    errorHandler(undefined);

    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
