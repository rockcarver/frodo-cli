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
 * The command `config-manager delete locales` (records 0037, 0040 and 0041):
 * it adds the shared `--allow-failures` option (`.multiOp()`), runs for Cloud
 * and ForgeOps, refuses a delete of all locales that nobody can be asked about
 * before it logs in, asks after the login (with the dry run of all locales as
 * the plan) before all locales are deleted, never asks for a single named
 * locale, refuses an empty name before anything else (an empty name must never
 * mean all locales), and hands the name, the dry run and `--allow-failures` to
 * the ops function. A failed login runs nothing and the exit code is 1 when the
 * login or the ops function fails. What the ops function does is covered by
 * FrConfigLocalesDelete.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerDeleteLocales = jest.fn();
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
jest.unstable_mockModule('../../src/configManagerOps/FrConfigLocalesOps', () => ({
  configManagerDeleteLocales,
}));

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-locales');

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
  configManagerDeleteLocales.mockImplementation(async () => {
    events.push('delete');
    return true;
  });
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('frodo config-manager delete locales', () => {
  test('is a multi-operation command, for Cloud and ForgeOps', async () => {
    const program = await run('-y');

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager delete locales');
    expect(constructed[2]).toEqual(['cloud', 'forgeops']);
  });

  test('logs in for Cloud and ForgeOps', async () => {
    await run('-n', 'en');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud', 'forgeops']);
  });

  test('its help says what happens without -n, and its examples never open a prompt', async () => {
    const program = setup();
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    expect(help).toContain('If omitted, all locales are deleted');
    expect(help).not.toMatch(/eligible/i);
    const examples = help
      .split('\n')
      .filter((line) => line.includes('$ frodo config-manager delete locales'));
    expect(examples).toHaveLength(4);
    // every example that can delete more than one locale carries -y or -d
    for (const example of examples.filter((line) => !/ -n /.test(line))) {
      expect(example).toMatch(/ -[yd] /);
    }
  });
});

describe('deleting all locales', () => {
  test('is checked before the login, asked after it, and deleted last', async () => {
    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm', 'delete']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all locales',
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
    expect(configManagerDeleteLocales).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(configManagerDeleteLocales).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('the question is told what is deleted, and its plan is the dry run of all locales', async () => {
    await run('-y', 'matrix');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('all locales');
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBeUndefined();
    // the plan is what the question shows before it is asked: it must delete nothing
    configManagerDeleteLocales.mockClear();
    configManagerDeleteLocales.mockResolvedValue(true);
    await expect(guard.showPlan()).resolves.toBe(true);
    expect(configManagerDeleteLocales).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteLocales).toHaveBeenCalledWith(undefined, true);
  });

  test('a plan that cannot be shown is the answer of the ops function', async () => {
    await run('-y', 'matrix');
    const guard = confirmBulkDelete.mock.calls[0][0];

    configManagerDeleteLocales.mockResolvedValue(false);

    await expect(guard.showPlan()).resolves.toBe(false);
  });

  test('--yes goes on to the delete of all locales', async () => {
    await run('-y', 'matrix');

    expect(checkBulkDelete.mock.calls[0][0].yes).toBe(true);
    expect(configManagerDeleteLocales).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a dry run is handed to the ops function and is told to the guard', async () => {
    await run('-d', 'matrix');

    expect(configManagerDeleteLocales).toHaveBeenCalledWith(
      undefined,
      true,
      undefined
    );
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
  });

  test('--allow-failures reaches the ops function', async () => {
    await run('-y', '--allow-failures', 'matrix');

    expect(configManagerDeleteLocales).toHaveBeenCalledWith(
      undefined,
      undefined,
      true
    );
  });

  test('a failed login exits 1 and asks and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteLocales).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails exits 1', async () => {
    configManagerDeleteLocales.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(process.exitCode).toBe(1);
  });
});

describe('deleting one locale by name', () => {
  test('is deleted without a check and without a question', async () => {
    await run('-n', 'en', 'matrix');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login', 'delete']);
    expect(configManagerDeleteLocales).toHaveBeenCalledWith(
      'en',
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('the dry run and --allow-failures reach the ops function', async () => {
    await run('-n', 'en', '-d', '--allow-failures', 'matrix');

    expect(configManagerDeleteLocales).toHaveBeenCalledWith('en', true, true);
  });

  test('a failed login exits 1 and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-n', 'en', 'matrix');

    expect(configManagerDeleteLocales).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails, or a locale that is not there, exits 1', async () => {
    configManagerDeleteLocales.mockResolvedValue(false);

    await run('-n', 'en', 'matrix');

    expect(process.exitCode).toBe(1);
  });
});

describe('an empty name is not "all locales"', () => {
  test.each([[''], ['  ']])(
    'the name %j is an error before the check, the login and the delete',
    async (name) => {
      await run('-n', name, '-y', 'matrix');

      expect(printMessage).toHaveBeenCalledWith(
        'The locale name (-n) must not be empty. To delete all locales, leave out -n.',
        'error'
      );
      expect(events).toEqual([]);
      expect(checkBulkDelete).not.toHaveBeenCalled();
      expect(getTokens).not.toHaveBeenCalled();
      expect(confirmBulkDelete).not.toHaveBeenCalled();
      expect(configManagerDeleteLocales).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test('also in a dry run, and as --name=', async () => {
    await run('-n', '', '-d', 'matrix');
    await run('--name=', 'matrix');

    expect(configManagerDeleteLocales).not.toHaveBeenCalled();
    expect(getTokens).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a name that is given is never taken for a delete of all locales', async () => {
    await run('-n', 'en', 'matrix');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
  });
});
