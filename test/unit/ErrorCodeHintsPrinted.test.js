import { jest } from '@jest/globals';

// A failed login prints the error of frodo-lib, then one line of advice from
// the CLI, only for an error that carries a code (see ErrorCodeHints).

const frodoGetTokens = jest.fn();
const frodoGetTokensInteractive = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    login: {
      getTokens: frodoGetTokens,
      getTokensInteractive: frodoGetTokensInteractive,
    },
    utils: {
      constants: { DEPLOYMENT_TYPES: ['classic', 'cloud', 'forgeops'] },
    },
  },
  state: {
    getHost: () => 'https://openam-example.forgeblocks.com/am',
    getRealm: () => 'alpha',
    getActiveCredentialSource: () => undefined,
  },
}));
jest.unstable_mockModule('open', () => ({ default: jest.fn(async () => {}) }));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Prompt', () => ({
  question: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => false,
}));
jest.unstable_mockModule(
  '../../src/utils/interactive/AuthoringPrintState',
  () => ({
    noteAuthSucceeded: jest.fn(),
    flushAuthoringPrint: jest.fn(),
    revokeAuthoringPrint: jest.fn(),
  })
);

const { getTokens, getTokensInteractive } =
  await import('../../src/ops/AuthenticateOps.ts');
const { ERROR_CODE_HINTS } = await import('../../src/utils/ErrorCodeHints.ts');

/** What frodo-lib throws: a FrodoError, with a code on the condition and a wrapper around it. */
function libError(message, { code, inner } = {}) {
  return Object.assign(new Error(message), {
    name: 'FrodoError',
    ...(code ? { code } : {}),
    originalErrors: inner ? [inner] : [],
  });
}

const hintsPrinted = () =>
  printMessage.mock.calls.filter(([, type]) => type === 'info');

beforeEach(() => {
  printMessage.mockClear();
  printError.mockClear();
  frodoGetTokens.mockReset();
  frodoGetTokensInteractive.mockReset();
});

describe('getTokens() after a failed login', () => {
  test('1: prints the error, then the advice for its code, once', async () => {
    const wrapper = libError('Error getting tokens', {
      inner: libError(
        'No valid cached browser-login session exists for this host.',
        {
          code: 'BROWSER_LOGIN_NO_SESSION',
        }
      ),
    });
    frodoGetTokens.mockRejectedValue(wrapper);

    await expect(getTokens()).resolves.toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError).toHaveBeenCalledWith(wrapper);
    expect(hintsPrinted()).toEqual([
      [ERROR_CODE_HINTS.BROWSER_LOGIN_NO_SESSION, 'info'],
    ]);
    expect(printError.mock.invocationCallOrder[0]).toBeLessThan(
      printMessage.mock.invocationCallOrder[0]
    );
  });

  test('2: gives each code its own advice', async () => {
    for (const [code, hint] of Object.entries(ERROR_CODE_HINTS)) {
      printMessage.mockClear();
      frodoGetTokens.mockRejectedValue(
        libError('Error getting tokens', { inner: libError('facts', { code }) })
      );
      await getTokens();
      expect(hintsPrinted()).toEqual([[hint, 'info']]);
    }
  });

  test('3: prints no advice for an error without a code', async () => {
    frodoGetTokens.mockRejectedValue(
      libError('Error getting tokens', { inner: new Error('socket hang up') })
    );

    await expect(getTokens()).resolves.toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('4: prints no second advice for a library that words it in the message itself', async () => {
    frodoGetTokens.mockRejectedValue(
      libError('Error getting tokens', {
        inner: libError(
          "No valid cached browser-login session exists for this host. Run 'frodo login --browser' first."
        ),
      })
    );

    await getTokens();

    expect(printMessage).not.toHaveBeenCalled();
  });

  test('5: prints no advice when the login works', async () => {
    frodoGetTokens.mockResolvedValue({ subject: 'jdoe@example.com' });

    await expect(getTokens()).resolves.toBe(true);

    expect(hintsPrinted()).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
  });
});

describe('getTokensInteractive() (frodo login --browser) after a failed login', () => {
  test('6: prints the error, then the advice for its code, once', async () => {
    const wrapper = libError('Error getting tokens interactively', {
      inner: libError('Browser login could not determine the deployment type', {
        code: 'BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN',
      }),
    });
    frodoGetTokensInteractive.mockRejectedValue(wrapper);

    await expect(getTokensInteractive({})).resolves.toBeNull();

    expect(printError).toHaveBeenCalledWith(wrapper);
    expect(hintsPrinted()).toEqual([
      [ERROR_CODE_HINTS.BROWSER_LOGIN_DEPLOYMENT_TYPE_UNKNOWN, 'info'],
    ]);
  });

  test('7: prints no advice for an error without a code', async () => {
    frodoGetTokensInteractive.mockRejectedValue(
      libError('Error getting tokens interactively')
    );

    await expect(getTokensInteractive({})).resolves.toBeNull();

    expect(printMessage).not.toHaveBeenCalled();
  });
});
