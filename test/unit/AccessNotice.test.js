import { jest } from '@jest/globals';

// After a NEW interactive login the command line says what the session can do
// (frodo-lib's access profile). Not after a session reused from the cache, not
// when stdout is not a terminal, not with --json, and once per process.

const frodoGetTokens = jest.fn();
const printMessage = jest.fn();
let credentialSource;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    login: {
      getTokens: frodoGetTokens,
      getTokensInteractive: jest.fn(),
    },
    utils: {
      constants: { DEPLOYMENT_TYPES: ['classic', 'cloud', 'forgeops'] },
    },
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
  getTokens,
  cliBrowserLoginPromptHandler,
  printAccessNotice,
  resetAccessNoticeForTests,
} = await import('../../src/ops/AuthenticateOps.ts');
const { setMachineOutput } = await import('../../src/utils/MachineOutput.ts');

const area = (id, title, reachable, reason) => ({
  id,
  title,
  scopes: [],
  reachable,
  ...(reason ? { reason } : {}),
  basis: [],
});
/** What the library reports for a browser login, cut down to three areas. */
const profile = {
  flow: 'browser',
  clientId: 'AICMCPClient',
  expiresAt: Date.now() + 29 * 60_000,
  refreshable: false,
  grantedScopes: [],
  scopesNotGranted: [],
  amSession: 'present',
  adaptations: [],
  areas: [
    area('am', 'Access Management', 'yes'),
    area('idm', 'Identity Management', 'yes'),
    area('governance', 'Governance', 'no', 'scope-not-offered'),
  ],
  measuredOn: '2026-11-14',
};

const shown = () =>
  printMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => /What this .* can do/.test(message));

const setTty = (value) =>
  Object.defineProperty(process.stdout, 'isTTY', {
    value,
    configurable: true,
  });

const realTty = process.stdout.isTTY;

beforeEach(() => {
  printMessage.mockClear();
  frodoGetTokens.mockReset();
  frodoGetTokens.mockResolvedValue({
    subject: 'jdoe@example.com',
    accessProfile: profile,
  });
  credentialSource = 'browser';
  setTty(true);
  setMachineOutput(false);
  resetAccessNoticeForTests();
});

afterAll(() => setTty(realTty));

describe('the notice after an interactive login', () => {
  test('1: a session reused from the cache says whose it is and nothing about what it can do', async () => {
    await expect(getTokens()).resolves.toBe(true);
    expect(printMessage).toHaveBeenCalledWith(
      'Using the saved browser login of jdoe@example.com',
      'info'
    );
    expect(shown()).toEqual([]);
  });

  test('2: a new login names the account and then says what the session can do', async () => {
    await cliBrowserLoginPromptHandler({
      authorizeUrl:
        'https://openam-example.forgeblocks.com/am/oauth2/authorize',
    });
    printMessage.mockClear();

    await expect(getTokens()).resolves.toBe(true);

    const messages = printMessage.mock.calls.map(([message]) => message);
    expect(messages[0]).toBe('Logged in as jdoe@example.com');
    expect(messages[1]).toBe('What this browser login can do:');
    expect(messages.join('\n')).toMatch(
      /Can reach: +Access Management, Identity Management/
    );
    expect(messages.join('\n')).toMatch(
      /Cannot reach: +Governance \(need a service account\)/
    );
    // the heading is in the info color, like the line above it
    expect(printMessage).toHaveBeenCalledWith(
      'What this browser login can do:',
      'info'
    );
  });

  test('3: it is said once per process', async () => {
    await getTokens();
    await getTokens();
    expect(shown()).toHaveLength(1);
  });

  test('4: not when stdout is not a terminal', async () => {
    setTty(false);
    await getTokens();
    expect(shown()).toEqual([]);
    // the identity line is not affected
    expect(printMessage).toHaveBeenCalledWith(
      'Logged in as jdoe@example.com',
      'info'
    );
  });

  test('5: not when the command prints for a machine (--json)', async () => {
    setMachineOutput(true);
    await getTokens();
    expect(shown()).toEqual([]);
  });

  test('6: not when the library has no profile (not a Cloud tenant, no access token)', async () => {
    frodoGetTokens.mockResolvedValue({ subject: 'jdoe@example.com' });
    await getTokens();
    expect(shown()).toEqual([]);
  });

  test.each(['user', 'svcacct', 'amster', undefined])(
    '7: a %s login prints no notice',
    async (source) => {
      credentialSource = source;
      await getTokens();
      expect(shown()).toEqual([]);
    }
  );

  test('8: printAccessNotice (the login command) follows the same rules', () => {
    setTty(false);
    printAccessNotice(profile);
    expect(shown()).toEqual([]);
    setTty(true);
    printAccessNotice(undefined);
    expect(shown()).toEqual([]);
    printAccessNotice(profile);
    expect(shown()).toHaveLength(1);
  });
});
