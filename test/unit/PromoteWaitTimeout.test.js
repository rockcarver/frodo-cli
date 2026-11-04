import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `--wait` and `--timeout <seconds>` of `config-manager promote run-promotion`,
 * `run-dryrun-promotion` and `rollback`. What must hold:
 *
 * - without `--wait` the library is asked not to wait;
 * - with `--wait` and no `--timeout` the timeout is left to the library, which
 *   has its own default;
 * - `--timeout` is passed on in milliseconds;
 * - `--timeout` without `--wait` is an error and nothing is sent;
 * - a `--timeout` that is not a positive number is an error and nothing is
 *   sent. Passed on as NaN, the library would start the promotion or rollback
 *   and then stop waiting at once.
 *
 * The library is mocked: this pins how the commands and the operations wire it.
 */

const getTokens = jest.fn();
const promoteConfiguration = jest.fn();
const rollbackPromotion = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
const verboseMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
    cloud: { env: { promotion: { promoteConfiguration, rollbackPromotion } } },
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
      this.configureOutput({ writeOut: () => {}, writeErr: () => {} });
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

const dir = '../../src/cli/config-manager/config-manager-promote/';
const { default: setupRunPromotion } = await import(
  `${dir}config-manager-promote-run-promotion`
);
const { default: setupRunDryrunPromotion } = await import(
  `${dir}config-manager-promote-run-dryrun-promotion`
);
const { default: setupRollback } = await import(
  `${dir}config-manager-promote-rollback`
);

async function run(setup, args) {
  process.exitCode = 0;
  let error;
  try {
    await setup().parseAsync(args, { from: 'user' });
  } catch (e) {
    error = e;
  }
  const exitCode = process.exitCode;
  process.exitCode = 0;
  return { exitCode, error };
}

beforeEach(() => {
  jest.clearAllMocks();
  getTokens.mockResolvedValue(true);
  promoteConfiguration.mockResolvedValue('promotion started');
  rollbackPromotion.mockResolvedValue('rollback started');
});

describe.each([
  ['run-promotion', setupRunPromotion, promoteConfiguration],
  ['run-dryrun-promotion', setupRunDryrunPromotion, promoteConfiguration],
  ['rollback', setupRollback, rollbackPromotion],
])('%s', (_name, setup, library) => {
  test('does not wait without --wait', async () => {
    expect((await run(setup, [])).exitCode).toBe(0);

    expect(library).toHaveBeenCalledWith(
      expect.any(Object),
      false,
      undefined,
      undefined
    );
  });

  test('--wait leaves the timeout to the library', async () => {
    expect((await run(setup, ['--wait'])).exitCode).toBe(0);

    expect(library).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      undefined,
      undefined
    );
  });

  test.each([
    [['--wait', '--timeout', '2'], 2000],
    [['-w', '-T', '0.5'], 500],
    [['--wait', '--timeout', '1800'], 1800000],
  ])('%j passes %d ms on', async (args, milliseconds) => {
    expect((await run(setup, args)).exitCode).toBe(0);

    expect(library).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      undefined,
      milliseconds
    );
  });

  test('--timeout without --wait is an error and sends nothing', async () => {
    const { exitCode } = await run(setup, ['--timeout', '5']);

    expect(exitCode).toBe(1);
    expect(printMessage).toHaveBeenCalledWith(
      '--timeout requires --wait.',
      'error'
    );
    expect(getTokens).not.toHaveBeenCalled();
    expect(library).not.toHaveBeenCalled();
  });

  test.each([['abc'], ['1h'], ['0'], ['-5'], ['Infinity'], ['']])(
    '--timeout %j is rejected and sends nothing',
    async (value) => {
      const { error } = await run(setup, ['--wait', '--timeout', value]);

      expect(error?.code).toBe('commander.invalidArgument');
      expect(getTokens).not.toHaveBeenCalled();
      expect(library).not.toHaveBeenCalled();
    }
  );
});
