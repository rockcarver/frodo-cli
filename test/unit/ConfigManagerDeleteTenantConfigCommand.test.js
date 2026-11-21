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
 * The command `config-manager delete tenant-config`, which deletes all ESV
 * secrets and all ESV variables of a Cloud tenant and nothing else. It follows
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md
 * (a delete of more than the one object it names asks first) and
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md
 * (run all the operations, then fail if any failed): it runs for Cloud only,
 * takes no selector, reads the connection arguments, refuses a run that nobody
 * can be asked about before it logs in, asks after the login (with a plan that
 * reads both lists and deletes nothing) before it deletes, never asks for a dry
 * run or with `--yes`, deletes the secrets and then the variables with the dry
 * run and `--allow-failures` of the command line, runs the second half although
 * the first failed, and exits 1 if either half failed. Its usage examples carry
 * `-y` or `--dry-run`, so that they run as written without a prompt. What the
 * two operations do is covered by FrConfigSecretDelete.test.js and
 * FrConfigVariableDelete.test.js; the refusal without a terminal, through the
 * real CLI, by test/client_cli/en/config-manager-delete-guard.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerDeleteSecrets = jest.fn();
const showSecretDeletePlan = jest.fn();
const configManagerDeleteVariables = jest.fn();
const printMessage = jest.fn();
const handleDefaultArgsAndOpts = jest.fn();
let events;
let constructed;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
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
      super(args[0]);
      constructed = args;
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts(...args) {
      handleDefaultArgsAndOpts(...args);
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
  printMessage,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigSecretOps',
  () => ({
    configManagerDeleteSecrets,
    showSecretDeletePlan,
  })
);
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigVariableOps',
  () => ({
    configManagerDeleteVariables,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-tenant-config');

const WHAT = 'all ESV secrets and all ESV variables';

const run = (...args) => {
  const program = setup();
  return program.parseAsync(args, { from: 'user' }).then(() => program);
};

beforeEach(() => {
  jest.clearAllMocks();
  printMessage.mockReset();
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
  configManagerDeleteSecrets.mockImplementation(async () => {
    events.push('delete secrets');
    return true;
  });
  configManagerDeleteVariables.mockImplementation(async (name, dryRun) => {
    events.push(dryRun ? 'plan variables' : 'delete variables');
    return true;
  });
  showSecretDeletePlan.mockImplementation(async () => {
    events.push('plan secrets');
    return true;
  });
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager delete tenant-config', () => {
  test('is a multi-operation command, for Cloud only', async () => {
    const program = await run('-y');

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager delete tenant-config');
    expect(constructed[2]).toEqual(['cloud']);
  });

  test('logs in for Cloud only', async () => {
    await run('-y');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud']);
  });

  test('takes no selector: only the dry run, --yes and --allow-failures', async () => {
    const program = await run('-y');

    expect(program.options.map((option) => option.long).sort()).toEqual([
      '--allow-failures',
      '--dry-run',
      '--yes',
    ]);
  });

  test('says in its help that it deletes ESV secrets and ESV variables only, and that secret values cannot be recovered', async () => {
    const program = await run('-y');

    expect(program.description()).toContain('ESV secrets');
    expect(program.description()).toContain('ESV variables');
    expect(program.description()).toContain('and nothing else');
    expect(program.description()).toContain(
      'Deleted secret values cannot be recovered.'
    );
  });
});

describe('the command line', () => {
  test('hands the connection arguments and the options to the framework', async () => {
    const program = await run('-y', 'matrix', 'alpha');

    expect(handleDefaultArgsAndOpts).toHaveBeenCalledTimes(1);
    const [host, realm, user, password, options, command] =
      handleDefaultArgsAndOpts.mock.calls[0];
    expect(host).toBe('matrix');
    expect(realm).toBe('alpha');
    expect(user).toBeUndefined();
    expect(password).toBeUndefined();
    expect(options.yes).toBe(true);
    expect(command).toBe(program);
  });

  test('has usage examples that run as written without a prompt: each carries -y or --dry-run', async () => {
    const program = await run('-y');
    let help = '';
    program.configureOutput({
      writeOut: (text) => {
        help += text;
      },
      writeErr: (text) => {
        help += text;
      },
    });
    program.outputHelp();

    const examples = help
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('$ frodo config-manager delete'));
    expect(examples.length).toBe(2);
    for (const example of examples) {
      expect(example).toMatch(
        /^\$ frodo config-manager delete tenant-config (-y|--dry-run) /
      );
    }
    expect(examples.some((example) => example.includes(' -y '))).toBe(true);
    expect(examples.some((example) => example.includes('--dry-run'))).toBe(
      true
    );
  });
});

describe('the order of the steps', () => {
  test('the check comes before the login, the question after it, the secrets before the variables', async () => {
    await run('matrix');

    expect(events).toEqual([
      'check',
      'login',
      'confirm',
      'delete secrets',
      'delete variables',
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  test('--yes goes through the same steps', async () => {
    await run('-y', 'matrix');

    expect(events).toEqual([
      'check',
      'login',
      'confirm',
      'delete secrets',
      'delete variables',
    ]);
    expect(process.exitCode).toBeUndefined();
  });
});

describe('a run that is refused', () => {
  test('nobody can be asked: refused before the login, nothing is asked or deleted, exit 1', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(showSecretDeletePlan).not.toHaveBeenCalled();
    expect(configManagerDeleteSecrets).not.toHaveBeenCalled();
    expect(configManagerDeleteVariables).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a failed login asks and deletes nothing, exit 1', async () => {
    getTokens.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteSecrets).not.toHaveBeenCalled();
    expect(configManagerDeleteVariables).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no, or a plan that failed, deletes nothing, exit 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(configManagerDeleteSecrets).not.toHaveBeenCalled();
    expect(configManagerDeleteVariables).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('what the guard is told', () => {
  test('the check gets what is deleted, --yes and the dry run of the command line', async () => {
    await run('matrix');

    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: WHAT,
      yes: undefined,
      dryRun: undefined,
    });
  });

  test('the question gets what is deleted, --yes and the dry run of the command line', async () => {
    await run('-y', '-d', 'matrix');

    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: WHAT,
      yes: true,
      dryRun: true,
    });
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe(WHAT);
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBe(true);
  });

  test('without --yes the question is not told yes, so that a terminal is asked', async () => {
    await run('matrix');

    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.yes).toBeUndefined();
    expect(guard.dryRun).toBeUndefined();
  });
});

describe('the plan that is shown before the question', () => {
  const plan = async (...args) => {
    await run(...args);
    return confirmBulkDelete.mock.calls[0][0].showPlan;
  };

  test('shows the plan of the secrets (with the warning) and reads the variables, and deletes nothing', async () => {
    const showPlan = await plan('matrix');
    configManagerDeleteSecrets.mockClear();
    configManagerDeleteVariables.mockClear();
    showSecretDeletePlan.mockClear();

    const answer = await showPlan();

    expect(answer).toBe(true);
    expect(showSecretDeletePlan).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteVariables).toHaveBeenCalledTimes(1);
    // a dry run: the variables are listed, never deleted
    expect(configManagerDeleteVariables).toHaveBeenCalledWith(undefined, true);
    expect(configManagerDeleteSecrets).not.toHaveBeenCalled();
  });

  test('ends by saying that only ESV secrets and ESV variables are deleted', async () => {
    const showPlan = await plan('matrix');
    printMessage.mockClear();

    await showPlan();

    expect(printMessage).toHaveBeenCalledWith(
      'Only ESV secrets and ESV variables are deleted, nothing else.'
    );
  });

  test('shows the secrets, then the variables, then says that nothing else is deleted', async () => {
    const showPlan = await plan('matrix');
    events.length = 0;
    printMessage.mockImplementation((message) => events.push(message));

    await showPlan();

    expect(events).toEqual([
      'plan secrets',
      'plan variables',
      'Only ESV secrets and ESV variables are deleted, nothing else.',
    ]);
  });

  test('is false, and does not say that, if the secrets cannot be read', async () => {
    const showPlan = await plan('matrix');
    printMessage.mockClear();
    showSecretDeletePlan.mockResolvedValue(false);

    expect(await showPlan()).toBe(false);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('is false if the variables cannot be read', async () => {
    const showPlan = await plan('matrix');
    printMessage.mockClear();
    configManagerDeleteVariables.mockResolvedValue(false);

    expect(await showPlan()).toBe(false);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('is false if neither can be read', async () => {
    const showPlan = await plan('matrix');
    showSecretDeletePlan.mockResolvedValue(false);
    configManagerDeleteVariables.mockResolvedValue(false);

    expect(await showPlan()).toBe(false);
  });
});

describe('the delete', () => {
  test('hands the dry run and --allow-failures to both operations: neither given', async () => {
    await run('-y', 'matrix');

    expect(configManagerDeleteSecrets).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined
    );
    expect(configManagerDeleteVariables).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined
    );
  });

  test('hands --allow-failures to both operations', async () => {
    await run('-y', '--allow-failures', 'matrix');

    expect(configManagerDeleteSecrets).toHaveBeenCalledWith(
      undefined,
      undefined,
      true
    );
    expect(configManagerDeleteVariables).toHaveBeenCalledWith(
      undefined,
      undefined,
      true
    );
  });

  test('hands the dry run to both operations, which then delete nothing', async () => {
    await run('-d', 'matrix');

    expect(configManagerDeleteSecrets).toHaveBeenCalledWith(
      undefined,
      true,
      undefined
    );
    expect(configManagerDeleteVariables).toHaveBeenCalledWith(
      undefined,
      true,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('names no secret and no variable: it is all of them', async () => {
    await run('-y', 'matrix');

    expect(configManagerDeleteSecrets.mock.calls[0][0]).toBeUndefined();
    expect(configManagerDeleteVariables.mock.calls[0][0]).toBeUndefined();
  });
});

describe('the exit code', () => {
  test('stays as it was when both halves succeed', async () => {
    await run('-y', 'matrix');

    expect(process.exitCode).toBeUndefined();
  });

  test('is 1 when only the secrets failed, and the variables are still deleted (fail late)', async () => {
    configManagerDeleteSecrets.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(configManagerDeleteVariables).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  test('is 1 when only the variables failed', async () => {
    configManagerDeleteVariables.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(configManagerDeleteSecrets).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  test('is 1 when both failed', async () => {
    configManagerDeleteSecrets.mockResolvedValue(false);
    configManagerDeleteVariables.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(process.exitCode).toBe(1);
  });
});
