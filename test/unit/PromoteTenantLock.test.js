import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `frodo config-manager promote lock-tenants` prints the promotion id it
 * locked for, and `unlock-tenants` takes that id back. What must hold:
 *
 * - lock-tenants prints the id under the key `promotionId`, as every other
 *   promotion output does;
 * - unlock-tenants works without `--id`: the library reads the id from the
 *   lock status of the environment;
 * - with `--id` the given id is passed on unchanged;
 * - a failed unlock sets the exit code and does not throw.
 *
 * The library is mocked: this pins how the command and the operations wire it.
 */

const getTokens = jest.fn();
const lockEnvironment = jest.fn();
const unlockEnvironment = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
const verboseMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
    cloud: { env: { promotion: { lockEnvironment, unlockEnvironment } } },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
      this.exitOverride();
    }

    handleDefaultArgsAndOpts() {}
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const { lockTenants } = await import('../../src/ops/cloud/EnvPromotionOps');
const { default: setupUnlock } =
  await import('../../src/cli/config-manager/config-manager-promote/config-manager-promote-unlock-tenants');

async function runUnlock(args) {
  process.exitCode = 0;
  const program = setupUnlock();
  await program.parseAsync(args, { from: 'user' });
  const exitCode = process.exitCode;
  process.exitCode = 0;
  return exitCode;
}

beforeEach(() => {
  jest.clearAllMocks();
  getTokens.mockResolvedValue(true);
});

describe('lock-tenants', () => {
  test('prints the promotion id under the key promotionId', async () => {
    lockEnvironment.mockResolvedValue({
      result: 'locked',
      promotionId: 'promo-1',
    });

    expect(await lockTenants()).toBe(true);

    expect(lockEnvironment).toHaveBeenCalledWith(true);
    expect(printMessage).toHaveBeenCalledWith(
      { status: 'locked', promotionId: 'promo-1' },
      'data'
    );
  });
});

describe('unlock-tenants', () => {
  test('works without --id and leaves the id to the library', async () => {
    unlockEnvironment.mockResolvedValue({ result: 'unlocked' });

    expect(await runUnlock([])).toBe(0);

    expect(unlockEnvironment).toHaveBeenCalledWith(undefined, true);
    expect(printMessage).toHaveBeenCalledWith({ status: 'unlocked' }, 'data');
  });

  test.each([['--id'], ['-i']])(
    'passes the id of %s on unchanged',
    async (flag) => {
      unlockEnvironment.mockResolvedValue({ result: 'unlocked' });

      expect(await runUnlock([flag, 'promo-1'])).toBe(0);

      expect(unlockEnvironment).toHaveBeenCalledWith('promo-1', true);
    }
  );

  test('a failed unlock sets the exit code and reports the error', async () => {
    const error = new Error('the environment has no lock to release');
    unlockEnvironment.mockRejectedValue(error);

    expect(await runUnlock([])).toBe(1);

    expect(printError).toHaveBeenCalledWith(error);
  });

  test('no tokens, no unlock', async () => {
    getTokens.mockResolvedValue(false);

    expect(await runUnlock([])).toBe(1);

    expect(unlockEnvironment).not.toHaveBeenCalled();
  });
});
