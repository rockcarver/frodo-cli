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
 * The command `config-manager migrate applications` (record 0040 and 0042): it adds
 * the shared `--allow-failures` option (`.multiOp()`), runs for Cloud and ForgeOps,
 * logs in first, hands the realm, `--dry-run`, the value of `--allow-failures` and
 * the config folder to the ops function, and exits 1 when the login fails or the
 * ops function reports a failure. What the ops function does is covered by
 * ApplicationMigrate.test.js.
 */

const getTokens = jest.fn();
const configManagerMigrateApplications = jest.fn();
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
    usesRealm() {
      return this;
    }
    multiOp() {
      this.multiOpCalled = true;
      return this.option('--allow-failures');
    }
  },
  FrodoStubCommand: class extends Command {},
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
jest.unstable_mockModule('../../src/utils/TreeLayout', () => ({
  TREE_LAYOUT_MARKER_FILE: 'frodo-config-manager.json',
}));
jest.unstable_mockModule('../../src/ops/ApplicationMigrateOps', () => ({
  configManagerMigrateApplications,
}));

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-migrate/config-manager-migrate-applications');
const { default: setupGroup } =
  await import('../../src/cli/config-manager/config-manager-migrate/config-manager-migrate');

const run = (...args) => {
  const program = setup();
  return program.parseAsync(args, { from: 'user' }).then(() => program);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.exitCode = undefined;
  getTokens.mockResolvedValue(true);
  configManagerMigrateApplications.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager migrate applications', () => {
  test('is a multi-operation command, for Cloud and ForgeOps', async () => {
    const program = await run();

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager migrate applications');
    expect(constructed[2]).toEqual(['cloud', 'forgeops']);
  });

  test('logs in for those deployment types, then migrates what was asked: realm, dry run, --allow-failures and config folder', async () => {
    await run('-d', '--allow-failures', '-C', '../config', 'matrix', 'alpha');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud', 'forgeops']);
    expect(configManagerMigrateApplications).toHaveBeenCalledWith(
      'alpha',
      true,
      true,
      '../config'
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('without options it migrates every realm for real, and failures are not allowed', async () => {
    await run('matrix');

    expect(configManagerMigrateApplications).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined
    );
  });

  test('a failed login exits 1 and migrates nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('matrix', 'alpha');

    expect(configManagerMigrateApplications).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a migration that fails exits 1', async () => {
    configManagerMigrateApplications.mockResolvedValue(false);

    await run('matrix', 'alpha');

    expect(process.exitCode).toBe(1);
  });

  test('asks nothing: it has no confirmation option, and --dry-run is how to look first', async () => {
    const program = await run();

    expect(program.options.map((option) => option.long)).toEqual([
      '--dry-run',
      '--config-folder',
      '--allow-failures',
    ]);
  });
});

describe('frodo config-manager migrate', () => {
  test('is a group with one command: applications', () => {
    const group = setupGroup();

    expect(group.name()).toBe('migrate');
    expect(group.commands.map((command) => command.name())).toEqual([
      'applications',
    ]);
  });
});
