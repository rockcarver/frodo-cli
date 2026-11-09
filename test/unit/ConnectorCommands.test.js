import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The option sets of `connector enable` and `connector disable`, parsed from
 * real command lines (frodo-cli#374). `-i` names the connector and is mandatory:
 * a missing one gets a picker from the framework after the login (decision
 * record 0038), so the command carries no picker code and logs in first.
 * `--timeout` exists on `enable` only, is seconds on the command line (core
 * record 0020) and is rejected while parsing when it is not a number of seconds.
 * What the ops functions do with the arguments is covered by
 * ConnectorEnableDisable.test.js.
 */

const getTokens = jest.fn();
const enableConnector = jest.fn();
const disableConnector = jest.fn();

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

    // the rules of the other verbs are covered by ConnectorVerbs.test.js
    requireOneOf() {
      return this;
    }

    multiOp() {
      return this;
    }
  },
  FrodoStubCommand: class extends Command {},
}));
// the colour theme reads the terminal theme of the library
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/ConnectorOps', () => ({
  enableConnector,
  disableConnector,
  // the other verbs of the group are covered by ConnectorVerbs.test.js
  deleteConnector: jest.fn(),
  deleteConnectors: jest.fn(),
  describeConnector: jest.fn(),
  exportConnectorToFile: jest.fn(),
  exportConnectorsToFile: jest.fn(),
  exportConnectorsToFiles: jest.fn(),
  importConnectorFromFile: jest.fn(),
  importConnectorsFromFile: jest.fn(),
  importConnectorsFromFiles: jest.fn(),
  importFirstConnectorFromFile: jest.fn(),
  listConnectors: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));

const { default: setupEnable } =
  await import('../../src/cli/connector/connector-enable');
const { default: setupDisable } =
  await import('../../src/cli/connector/connector-disable');
const { default: setupGroup } =
  await import('../../src/cli/connector/connector');

/** Parses a real command line; commander errors are thrown, not printed. */
async function parse(setup, ...argv) {
  const program = setup();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  await program.parseAsync(argv, { from: 'user' });
}

const idOption = (setup) =>
  setup().options.find((option) => option.long === '--connector-id');

describe('connector enable', () => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    enableConnector.mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('-i passes the id, and no timeout when --timeout is not given', async () => {
    await parse(setupEnable, '-i', 'ZionDirectory');

    expect(enableConnector.mock.calls).toEqual([['ZionDirectory', undefined]]);
    expect(process.exitCode).toBeUndefined();
  });

  test('-i is mandatory, so the framework picks a missing one after the login', () => {
    expect(idOption(setupEnable).mandatory).toBe(true);
  });

  test.each([
    ['60', 60],
    ['1.5', 1.5],
    ['0', 0],
  ])('--timeout %s is %s seconds', async (value, seconds) => {
    await parse(setupEnable, '-i', 'ZionDirectory', '--timeout', value);

    expect(enableConnector.mock.calls[0][1]).toBe(seconds);
  });

  test.each(['abc', '-5', '', 'NaN', 'Infinity'])(
    '--timeout "%s" is rejected while parsing, before anything is sent',
    async (value) => {
      await expect(
        parse(setupEnable, '-i', 'ZionDirectory', '--timeout', value)
      ).rejects.toMatchObject({ code: 'commander.invalidArgument' });

      expect(getTokens).not.toHaveBeenCalled();
      expect(enableConnector).not.toHaveBeenCalled();
    }
  );

  test('the login comes first', async () => {
    let loggedIn = false;
    getTokens.mockImplementation(async () => {
      loggedIn = true;
      return true;
    });
    enableConnector.mockImplementation(async () => {
      expect(loggedIn).toBe(true);
      return true;
    });

    await parse(setupEnable, '-i', 'ZionDirectory');

    expect(enableConnector).toHaveBeenCalledTimes(1);
  });

  test('a failed login or a declined pick runs nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await parse(setupEnable, '-i', 'ZionDirectory');

    expect(enableConnector).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed enable exits 1', async () => {
    enableConnector.mockResolvedValue(false);

    await parse(setupEnable, '-i', 'ZionDirectory');

    expect(process.exitCode).toBe(1);
  });
});

describe('connector disable', () => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    getTokens.mockResolvedValue(true);
    disableConnector.mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('-i passes the id', async () => {
    await parse(setupDisable, '-i', 'ZionDirectory');

    expect(disableConnector.mock.calls).toEqual([['ZionDirectory']]);
    expect(process.exitCode).toBeUndefined();
  });

  test('-i is mandatory, so the framework picks a missing one after the login', () => {
    expect(idOption(setupDisable).mandatory).toBe(true);
  });

  test('there is no --timeout: a disabled connector is gone from the systems, nothing to wait for', async () => {
    await expect(
      parse(setupDisable, '-i', 'ZionDirectory', '--timeout', '5')
    ).rejects.toMatchObject({ code: 'commander.unknownOption' });

    expect(disableConnector).not.toHaveBeenCalled();
  });

  test('a failed login or a declined pick runs nothing and exits 1', async () => {
    getTokens.mockResolvedValue(false);

    await parse(setupDisable, '-i', 'ZionDirectory');

    expect(disableConnector).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed disable exits 1', async () => {
    disableConnector.mockResolvedValue(false);

    await parse(setupDisable, '-i', 'ZionDirectory');

    expect(process.exitCode).toBe(1);
  });
});

describe('the connector group', () => {
  test('has all its verbs, and says it is not frodo conn', () => {
    const group = setupGroup();

    expect(group.commands.map((command) => command.name()).sort()).toEqual([
      'delete',
      'describe',
      'disable',
      'enable',
      'export',
      'import',
      'list',
    ]);
    expect(group.name()).toBe('connector');
  });
});
