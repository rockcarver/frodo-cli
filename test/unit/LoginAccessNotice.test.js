import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

// `frodo login --browser|--device` says what the new session can do after it
// confirms the login: the access profile that the library returned with the
// tokens. A failed login says nothing of the kind.

const getTokens = jest.fn();
const getTokensInteractive = jest.fn();
const printAccessNotice = jest.fn();
const printMessage = jest.fn();
const getAuthMode = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    conn: { saveConnectionProfile: jest.fn() },
    utils: { constants: {} },
  },
  state: {
    getAuthMode,
    getHost: () => 'https://tenant.example.com/am',
    getRealm: () => 'alpha',
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]').argument('[user]').argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    mergeHeadingIntoOptions() {}
  },
  AUTHENTICATION_OPTIONS_HEADING: 'Authentication Options',
  preferredCredentialOption: new Option('--preferred-credential <type>'),
}));
jest.unstable_mockModule('../../src/cli/login/login-setup.js', () => ({
  default: () => new Command('setup'),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
  getTokensInteractive,
  printAccessNotice,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({ printMessage }));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const setup = (await import('../../src/cli/login/login.ts')).default;

const profile = { flow: 'device', areas: [], adaptations: [] };

async function run() {
  const program = setup();
  await program._actionHandler.call(program, [
    'https://tenant.example.com/am',
    undefined,
    undefined,
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.exitCode = 0;
  getAuthMode.mockReturnValue('interactive');
});

describe('frodo login --browser/--device', () => {
  test('1: the access notice follows the line that confirms the login', async () => {
    getTokensInteractive.mockResolvedValue({
      host: 'https://tenant.example.com/am',
      realm: 'alpha',
      subject: 'jdoe@example.com',
      accessProfile: profile,
    });
    const order = [];
    printMessage.mockImplementation(() => order.push('logged-in'));
    printAccessNotice.mockImplementation(() => order.push('notice'));
    await run();
    expect(printMessage).toHaveBeenCalledWith(
      'Logged in to https://tenant.example.com/am [alpha] as jdoe@example.com',
      'info'
    );
    expect(printAccessNotice).toHaveBeenCalledWith(profile);
    expect(order).toEqual(['logged-in', 'notice']);
  });

  test('2: a login that failed says nothing about what it can do, and exits 1', async () => {
    getTokensInteractive.mockResolvedValue(null);
    await run();
    expect(printAccessNotice).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('3: a login with a password or a service account has no notice', async () => {
    getAuthMode.mockReturnValue(undefined);
    getTokens.mockResolvedValue(true);
    await run();
    expect(printAccessNotice).not.toHaveBeenCalled();
  });
});
