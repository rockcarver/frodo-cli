import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { Command } from 'commander';

/**
 * The command `config-manager pull applications` (record 0040 and 0042): it adds
 * the shared `--allow-failures` option (`.multiOp()`), runs for Cloud and ForgeOps,
 * logs in first, hands the name, the realm and the value of `--allow-failures` to
 * the ops function, and exits 1 when the login fails or the ops function reports a
 * failure. What the ops function does is covered by ApplicationConfigPull.test.js.
 */

const getTokens = jest.fn();
const configManagerExportApplications = jest.fn();
let constructed;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  state: {},
  frodo: {
    utils: {
      constants: {
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(args[0]);
      constructed = args;
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    multiOp() {
      this.multiOpCalled = true;
      return this.option('--allow-failures');
    }
  },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/ApplicationConfigOps', () => ({
  configManagerExportApplications,
}));

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-pull/config-manager-pull-applications');

const run = (...args) => {
  const program = setup();
  return program.parseAsync(args, { from: 'user' }).then(() => program);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.exitCode = undefined;
  getTokens.mockResolvedValue(true);
  configManagerExportApplications.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager pull applications', () => {
  test('is a multi-operation command, for Cloud and ForgeOps', async () => {
    const program = await run();

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager pull applications');
    expect(constructed[2]).toEqual(['cloud', 'forgeops']);
  });

  test('logs in for those deployment types, then pulls what was asked: name, realm and the value of --allow-failures', async () => {
    await run('-n', 'Zion Portal', '--allow-failures', 'matrix', 'alpha');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud', 'forgeops']);
    expect(configManagerExportApplications).toHaveBeenCalledWith(
      'Zion Portal',
      'alpha',
      false,
      true
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('without a name and without a realm it pulls everything, and failures are not allowed by default', async () => {
    await run('matrix');

    expect(configManagerExportApplications).toHaveBeenCalledWith(
      undefined,
      undefined,
      false,
      undefined
    );
  });

  test('a failed login exits 1 and pulls nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('matrix', 'alpha');

    expect(configManagerExportApplications).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a pull that fails exits 1', async () => {
    configManagerExportApplications.mockResolvedValue(false);

    await run('matrix', 'alpha');

    expect(process.exitCode).toBe(1);
  });
});
