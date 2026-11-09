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
 * The command `config-manager delete applications` (records 0037, 0040, 0041 and
 * 0042): it adds the shared `--allow-failures` option (`.multiOp()`), runs for
 * Cloud and ForgeOps, refuses a bulk delete that nobody can be asked about before
 * it logs in, asks before more than one application is deleted (the plan comes
 * from the ops function), never asks for a single named application and hands the
 * name, the realm, the dry run and `--allow-failures` to the ops function. What
 * the ops function does is covered by ApplicationConfigDelete.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerDeleteApplications = jest.fn();
const showApplicationDeletePlan = jest.fn();
let events;
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
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/ApplicationConfigDeleteOps', () => ({
  configManagerDeleteApplications,
  showApplicationDeletePlan,
}));

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-applications');

const run = (...args) => {
  const program = setup();
  return program.parseAsync(args, { from: 'user' }).then(() => program);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.exitCode = undefined;
  events = [];
  checkBulkDelete.mockImplementation(() => {
    events.push('check');
    return true;
  });
  getTokens.mockImplementation(async () => {
    events.push('login');
    return true;
  });
  confirmBulkDelete.mockImplementation(async () => {
    events.push('confirm');
    return true;
  });
  configManagerDeleteApplications.mockImplementation(async () => {
    events.push('delete');
    return true;
  });
  showApplicationDeletePlan.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager delete applications', () => {
  test('is a multi-operation command, for Cloud and ForgeOps', async () => {
    const program = await run('-y');

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager delete applications');
    expect(constructed[2]).toEqual(['cloud', 'forgeops']);
  });

  test('a bulk delete is checked before the login, asked after it, and deleted last', async () => {
    await run('matrix', 'alpha');

    expect(events).toEqual(['check', 'login', 'confirm', 'delete']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all applications and the objects they own',
      yes: undefined,
      dryRun: undefined,
    });
    expect(process.exitCode).toBeUndefined();
  });

  test('a bulk delete that nobody can be asked about is refused before the login and deletes nothing', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run('matrix', 'alpha');

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteApplications).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('matrix', 'alpha');

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(configManagerDeleteApplications).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('the question is told what is deleted, the -y and -d options, and shows the plan for the realm', async () => {
    await run('-y', 'matrix', 'alpha');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('all applications and the objects they own');
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBeUndefined();

    showApplicationDeletePlan.mockResolvedValue(true);
    await expect(guard.showPlan()).resolves.toBe(true);
    expect(showApplicationDeletePlan).toHaveBeenCalledWith(undefined, 'alpha');
  });

  test('--yes goes on to the delete', async () => {
    await run('-y', 'matrix', 'alpha');

    expect(configManagerDeleteApplications).toHaveBeenCalledWith(
      undefined,
      'alpha',
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a dry run is handed to the ops function and is not asked about', async () => {
    await run('-d', 'matrix', 'alpha');

    expect(configManagerDeleteApplications).toHaveBeenCalledWith(
      undefined,
      'alpha',
      true,
      undefined
    );
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
  });

  test('a named application is deleted without a check and without a question', async () => {
    await run('-n', 'Zion Portal', 'matrix', 'alpha');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login', 'delete']);
    expect(configManagerDeleteApplications).toHaveBeenCalledWith(
      'Zion Portal',
      'alpha',
      undefined,
      undefined
    );
  });

  test('logs in for those deployment types', async () => {
    await run('-n', 'Zion Portal', 'matrix', 'alpha');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud', 'forgeops']);
  });

  test('the value of --allow-failures reaches the ops function', async () => {
    await run('-n', 'Zion Portal', '--allow-failures', 'matrix', 'alpha');

    expect(configManagerDeleteApplications).toHaveBeenCalledWith(
      'Zion Portal',
      'alpha',
      undefined,
      true
    );
  });

  test('a failed login exits 1 and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-n', 'Zion Portal', 'matrix', 'alpha');

    expect(configManagerDeleteApplications).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails exits 1', async () => {
    configManagerDeleteApplications.mockResolvedValue(false);

    await run('-n', 'Zion Portal', 'matrix', 'alpha');

    expect(process.exitCode).toBe(1);
  });
});
