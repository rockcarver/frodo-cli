import { jest } from '@jest/globals';

// One place launches the default browser for the whole CLI (the browser login
// and the link of `frodo shell --web`), and one switch, `--no-open`, turns it
// off for both. The launcher itself is replaced here; nothing is opened.

const openMock = jest.fn(async () => {});
const printMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    login: { getTokens: jest.fn(), getTokensInteractive: jest.fn() },
    utils: {
      constants: { DEPLOYMENT_TYPES: ['classic', 'cloud', 'forgeops'] },
    },
  },
  state: {},
}));
jest.unstable_mockModule('open', () => ({ default: openMock }));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError: jest.fn(),
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

const {
  cliBrowserLoginPromptHandler,
  isBrowserOpeningEnabled,
  launchBrowser,
  setOpenBrowser,
} = await import('../../src/ops/AuthenticateOps.ts');

const LINK = 'http://127.0.0.1:41234/?t=one-time-secret';

beforeEach(() => {
  openMock.mockReset();
  openMock.mockResolvedValue(undefined);
  printMessage.mockClear();
  setOpenBrowser(true);
});

describe('launchBrowser', () => {
  test('1: opens the address once and says that the launcher started', async () => {
    await expect(launchBrowser(LINK)).resolves.toBe(true);

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith(LINK);
  });

  test('2: a launcher that cannot start is an answer, not an exception', async () => {
    openMock.mockRejectedValue(new Error('spawn xdg-open ENOENT'));

    await expect(launchBrowser(LINK)).resolves.toBe(false);

    expect(openMock).toHaveBeenCalledTimes(1);
  });
});

describe('isBrowserOpeningEnabled', () => {
  test('3: is on until `--no-open` turns it off, and back on when told so', () => {
    expect(isBrowserOpeningEnabled()).toBe(true);

    setOpenBrowser(false);
    expect(isBrowserOpeningEnabled()).toBe(false);

    setOpenBrowser(true);
    expect(isBrowserOpeningEnabled()).toBe(true);
  });
});

describe('the browser login prompt shares the launcher and the switch', () => {
  const prompt = {
    authorizeUrl: 'https://tenant.example.com/am/oauth2/authorize',
  };

  test('4: opens the browser and prints the URL too', async () => {
    await cliBrowserLoginPromptHandler(prompt);

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith(prompt.authorizeUrl);
    expect(printMessage).toHaveBeenCalledWith(`  ${prompt.authorizeUrl}`);
  });

  test('5: with `--no-open` it only prints the URL', async () => {
    setOpenBrowser(false);

    await cliBrowserLoginPromptHandler(prompt);

    expect(openMock).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledWith(`  ${prompt.authorizeUrl}`);
  });

  test('6: a browser that does not open still gets the URL, with a warning', async () => {
    openMock.mockRejectedValue(new Error('no browser'));

    await cliBrowserLoginPromptHandler(prompt);

    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('Could not open a browser automatically'),
      'warn'
    );
    expect(printMessage).toHaveBeenCalledWith(`  ${prompt.authorizeUrl}`);
  });
});
