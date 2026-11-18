import { jest } from '@jest/globals';

/**
 * `frodo dcc session apply --wait`: what the operation does after it has asked
 * the tenant to apply the staged configuration. The loop is the one of the
 * removed `config-manager push direct-control-apply -w`, moved unchanged: sleep
 * 10 seconds, read the state, print `Status: <status>`, stop at SESSION_APPLIED
 * (success) or ERROR (failure), no timeout, and a read that fails ends it.
 *
 * - without `wait` the state is never read and nothing sleeps;
 * - with `wait` the sleep comes BEFORE each read (the answer of the apply call
 *   is not the state of the session), 10 000 ms each;
 * - `Status:` lines are progress: they never go to the data stream, so
 *   `--json` leaves one document on stdout, the final state;
 * - an answer that says the session is still editable means that the apply did
 *   not start: there is nothing to wait for and the command fails at once.
 *
 * The library and the helpers are mocked, so the test sees every call, in order,
 * and takes no time.
 */

const calls = [];
const applyDirectConfigurationSession = jest.fn(async () => {
  calls.push('apply');
  return next(applyAnswers);
});
const readDirectConfigurationSessionState = jest.fn(async () => {
  calls.push('read');
  return next(readAnswers);
});
const printMessage = jest.fn();
const printError = jest.fn();
const sleep = jest.fn(async (ms) => {
  calls.push(`sleep ${ms}`);
});

let applyAnswers;
let readAnswers;

/** Answers with the next scripted value; an Error is thrown, and a script that runs dry is a test failure. */
function next(script) {
  if (script.length === 0)
    throw new Error('the test script ran out of answers');
  const answer = script.shift();
  if (answer instanceof Error) throw answer;
  return answer;
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    cloud: {
      env: {
        applyDirectConfigurationSession,
        readDirectConfigurationSessionState,
        initDirectConfigurationSession: jest.fn(),
        abortDirectConfigurationSession: jest.fn(),
      },
    },
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({ sleep }));

const { applyDirectConfigurationSession: apply } =
  await import('../../src/ops/cloud/EnvDirectConfigurationControlOps');

const APPLYING = { editable: false, status: 'APPLYING' };
const PENDING = { editable: false, status: 'PENDING' };
const APPLIED = { editable: false, status: 'SESSION_APPLIED' };
const FAILED = { editable: false, status: 'ERROR' };
const STILL_EDITABLE = { editable: true, status: 'SESSION_ACTIVE' };

/** What went to stdout (the `data` type), in order. */
const dataOut = () =>
  printMessage.mock.calls
    .filter(([, type]) => type === 'data')
    .map(([message]) => message);
/** How many times the sentence of success went out (it is a sentence, so never with --json). */
const successSentences = () =>
  printMessage.mock.calls.filter(
    ([message, type]) =>
      type === undefined &&
      /^Configuration applied and direct configuration session ended/.test(
        message
      )
  ).length;
/** What went to stderr as a plain progress line. */
const statusLines = () =>
  printMessage.mock.calls
    .filter(
      ([message, type]) => type === undefined && /^Status: /.test(message)
    )
    .map(([message]) => message);

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  applyAnswers = [];
  readAnswers = [];
});

describe('apply without wait', () => {
  test('asks once, reads nothing, sleeps never, and succeeds when the session has ended', async () => {
    applyAnswers = [APPLYING];

    expect(await apply(false, false)).toBe(true);

    expect(calls).toEqual(['apply']);
    expect(readDirectConfigurationSessionState).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Configuration applied and direct configuration session ended/
      )
    );
  });

  test('is the default: both parameters are optional', async () => {
    applyAnswers = [APPLYING];

    expect(await apply()).toBe(true);

    expect(calls).toEqual(['apply']);
  });

  test('fails when the session is still editable', async () => {
    applyAnswers = [STILL_EDITABLE];

    expect(await apply(false, false)).toBe(false);

    expect(calls).toEqual(['apply']);
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringMatching(/^Direct configuration session is still active/)
    );
  });

  test('--json prints the answer of the call and nothing else', async () => {
    applyAnswers = [APPLYING];

    expect(await apply(true, false)).toBe(true);

    expect(dataOut()).toEqual([APPLYING]);
    expect(statusLines()).toEqual([]);
  });

  test('--json prints the document of a session that is still editable and, as before, succeeds', async () => {
    applyAnswers = [STILL_EDITABLE];

    expect(await apply(true, false)).toBe(true);

    expect(dataOut()).toEqual([STILL_EDITABLE]);
  });
});

