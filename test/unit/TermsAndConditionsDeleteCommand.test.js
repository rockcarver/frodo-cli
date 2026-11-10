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
 * The command `config-manager delete terms-and-conditions` (records 0037, 0040
 * and 0041): it adds the shared `--allow-failures` option (`.multiOp()`), runs
 * for Cloud and ForgeOps, refuses a delete of all versions that nobody can be
 * asked about before it logs in, asks before all versions are deleted (the plan
 * comes from the ops function), never asks for a version that is named, and
 * hands the name, the dry run and `--allow-failures` to the ops function. An
 * empty name is not "all": it is not asked about and the ops function rejects
 * it. What the ops function does is covered by
 * FrConfigTermsAndConditionsDelete.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerDeleteTermsAndConditions = jest.fn();
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
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigTermsAndConditionsOps',
  () => ({
    configManagerDeleteTermsAndConditions,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-terms-and-conditions');

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
  configManagerDeleteTermsAndConditions.mockImplementation(async () => {
    events.push('delete');
    return true;
  });
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager delete terms-and-conditions', () => {
  test('is a multi-operation command, for Cloud and ForgeOps', async () => {
    const program = await run('-y');

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe(
      'frodo config-manager delete terms-and-conditions'
    );
    expect(constructed[2]).toEqual(['cloud', 'forgeops']);
  });

  test('deleting all versions is checked before the login, asked after it, and deleted last', async () => {
    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm', 'delete']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all terms and conditions versions',
      yes: undefined,
      dryRun: undefined,
    });
    expect(process.exitCode).toBeUndefined();
  });

  test('a delete that nobody can be asked about is refused before the login and deletes nothing', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteTermsAndConditions).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(configManagerDeleteTermsAndConditions).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('the question is told what is deleted and the -y and -d options, and its plan is the dry run of all versions', async () => {
    await run('-y', 'matrix');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('all terms and conditions versions');
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBeUndefined();

    configManagerDeleteTermsAndConditions.mockResolvedValue(true);
    configManagerDeleteTermsAndConditions.mockClear();
    await expect(guard.showPlan()).resolves.toBe(true);
    expect(configManagerDeleteTermsAndConditions).toHaveBeenCalledWith(
      undefined,
      true
    );
  });

  test('--yes goes on to the delete', async () => {
    await run('-y', 'matrix');

    expect(configManagerDeleteTermsAndConditions).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a dry run is handed to the ops function and is not asked about', async () => {
    await run('-d', 'matrix');

    expect(configManagerDeleteTermsAndConditions).toHaveBeenCalledWith(
      undefined,
      true,
      undefined
    );
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
  });

  test('a named version is deleted without a check and without a question', async () => {
    await run('-n', '0.1', 'matrix');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login', 'delete']);
    expect(configManagerDeleteTermsAndConditions).toHaveBeenCalledWith(
      '0.1',
      undefined,
      undefined
    );
  });

  test('an empty name is not "all": nothing is asked, and the ops function gets the empty name and decides', async () => {
    configManagerDeleteTermsAndConditions.mockResolvedValue(false);

    await run('-n', '', 'matrix');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteTermsAndConditions).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteTermsAndConditions).toHaveBeenCalledWith(
      '',
      undefined,
      undefined
    );
    expect(process.exitCode).toBe(1);
  });

  test('logs in for those deployment types', async () => {
    await run('-n', '0.1', 'matrix');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud', 'forgeops']);
  });

  test('the value of --allow-failures reaches the ops function', async () => {
    await run('-y', '--allow-failures', 'matrix');

    expect(configManagerDeleteTermsAndConditions).toHaveBeenCalledWith(
      undefined,
      undefined,
      true
    );
  });

  test('a failed login exits 1 and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-n', '0.1', 'matrix');

    expect(configManagerDeleteTermsAndConditions).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails exits 1', async () => {
    configManagerDeleteTermsAndConditions.mockResolvedValue(false);

    await run('-n', '0.1', 'matrix');

    expect(process.exitCode).toBe(1);
  });
});
