import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Command } from 'commander';

/**
 * `realm describe`, `conn describe` and `log key describe` (cli#1287). The
 * operation prints what it found and says whether it could; the command ends
 * with exit code 1 when it could not (record 0033: the code sets the exit code
 * and returns), and with 0 when it did. The operations are spies here: what they
 * print and when they fail is tested in DescribeNothingThereOutcome.test.js, and
 * the commands through the real CLI in DescribeNothingThereFakeAm.test.js.
 */

const getTokens = jest.fn();
const realmOps = { describeRealm: jest.fn() };
const connOps = { describeConnectionProfile: jest.fn() };
const logOps = { describeLogApiKey: jest.fn(), describeLogApiKeys: jest.fn() };

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      constants: {},
      getRealmName: (realm) => realm.split('/').pop(),
    },
  },
  state: { getRealm: () => '/alpha' },
}));
/** How many positional arguments (host, realm, user, password) each command declares. */
const ARGUMENTS = {
  'frodo realm describe': 4,
  'frodo conn describe': 1,
  'frodo log key describe': 3,
};
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(name, ...rest) {
      super(name, ...rest);
      for (let i = 0; i < ARGUMENTS[name]; i++) this.argument(`[arg${i}]`);
    }

    handleDefaultArgsAndOpts() {}
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/RealmOps', () => realmOps);
jest.unstable_mockModule('../../src/ops/ConnectionProfileOps', () => connOps);
jest.unstable_mockModule('../../src/ops/LogOps', () => logOps);

const realmDescribe = (await import('../../src/cli/realm/realm-describe'))
  .default;
const connDescribe = (await import('../../src/cli/conn/conn-describe')).default;
const logKeyDescribe = (await import('../../src/cli/log/log-key-describe'))
  .default;

/** Runs the action of `program` with the options set and no positional arguments. */
async function invoke(program, options = {}) {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, []);
  return process.exitCode;
}

beforeEach(() => {
  jest.resetAllMocks();
  getTokens.mockResolvedValue(true);
});

describe('frodo realm describe', () => {
  test('ends with exit code 0 when the realm was described, and describes the realm of the connection', async () => {
    realmOps.describeRealm.mockResolvedValue(true);

    expect(await invoke(realmDescribe())).toBe(0);
    expect(realmOps.describeRealm.mock.calls).toEqual([['alpha']]);
  });

  test('ends with exit code 1 when the realm could not be described (not there, failed read)', async () => {
    realmOps.describeRealm.mockResolvedValue(false);

    expect(await invoke(realmDescribe())).toBe(1);
  });

  test('ends with exit code 1 when the login failed, and describes nothing', async () => {
    getTokens.mockResolvedValue(false);

    expect(await invoke(realmDescribe())).toBe(1);
    expect(realmOps.describeRealm).not.toHaveBeenCalled();
  });
});

describe('frodo conn describe', () => {
  test('ends with exit code 0 when the profile was described, and passes --show-secrets on', async () => {
    connOps.describeConnectionProfile.mockResolvedValue(true);

    expect(await invoke(connDescribe(), { showSecrets: true })).toBe(0);
    expect(connOps.describeConnectionProfile.mock.calls).toEqual([
      [undefined, true],
    ]);
  });

  test('ends with exit code 1 when there is no profile for the host', async () => {
    connOps.describeConnectionProfile.mockResolvedValue(false);

    expect(await invoke(connDescribe())).toBe(1);
  });
});

describe('frodo log key describe', () => {
  test('-i describes that key, and ends with exit code 0 when it was described', async () => {
    logOps.describeLogApiKey.mockResolvedValue(true);

    expect(await invoke(logKeyDescribe(), { keyId: 'zion-key' })).toBe(0);
    expect(logOps.describeLogApiKey.mock.calls).toEqual([
      ['zion-key', undefined],
    ]);
    expect(logOps.describeLogApiKeys).not.toHaveBeenCalled();
  });

  test('-i ends with exit code 1 when the key is not there or cannot be read', async () => {
    logOps.describeLogApiKey.mockResolvedValue(false);

    expect(await invoke(logKeyDescribe(), { keyId: 'zion-key' })).toBe(1);
  });

  test('without -i describes all the keys, and --json is passed on', async () => {
    logOps.describeLogApiKeys.mockResolvedValue(true);

    expect(await invoke(logKeyDescribe(), { json: true })).toBe(0);
    expect(logOps.describeLogApiKeys.mock.calls).toEqual([[true]]);
    expect(logOps.describeLogApiKey).not.toHaveBeenCalled();
  });

  test('without -i ends with exit code 1 when the keys cannot be read', async () => {
    logOps.describeLogApiKeys.mockResolvedValue(false);

    expect(await invoke(logKeyDescribe())).toBe(1);
  });

  test('ends with exit code 1 when the login failed, and describes nothing', async () => {
    getTokens.mockResolvedValue(false);

    expect(await invoke(logKeyDescribe(), { keyId: 'zion-key' })).toBe(1);
    expect(logOps.describeLogApiKey).not.toHaveBeenCalled();
    expect(logOps.describeLogApiKeys).not.toHaveBeenCalled();
  });
});
