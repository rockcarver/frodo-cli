import { jest } from '@jest/globals';
import { Command } from 'commander';

// `frodo info` shows what an interactive login can do, from the access
// profile of the library: in the human output, and as `accessProfile` in the
// JSON. A service account, a user session and a deployment without a profile
// print what they always printed.

const getTokens = jest.fn();
const printMessage = jest.fn();
const getInfo = jest.fn();
const getAccessProfile = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    info: { getInfo },
    login: { getAccessProfile },
    utils: { constants: {} },
  },
  state: { getCookieValue: () => undefined, getBearerToken: () => undefined },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]').argument('[user]').argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
  },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
  createObjectTable: () => ({ toString: () => '<table>' }),
}));

const setup = (await import('../../src/cli/info/info.ts')).default;

const area = (id, title, reachable) => ({
  id,
  title,
  scopes: [],
  reachable,
  basis: [],
});
const profileOf = (flow) => ({
  flow,
  clientId: 'AICMCPClient',
  expiresAt: Date.now() + 29 * 60_000,
  refreshable: false,
  grantedScopes: [],
  scopesNotGranted: [],
  amSession: 'present',
  adaptations: [],
  areas: [
    area('am', 'Access Management', 'yes'),
    area('governance', 'Governance', 'no'),
  ],
  measuredOn: '2026-11-14',
});

async function run(options) {
  const program = setup();
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, [undefined, undefined, undefined]);
}

const printed = (type) =>
  printMessage.mock.calls
    .filter(([, t]) => t === type)
    .map(([message]) => message);
const jsonOutput = () => JSON.parse(printed('data')[0]);

beforeEach(() => {
  jest.clearAllMocks();
  getTokens.mockResolvedValue(true);
  getInfo.mockResolvedValue({
    host: 'https://openam-example.forgeblocks.com/am',
    amVersion: '8.0.0',
    deploymentType: 'cloud',
  });
  getAccessProfile.mockReturnValue(profileOf('browser'));
});

describe('frodo info and the access profile', () => {
  test('1: the human output says what a browser login can do, after the table', async () => {
    await run({});
    const all = printMessage.mock.calls.map(([message]) => message).join('\n');
    expect(all).toContain('<table>');
    expect(all).toContain('What this browser login can do:');
    expect(all).toMatch(/Can reach: +Access Management/);
    expect(all.indexOf('<table>')).toBeLessThan(
      all.indexOf('What this browser login can do:')
    );
  });

  test('2: --json carries the profile as accessProfile', async () => {
    await run({ json: true });
    const output = jsonOutput();
    expect(output.accessProfile.flow).toBe('browser');
    expect(output.accessProfile.areas.map((a) => a.id)).toEqual([
      'am',
      'governance',
    ]);
    expect(output.host).toBe('https://openam-example.forgeblocks.com/am');
  });

  test('3: --scriptFriendly prints the same JSON', async () => {
    await run({ scriptFriendly: true });
    expect(jsonOutput().accessProfile.flow).toBe('browser');
  });

  test('4: a device login is described too', async () => {
    getAccessProfile.mockReturnValue(profileOf('device'));
    await run({});
    expect(printMessage.mock.calls.map(([message]) => message)).toContain(
      '\nWhat this device login can do:'
    );
  });

  test.each(['service-account', 'external-token'])(
    '5: a %s prints what it always printed',
    async (flow) => {
      getAccessProfile.mockReturnValue(profileOf(flow));
      await run({ json: true });
      expect(jsonOutput()).not.toHaveProperty('accessProfile');
      printMessage.mockClear();
      await run({});
      expect(printMessage.mock.calls.map(([m]) => m).join('\n')).not.toContain(
        'can do'
      );
    }
  );

  test('6: no profile (a user session, not a Cloud tenant): nothing is added', async () => {
    getAccessProfile.mockReturnValue(undefined);
    await run({ json: true });
    expect(jsonOutput()).not.toHaveProperty('accessProfile');
  });

  test('7: a failed login prints no profile and exits 1', async () => {
    getTokens.mockResolvedValue(false);
    process.exitCode = 0;
    await run({});
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    expect(getInfo).not.toHaveBeenCalled();
  });
});