describe('apply with wait', () => {
  test('sleeps 10 seconds before each read and stops at SESSION_APPLIED', async () => {
    applyAnswers = [APPLYING];
    readAnswers = [PENDING, APPLIED];

    expect(await apply(false, true)).toBe(true);

    expect(calls).toEqual([
      'apply',
      'sleep 10000',
      'read',
      'sleep 10000',
      'read',
    ]);
    expect(statusLines()).toEqual([
      'Status: PENDING',
      'Status: SESSION_APPLIED',
    ]);
    // the sentence of success, once, and no document: that is for --json
    expect(successSentences()).toBe(1);
    expect(dataOut()).toEqual([]);
  });

  test('an answer of the call that already says SESSION_APPLIED needs no read', async () => {
    applyAnswers = [APPLIED];

    expect(await apply(false, true)).toBe(true);

    expect(calls).toEqual(['apply']);
    expect(sleep).not.toHaveBeenCalled();
    expect(statusLines()).toEqual([]);
    expect(successSentences()).toBe(1);
  });

  test('with --json an answer that already says SESSION_APPLIED is the one document, with no sentence', async () => {
    applyAnswers = [APPLIED];

    expect(await apply(true, true)).toBe(true);

    expect(calls).toEqual(['apply']);
    expect(dataOut()).toEqual([APPLIED]);
    expect(successSentences()).toBe(0);
  });

  test('a status it does not know is not success: it keeps reading, and nothing says the configuration was applied', async () => {
    const UNKNOWN = { editable: false, status: 'SOMETHING_ELSE' };
    applyAnswers = [APPLYING];
    // three answers of an unknown status, then the script runs dry: that read is
    // rejected, which is the only thing that ends the wait
    readAnswers = [UNKNOWN, UNKNOWN, UNKNOWN];

    expect(await apply(false, true)).toBe(false);

    expect(readDirectConfigurationSessionState).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(4);
    expect(statusLines()).toEqual([
      'Status: SOMETHING_ELSE',
      'Status: SOMETHING_ELSE',
      'Status: SOMETHING_ELSE',
    ]);
    expect(successSentences()).toBe(0);
  });

  test('ERROR on the second read fails with the message and does not read a third time', async () => {
    applyAnswers = [APPLYING];
    readAnswers = [PENDING, FAILED, APPLIED];

    expect(await apply(false, true)).toBe(false);

    expect(readDirectConfigurationSessionState).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      'apply',
      'sleep 10000',
      'read',
      'sleep 10000',
      'read',
    ]);
    expect(statusLines()).toEqual(['Status: PENDING', 'Status: ERROR']);
    expect(printMessage).toHaveBeenCalledWith(
      'Direct Configuration session encountered an error.',
      'error'
    );
    expect(successSentences()).toBe(0);
  });

  test('a read that fails ends the wait with the error and no further read', async () => {
    applyAnswers = [APPLYING];
    readAnswers = [new Error('state is not readable'), APPLIED];

    expect(await apply(false, true)).toBe(false);

    expect(readDirectConfigurationSessionState).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][0].message).toBe('state is not readable');
  });

  test('a session that is still editable is not waited for', async () => {
    applyAnswers = [STILL_EDITABLE];
    readAnswers = [APPLIED];

    expect(await apply(false, true)).toBe(false);

    expect(calls).toEqual(['apply']);
    expect(sleep).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(
      expect.stringMatching(/^Direct configuration session is still active/)
    );
  });

  test('a call that is rejected fails and reads nothing', async () => {
    applyAnswers = [new Error('apply was refused')];
    readAnswers = [APPLIED];

    expect(await apply(false, true)).toBe(false);

    expect(calls).toEqual(['apply']);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][0].message).toBe('apply was refused');
  });

  test('with --json the final state is the one document on stdout, and Status never goes there', async () => {
    applyAnswers = [APPLYING];
    readAnswers = [PENDING, APPLIED];

    expect(await apply(true, true)).toBe(true);

    expect(dataOut()).toEqual([APPLIED]);
    expect(statusLines()).toEqual([
      'Status: PENDING',
      'Status: SESSION_APPLIED',
    ]);
    for (const message of dataOut()) expect(typeof message).toBe('object');
    // a document is the answer: the sentence of success would be a second one
    expect(successSentences()).toBe(0);
  });

  test('with --json an ERROR fails with the failed state as the one document', async () => {
    applyAnswers = [APPLYING];
    readAnswers = [FAILED];

    expect(await apply(true, true)).toBe(false);

    expect(dataOut()).toEqual([FAILED]);
    expect(statusLines()).toEqual(['Status: ERROR']);
    expect(successSentences()).toBe(0);
  });

  test('with --json a session that is still editable is not waited for: the document is printed and the command fails', async () => {
    applyAnswers = [STILL_EDITABLE];
    readAnswers = [APPLIED];

    expect(await apply(true, true)).toBe(false);

    expect(calls).toEqual(['apply']);
    expect(dataOut()).toEqual([STILL_EDITABLE]);
  });

  test('with --json a call that is rejected prints the error object and no document', async () => {
    applyAnswers = [new Error('apply was refused')];

    expect(await apply(true, true)).toBe(false);

    expect(dataOut()).toEqual([]);
    expect(printError).toHaveBeenCalledWith({ error: 'apply was refused' });
  });
});
