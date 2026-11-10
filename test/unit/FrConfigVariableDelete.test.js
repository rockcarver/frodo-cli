/**
 * Unit tests for `config-manager delete variables`, without a tenant: the ops
 * function configManagerDeleteVariables (src/configManagerOps/FrConfigVariableOps.ts)
 * and the command that wraps it
 * (src/cli/config-manager/config-manager-delete/config-manager-delete-variables.ts).
 *
 * The facade, the console, the login and the guard are mocked before the modules
 * are imported (the bundled ESM of frodo-lib cannot load under jest's ESM
 * runtime); OperationRun, ErrorCause and the ops function stay real, so the
 * command tests go all the way to the (mocked) delete request. The errors of
 * the mocked library have the text of the real ones (a FrodoError whose combined
 * message holds the nested message).
 *
 * What these tests guard (decision records 0037, 0040 and 0041): deleting all
 * variables is asked about, and refused where nobody can be asked, before the
 * login; every variable is deleted, one by one, and one that cannot be deleted
 * is named once and does not hide the others; the command ends with one summary
 * and exits 1, unless --allow-failures was given; a listing that fails ends the
 * run; a variable that is named but does not exist, and a name that is empty,
 * are errors and never mean "all"; a tenant without variables is not an error;
 * a dry run deletes nothing.
 */
import { jest } from '@jest/globals';
import { Command } from 'commander';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everything = () => printed.map((entry) => entry.msg).join('\n');

/** The requests that reached the (mocked) library, in order. */
const calls = [];
const deleted = () =>
  calls.filter((call) => call.startsWith('delete ')).map((c) => c.slice(7));
let variables = [];
let failingIds = new Set();
let readFails = false;

const variable = (id) => ({ _id: id, description: `the ${id}` });

/** An error like the library's: the outer message names the variable, the nested one is the cause. */
const libraryError = (outer, inner) =>
  Object.assign(new Error(outer), {
    name: 'FrodoError',
    originalErrors: [new Error(inner)],
    getCombinedMessage: () => `${outer}\n  ${inner}`,
  });

const printError = jest.fn((error, message) =>
  printed.push({
    msg: `${message ?? ''} ${error.getCombinedMessage?.() ?? error.message}`.trim(),
    type: 'error',
  })
);

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {},
  frodo: {
    utils: {
      constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' },
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
    },
    cloud: {
      variable: {
        readVariables: async () => {
          calls.push('read');
          if (readFails) {
            throw libraryError('Error reading variables', 'read refused');
          }
          return variables;
        },
        importVariables: async () => {},
        deleteVariable: async (id) => {
          calls.push(`delete ${id}`);
          if (failingIds.has(id)) {
            throw libraryError(
              `Error deleting variable ${id}`,
              `${id} is in use`
            );
          }
          return {};
        },
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError,
  verboseMessage: () => {},
  createProgressIndicator: () => 'indicator',
  updateProgressIndicator: () => {},
  stopProgressIndicator: () => {},
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  csvEscape: (value) => value,
  escapePlaceholders: (value) => value,
  esvToEnv: (value) => value,
  friendlyTimestamp: () => 'now',
}));
jest.unstable_mockModule('../../src/utils/ImportItems', () => ({
  countItems: () => 0,
  recordImportOfFile: () => {},
}));

// the command: the shell around the ops function
let events = [];
let constructed;
const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();

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

const { configManagerDeleteVariables } =
  await import('../../src/configManagerOps/FrConfigVariableOps.ts');
const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-variables.ts');

