import { jest } from '@jest/globals';

// A browser or device login runs as whoever is signed in to the browser, so
// the command names the account. Other logins keep the verbose line only.

const frodoGetTokens = jest.fn();
let credentialSource;
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    login: {
      getTokens: frodoGetTokens,
      getTokensInteractive: jest.fn(),
    },
    utils: { constants: { DEPLOYMENT_TYPES: ['classic', 'cloud', 'forgeops'] } },
  },
  state: {
    getHost: () => 'https://openam-example.forgeblocks.com/am',
    getRealm: () => 'alpha',
    getActiveCredentialSource: () => credentialSource,
  },
}));
jest.unstable_mockModule('open', () => ({ default: jest.fn(async () => {}) }));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Prompt', () => ({ question: jest.fn() }));
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

const { getTokens, cliBrowserLoginPromptHandler } = await import(
  '../../src/ops/AuthenticateOps.ts'
);

const identityMessages = () =>
  printMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => /Logged in as|saved browser login/.test(message));

beforeEach(() => {
  printMessage.mockClear();
  frodoGetTokens.mockReset();
  frodoGetTokens.mockResolvedValue({ subject: 'jdoe@example.com' });
});

describe('getTokens() names the account of a browser login', () => {
  test('1: a session reused from the cache says whose it is', async () => {
    credentialSource = 'browser';

    await expect(getTokens()).resolves.toBe(true);

    expect(printMessage).toHaveBeenCalledWith(
      'Using the saved browser login of jdoe@example.com',
      'info'
    );
  });

  test('2: a login that showed the browser step says who logged in', async () => {
    credentialSource = 'browser';
    await cliBrowserLoginPromptHandler({
      authorizeUrl: 'https://openam-example.forgeblocks.com/am/oauth2/authorize',
    });
    printMessage.mockClear();

    await expect(getTokens()).resolves.toBe(true);

    expect(printMessage).toHaveBeenCalledWith(
      'Logged in as jdoe@example.com',
      'info'
    );
  });

  test.each(['user', 'svcacct', 'amster', undefined])(
    'a %s login prints no identity line',
    async (source) => {
      credentialSource = source;

      await expect(getTokens()).resolves.toBe(true);

      expect(identityMessages()).toEqual([]);
    }
  );
});
