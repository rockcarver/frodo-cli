import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The option sets of `app enable` and `app disable`, parsed from real command
 * lines (frodo-cli#1153). `-i` and `-n` name the application and exclude each
 * other; a missing one gets a picker from the framework after the login
 * (decision record 0038), so the command carries no picker code and logs in
 * first. `--timeout` exists on `enable` only, is seconds on the command line
 * (core record 0020) and is rejected while parsing when it is not a number of
 * seconds. What the ops functions do with the arguments is covered by
 * ApplicationEnableDisable.test.js.
 */

const getTokens = jest.fn();
const enableApplication = jest.fn();
const disableApplication = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: {},
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
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
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf() {
      return this;
    }
    multiOp() {
      return this;
    }
  },
}));
// the colour theme reads the terminal theme of the library
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/ApplicationOps', () => ({
  enableApplication,
  disableApplication,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));

const { default: setupEnable } = await import('../../src/cli/app/app-enable');
const { default: setupDisable } = await import('../../src/cli/app/app-disable');

/** Parses a real command line; commander errors are thrown, not printed. */
async function parse(setup, ...argv) {
  const program = setup();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  await program.parseAsync(argv, { from: 'user' });
}

describe('app enable', () => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    enableApplication.mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('-n passes the name, and no timeout when --timeout is not given', async () => {
    await parse(setupEnable, '-n', 'ZionDirectory');

    expect(enableApplication.mock.calls).toEqual([
      [undefined, 'ZionDirectory', undefined],
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  test('-i passes the id', async () => {
    await parse(setupEnable, '-i', 'abc-123');

    expect(enableApplication.mock.calls).toEqual([
      ['abc-123', undefined, undefined],
    ]);
  });

  test.each([
    ['60', 60],
    ['1.5', 1.5],
    ['0', 0],
  ])('--timeout %s is %s seconds', async (value, seconds) => {
    await parse(setupEnable, '-n', 'ZionDirectory', '--timeout', value);

    expect(enableApplication.mock.calls[0][2]).toBe(seconds);
  });

  test.each(['abc', '-5', '', 'NaN', 'Infinity'])(
    '--timeout "%s" is rejected while parsing, before anything is sent',
    async (value) => {
      await expect(
        parse(setupEnable, '-n', 'ZionDirectory', '--timeout', value)
      ).rejects.toMatchObject({ code: 'commander.invalidArgument' });

      expect(getTokens).not.toHaveBeenCalled();
      expect(enableApplication).not.toHaveBeenCalled();
    }
  );

  test('-i and -n exclude each other', async () => {
    await expect(
      parse(setupEnable, '-i', 'abc-123', '-n', 'ZionDirectory')
    ).rejects.toMatchObject({ code: 'commander.conflictingOption' });

    expect(enableApplication).not.toHaveBeenCalled();
  });

  test('the login comes first: a missing -i/-n is picked by the framework inside getTokens', async () => {
    let loggedIn = false;
    getTokens.mockImplementation(async () => {
      loggedIn = true;
      return true;
    });
    enableApplication.mockImplementation(async () => {
      expect(loggedIn).toBe(true);
      return true;
    });

    await parse(setupEnable);

    expect(enableApplication).toHaveBeenCalledTimes(1);
  });

  test('a failed login or a declined pick runs nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await parse(setupEnable, '-n', 'ZionDirectory');

    expect(enableApplication).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed enable exits 1', async () => {
    enableApplication.mockResolvedValue(false);

    await parse(setupEnable, '-n', 'ZionDirectory');

    expect(process.exitCode).toBe(1);
  });
});

describe('app disable', () => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    disableApplication.mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('-n passes the name, -i the id', async () => {
    await parse(setupDisable, '-n', 'ZionDirectory');
    await parse(setupDisable, '-i', 'abc-123');

    expect(disableApplication.mock.calls).toEqual([
      [undefined, 'ZionDirectory'],
      ['abc-123', undefined],
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  test('there is no --timeout: a disabled connector is gone from the systems, nothing to wait for', async () => {
    await expect(
      parse(setupDisable, '-n', 'ZionDirectory', '--timeout', '5')
    ).rejects.toMatchObject({ code: 'commander.unknownOption' });

    expect(disableApplication).not.toHaveBeenCalled();
  });

  test('-i and -n exclude each other', async () => {
    await expect(
      parse(setupDisable, '-i', 'abc-123', '-n', 'ZionDirectory')
    ).rejects.toMatchObject({ code: 'commander.conflictingOption' });
  });

  test('a failed login or a declined pick runs nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await parse(setupDisable, '-n', 'ZionDirectory');

    expect(disableApplication).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed disable exits 1', async () => {
    disableApplication.mockResolvedValue(false);

    await parse(setupDisable, '-n', 'ZionDirectory');

    expect(process.exitCode).toBe(1);
  });
});