const IDS = ['esv-alpha-one', 'esv-bravo-two', 'esv-zion-three'];

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  events = [];
  failingIds = new Set();
  readFails = false;
  variables = IDS.map(variable);
  jest.clearAllMocks();
  process.exitCode = undefined;
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
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('configManagerDeleteVariables: all variables', () => {
  test('every variable is deleted, in the order the tenant lists them, and each is named', async () => {
    expect(await configManagerDeleteVariables()).toBe(true);

    expect(calls).toEqual([
      'read',
      'delete esv-alpha-one',
      'delete esv-bravo-two',
      'delete esv-zion-three',
    ]);
    expect(messages(undefined)).toEqual([
      'Deleted variable: esv-alpha-one',
      'Deleted variable: esv-bravo-two',
      'Deleted variable: esv-zion-three',
    ]);
    // a run that went well prints no summary and no error
    expect(messages('error')).toEqual([]);
    expect(messages('warn')).toEqual([]);
  });

  test('a variable that cannot be deleted does not hide the others, is named once, and the result is false', async () => {
    failingIds = new Set(['esv-bravo-two']);

    expect(await configManagerDeleteVariables()).toBe(false);

    expect(deleted()).toEqual(IDS);
    expect(messages(undefined)).toEqual([
      'Deleted variable: esv-alpha-one',
      'Deleted variable: esv-zion-three',
    ]);
    // the failure is printed once: the library's own message names the variable
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0]).toHaveLength(1);
    expect(
      everything().match(/Error deleting variable esv-bravo-two/g)
    ).toHaveLength(1);
    expect(everything()).not.toContain('Failed to delete variable');
    // and then one summary, with the cause
    expect(messages('error')).toEqual([
      'Error deleting variable esv-bravo-two\n  esv-bravo-two is in use',
      '1 of 3 variables failed:\n  - esv-bravo-two: esv-bravo-two is in use',
    ]);
  });

  test('every failure is counted and named in the one summary', async () => {
    failingIds = new Set(['esv-alpha-one', 'esv-zion-three']);

    expect(await configManagerDeleteVariables()).toBe(false);

    expect(deleted()).toEqual(IDS);
    const summary = messages('error').filter((text) =>
      /^\d+ of \d+/.test(text)
    );
    expect(summary).toEqual([
      '2 of 3 variables failed:\n  - esv-alpha-one: esv-alpha-one is in use\n  - esv-zion-three: esv-zion-three is in use',
    ]);
  });

  test('--allow-failures keeps the result true, and the summary is still printed as a warning', async () => {
    failingIds = new Set(['esv-bravo-two']);

    expect(await configManagerDeleteVariables(undefined, false, true)).toBe(
      true
    );

    expect(deleted()).toEqual(IDS);
    expect(messages('warn')).toEqual([
      '1 of 3 variables failed:\n  - esv-bravo-two: esv-bravo-two is in use\nThe exit code stays 0 because --allow-failures was given.',
    ]);
  });

  test('a listing that fails ends the run: nothing is deleted and the result is false', async () => {
    readFails = true;

    expect(await configManagerDeleteVariables()).toBe(false);

    expect(deleted()).toEqual([]);
    expect(messages('error')).toEqual([
      'Error reading variables\n  read refused',
    ]);
  });

  test('a listing that fails is a failure whatever --allow-failures says', async () => {
    readFails = true;

    expect(await configManagerDeleteVariables(undefined, false, true)).toBe(
      false
    );
    expect(deleted()).toEqual([]);
  });

  test('a tenant without variables is told so and it is not an error', async () => {
    variables = [];

    expect(await configManagerDeleteVariables()).toBe(true);

    expect(deleted()).toEqual([]);
    expect(messages('warn')).toEqual(['No variables found to delete.']);
    expect(messages('error')).toEqual([]);
  });
});

describe('configManagerDeleteVariables: a dry run', () => {
  test('lists what would be deleted and sends no delete request', async () => {
    expect(await configManagerDeleteVariables(undefined, true)).toBe(true);

    expect(calls).toEqual(['read']);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting variable: esv-alpha-one',
      'Dry run: Deleting variable: esv-bravo-two',
      'Dry run: Deleting variable: esv-zion-three',
    ]);
  });

  test('a tenant without variables is told so', async () => {
    variables = [];

    expect(await configManagerDeleteVariables(undefined, true)).toBe(true);

    expect(messages('warn')).toEqual(['No variables found to delete.']);
  });

  test('a listing that fails is an error', async () => {
    readFails = true;

    expect(await configManagerDeleteVariables(undefined, true)).toBe(false);
  });

  test('the dry run of one variable lists only that one', async () => {
    expect(await configManagerDeleteVariables('esv-bravo-two', true)).toBe(
      true
    );

    expect(deleted()).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting variable: esv-bravo-two',
    ]);
  });

  test('the dry run of a variable that does not exist is an error too, and deletes nothing', async () => {
    expect(await configManagerDeleteVariables('esv-matrix-missing', true)).toBe(
      false
    );

    expect(deleted()).toEqual([]);
    expect(messages('error')).toEqual([
      "Variable 'esv-matrix-missing' not found.",
    ]);
  });
});

describe('configManagerDeleteVariables: one variable by its id', () => {
  test('only that variable is deleted', async () => {
    expect(await configManagerDeleteVariables('esv-bravo-two')).toBe(true);

    expect(deleted()).toEqual(['esv-bravo-two']);
    expect(messages(undefined)).toEqual(['Deleted variable: esv-bravo-two']);
  });

  test('a variable that does not exist is an error and nothing is deleted', async () => {
    expect(await configManagerDeleteVariables('esv-matrix-missing')).toBe(
      false
    );

    expect(deleted()).toEqual([]);
    expect(messages('error')).toEqual([
      "Variable 'esv-matrix-missing' not found.",
    ]);
    expect(messages('warn')).toEqual([]);
  });

  test('a variable that does not exist is an error whatever --allow-failures says', async () => {
    expect(
      await configManagerDeleteVariables('esv-matrix-missing', false, true)
    ).toBe(false);
  });

  test('the id must match exactly, not as a prefix', async () => {
    expect(await configManagerDeleteVariables('esv-bravo')).toBe(false);

    expect(deleted()).toEqual([]);
  });

  test('a variable that cannot be deleted is an error', async () => {
    failingIds = new Set(['esv-bravo-two']);

    expect(await configManagerDeleteVariables('esv-bravo-two')).toBe(false);

    expect(deleted()).toEqual(['esv-bravo-two']);
    expect(messages('error').join('\n')).toContain('esv-bravo-two is in use');
  });

  test('an empty name is an error, not "all": nothing is deleted', async () => {
    expect(await configManagerDeleteVariables('')).toBe(false);

    expect(deleted()).toEqual([]);
    expect(messages('error')).toEqual(["Variable '' not found."]);
  });

  test('an empty name does not mean "all" in a dry run either', async () => {
    expect(await configManagerDeleteVariables('', true)).toBe(false);

    expect(messages(undefined)).toEqual([]);
  });
});

