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
 * The command `config-manager delete schedules` (records 0037, 0040 and 0041):
 * it adds the shared `--allow-failures` option (`.multiOp()`), runs for Cloud
 * and ForgeOps, refuses a delete of all schedules that nobody can be asked
 * about before it logs in, asks after the login (with the dry run of all
 * schedules as the plan) before all schedules are deleted, never asks for a
 * single named schedule, refuses an empty name before anything else (an empty
 * name must never mean all schedules), and hands the name, the dry run and
 * `--allow-failures` to the ops function. A failed login runs nothing and the
 * exit code is 1 when the login or the ops function fails. The preview option
 * is `--dry-run` and has no short form. What the ops function does is covered
 * by FrConfigSchedulesDelete.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerDeleteSchedules = jest.fn();
const printMessage = jest.fn();
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
  printMessage,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigSchedulesOps',
  () => ({
    configManagerDeleteSchedules,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-schedules');

const run = (...args) => {
  const program = setup();
  // an unknown option is an error that the real program reports and exits with
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
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
  configManagerDeleteSchedules.mockImplementation(async () => {
    events.push('delete');
    return true;
  });
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager delete schedules', () => {
  test('is a multi-operation command, for Cloud and ForgeOps', async () => {
    const program = await run('-y');

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager delete schedules');
    expect(constructed[2]).toEqual(['cloud', 'forgeops']);
  });

  test('logs in for Cloud and ForgeOps', async () => {
    await run('-n', 'taskscan_activate');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud', 'forgeops']);
  });

  test('its help says what happens without -n, and its examples never open a prompt', async () => {
    const program = setup();
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    // the help wraps its lines
    expect(help.replace(/\s+/g, ' ')).toContain(
      'If omitted, all schedules are deleted'
    );
    expect(help).not.toMatch(/eligible/i);
    const examples = help
      .split('\n')
      .filter((line) =>
        line.includes('$ frodo config-manager delete schedules')
      );
    expect(examples).toHaveLength(4);
    // every example that can delete more than one schedule carries -y or --dry-run
    for (const example of examples.filter((line) => !/ -n /.test(line))) {
      expect(example).toMatch(/ (-y|--dry-run) /);
    }
    // no example uses the short form of the preview option
    for (const example of examples) expect(example).not.toMatch(/ -d /);
  });
});

describe('the preview option is --dry-run and has no short form', () => {
  test('--dry-run is declared and -d is not', () => {
    const flags = setup().options.map((option) => ({
      long: option.long,
      short: option.short,
    }));

    expect(flags).toContainEqual({ long: '--dry-run', short: undefined });
    expect(flags.map((flag) => flag.short)).not.toContain('-d');
  });

  test('-d is an unknown option and nothing is checked, asked or deleted', async () => {
    await expect(run('-d', 'matrix')).rejects.toMatchObject({
      code: 'commander.unknownOption',
    });

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteSchedules).not.toHaveBeenCalled();
  });
});

describe('deleting all schedules', () => {
  test('is checked before the login, asked after it, and deleted last', async () => {
    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm', 'delete']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all schedules',
      yes: undefined,
      dryRun: undefined,
    });
    // without -y the question is not told "yes" (it would not be asked)
    expect(confirmBulkDelete.mock.calls[0][0].yes).toBeUndefined();
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBeUndefined();
    expect(process.exitCode).toBeUndefined();
  });

  test('is refused before the login when nobody can be asked, and deletes nothing', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteSchedules).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(configManagerDeleteSchedules).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('the question is told what is deleted, and its plan is the dry run of all schedules', async () => {
    await run('-y', 'matrix');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('all schedules');
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBeUndefined();
    // the plan is what the question shows before it is asked: it must delete nothing
    configManagerDeleteSchedules.mockClear();
    configManagerDeleteSchedules.mockResolvedValue(true);
    await expect(guard.showPlan()).resolves.toBe(true);
    expect(configManagerDeleteSchedules).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteSchedules).toHaveBeenCalledWith(undefined, true);
  });

  test('a plan that cannot be shown is the answer of the ops function', async () => {
    await run('-y', 'matrix');
    const guard = confirmBulkDelete.mock.calls[0][0];

    configManagerDeleteSchedules.mockResolvedValue(false);

    await expect(guard.showPlan()).resolves.toBe(false);
  });

  test('--yes goes on to the delete of all schedules', async () => {
    await run('-y', 'matrix');

    expect(checkBulkDelete.mock.calls[0][0].yes).toBe(true);
    expect(configManagerDeleteSchedules).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a dry run is handed to the ops function and is told to the guard', async () => {
    await run('--dry-run', 'matrix');

    expect(configManagerDeleteSchedules).toHaveBeenCalledWith(
      undefined,
      true,
      undefined
    );
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
  });

  test('--allow-failures reaches the ops function', async () => {
    await run('-y', '--allow-failures', 'matrix');

    expect(configManagerDeleteSchedules).toHaveBeenCalledWith(
      undefined,
      undefined,
      true
    );
  });

  test('a failed login exits 1 and asks and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteSchedules).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails exits 1', async () => {
    configManagerDeleteSchedules.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(process.exitCode).toBe(1);
  });

  test('a delete that succeeds leaves the exit code alone', async () => {
    configManagerDeleteSchedules.mockResolvedValue(true);

    await run('-y', 'matrix');

    expect(process.exitCode).toBeUndefined();
  });
});

describe('deleting one schedule by name', () => {
  test('is deleted without a check and without a question', async () => {
    await run('-n', 'taskscan_activate', 'matrix');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login', 'delete']);
    expect(configManagerDeleteSchedules).toHaveBeenCalledWith(
      'taskscan_activate',
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('the dry run and --allow-failures reach the ops function', async () => {
    await run(
      '-n',
      'taskscan_activate',
      '--dry-run',
      '--allow-failures',
      'matrix'
    );

    expect(configManagerDeleteSchedules).toHaveBeenCalledWith(
      'taskscan_activate',
      true,
      true
    );
  });

  test('a failed login exits 1 and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-n', 'taskscan_activate', 'matrix');

    expect(configManagerDeleteSchedules).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails, or a schedule that is not there, exits 1', async () => {
    configManagerDeleteSchedules.mockResolvedValue(false);

    await run('-n', 'taskscan_activate', 'matrix');

    expect(process.exitCode).toBe(1);
  });
});

describe('an empty name is not "all schedules"', () => {
  test.each([[''], ['  ']])(
    'the name %j is an error before the check, the login and the delete',
    async (name) => {
      await run('-n', name, '-y', 'matrix');

      expect(printMessage).toHaveBeenCalledWith(
        'The schedule name (-n) must not be empty. To delete all schedules, leave out -n.',
        'error'
      );
      expect(events).toEqual([]);
      expect(checkBulkDelete).not.toHaveBeenCalled();
      expect(getTokens).not.toHaveBeenCalled();
      expect(confirmBulkDelete).not.toHaveBeenCalled();
      expect(configManagerDeleteSchedules).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test('also in a dry run, and as --name=', async () => {
    await run('-n', '', '--dry-run', 'matrix');
    await run('--name=', 'matrix');

    expect(configManagerDeleteSchedules).not.toHaveBeenCalled();
    expect(getTokens).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a name that is given is never taken for a delete of all schedules', async () => {
    await run('-n', 'taskscan_activate', 'matrix');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
  });
});