describe('frodo config-manager delete variables (the command)', () => {
  const run = async (...args) => {
    const program = setup();
    await program.parseAsync(args, { from: 'user' });
    return program;
  };

  test('is a multi-operation command, for Cloud only', async () => {
    const program = await run('-d');

    expect(program.multiOpCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager delete variables');
    expect(constructed[2]).toEqual(['cloud']);
  });

  test('deleting all is checked before the login, asked after it, and deleted last', async () => {
    await run();

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all variables',
      yes: undefined,
      dryRun: undefined,
    });
    expect(deleted()).toEqual(IDS);
    expect(process.exitCode).toBeUndefined();
  });

  test('the delete follows the question: nothing is deleted before it is answered', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push(`confirm after ${deleted().length} deletes`);
      return true;
    });

    await run();

    expect(events).toEqual(['check', 'login', 'confirm after 0 deletes']);
    expect(deleted()).toEqual(IDS);
  });

  test('deleting all where nobody can be asked is refused before the login and deletes nothing', async () => {
    checkBulkDelete.mockImplementation(() => {
      events.push('check');
      return false;
    });

    await run();

    expect(events).toEqual(['check']);
    expect(getTokens).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run();

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test('the question is told what is deleted and the options, and its plan is the dry run', async () => {
    await run('-y');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe('all variables');
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBeUndefined();

    calls.length = 0;
    printed.length = 0;
    await expect(guard.showPlan()).resolves.toBe(true);
    expect(calls).toEqual(['read']);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting variable: esv-alpha-one',
      'Dry run: Deleting variable: esv-bravo-two',
      'Dry run: Deleting variable: esv-zion-three',
    ]);
  });

  test('a plan that cannot be read is a plan that failed', async () => {
    await run('-y');
    const guard = confirmBulkDelete.mock.calls[0][0];
    readFails = true;

    await expect(guard.showPlan()).resolves.toBe(false);
  });

  test('--yes is handed to the check before the login, so that it is not refused', async () => {
    await run('-y');

    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: 'all variables',
      yes: true,
      dryRun: undefined,
    });
  });

  test('--yes goes on to the delete of every variable', async () => {
    await run('-y');

    expect(deleted()).toEqual(IDS);
    expect(process.exitCode).toBeUndefined();
  });

  test('a dry run lists the variables, deletes nothing, and tells the guard it is one', async () => {
    await run('-d');

    expect(calls).toEqual(['read']);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting variable: esv-alpha-one',
      'Dry run: Deleting variable: esv-bravo-two',
      'Dry run: Deleting variable: esv-zion-three',
    ]);
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  test('a variable named by its id is deleted without a check and without a question', async () => {
    await run('-n', 'esv-bravo-two');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login']);
    expect(deleted()).toEqual(['esv-bravo-two']);
    expect(process.exitCode).toBeUndefined();
  });

  test('a variable that does not exist exits 1 and deletes nothing', async () => {
    await run('-n', 'esv-matrix-missing');

    expect(deleted()).toEqual([]);
    expect(messages('error')).toEqual([
      "Variable 'esv-matrix-missing' not found.",
    ]);
    expect(process.exitCode).toBe(1);
  });

  test('an empty name is not "delete all": it is not asked about, deletes nothing and exits 1', async () => {
    await run('-n', '');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(deleted()).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test('a failed login exits 1 and sends no request, whether all or one variable is named', async () => {
    getTokens.mockResolvedValue(false);

    await run('-y');
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    await run('-n', 'esv-bravo-two');
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
    expect(confirmBulkDelete).not.toHaveBeenCalled();
  });

  test('logs in for Cloud only', async () => {
    await run('-n', 'esv-bravo-two');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud']);
  });

  test('a variable that cannot be deleted does not stop the others, and the command exits 1', async () => {
    failingIds = new Set(['esv-bravo-two']);

    await run('-y');

    expect(deleted()).toEqual(IDS);
    expect(messages('error').at(-1)).toMatch(/^1 of 3 variables failed:/);
    expect(process.exitCode).toBe(1);
  });

  test('--allow-failures keeps the exit code at 0 after a failed delete', async () => {
    failingIds = new Set(['esv-bravo-two']);

    await run('-y', '--allow-failures');

    expect(deleted()).toEqual(IDS);
    expect(messages('warn').at(-1)).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a listing that fails exits 1 and deletes nothing, also with --allow-failures', async () => {
    readFails = true;

    await run('-y', '--allow-failures');

    expect(deleted()).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  test('a tenant without variables exits 0 with a message', async () => {
    variables = [];

    await run('-y');

    expect(messages('warn')).toEqual(['No variables found to delete.']);
    expect(process.exitCode).toBeUndefined();
  });
});
