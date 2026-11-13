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
 * The command `config-manager delete secret-mappings` (records 0037, 0040 and
 * 0041): it adds the shared `--allow-failures` option (`.multiOp()`), runs for
 * Cloud only, refuses a delete of all secret mappings that nobody can be asked
 * about before it logs in, asks after the login (with the dry run of all
 * secret mappings as the plan) before all of them are deleted, never asks for
 * a single named mapping, refuses an empty or blank ID before anything else (an
 * empty ID must never mean all mappings), needs a realm for a named mapping,
 * refuses the root realm (it has no secret mappings to delete), and hands the
 * ID, the realm, the dry run and `--allow-failures` to the ops function. A
 * failed login runs nothing and the exit code is 1 when the login or the ops
 * function fails. The preview option is `--dry-run` and has no short form. What
 * the ops function does is covered by FrConfigSecretMappingsDelete.test.js.
 */

const getTokens = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const configManagerDeleteSecretMappings = jest.fn();
const printMessage = jest.fn();
let events;
let constructed;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        DEFAULT_REALM_KEY: '__default__realm__',
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
    usesRealm() {
      this.usesRealmCalled = true;
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/utils/interactive/PositionalArgs', () => ({
  realmOfRun: (command, realm) => realm,
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
  '../../src/configManagerOps/FrConfigSecretMappingsOps',
  () => ({
    configManagerDeleteSecretMappings,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-secret-mappings');

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
  configManagerDeleteSecretMappings.mockImplementation(async () => {
    events.push('delete');
    return true;
  });
});
afterEach(() => {
  process.exitCode = undefined;
});

const WHAT = 'all secret mappings in the selected realms';

describe('frodo config-manager delete secret-mappings', () => {
  test('is a multi-operation command that takes a realm, for Cloud only', async () => {
    const program = await run('-y', 'matrix');

    expect(program.multiOpCalled).toBe(true);
    expect(program.usesRealmCalled).toBe(true);
    expect(constructed[0]).toBe('frodo config-manager delete secret-mappings');
    expect(constructed[2]).toEqual(['cloud']);
  });

  test('logs in for Cloud', async () => {
    await run('-n', 'am.example.secret.id', 'matrix', 'alpha');

    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud']);
  });

  test('its help says what happens without -n, and its examples never open a prompt', async () => {
    const program = setup();
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    // the help wraps its lines
    const flat = help.replace(/\s+/g, ' ');
    expect(flat).toContain(
      'If omitted, all secret mappings of the selected realms are deleted'
    );
    expect(flat).toContain('Needs a single realm');
    expect(help).not.toMatch(/eligible/i);
    const examples = help
      .split('\n')
      .filter((line) =>
        line.includes('$ frodo config-manager delete secret-mappings')
      );
    expect(examples).toHaveLength(4);
    // every example that can delete more than one mapping carries -y or --dry-run
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
    expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
  });
});

describe('deleting all secret mappings', () => {
  test('is checked before the login, asked after it, and deleted last', async () => {
    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm', 'delete']);
    expect(checkBulkDelete).toHaveBeenCalledWith({
      what: WHAT,
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
    expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a question that is answered no deletes nothing and exits 1', async () => {
    confirmBulkDelete.mockImplementation(async () => {
      events.push('confirm');
      return false;
    });

    await run('matrix');

    expect(events).toEqual(['check', 'login', 'confirm']);
    expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('the question is told what is deleted, and its plan is the dry run of the selected realms', async () => {
    await run('-y', 'matrix', 'alpha');

    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    const guard = confirmBulkDelete.mock.calls[0][0];
    expect(guard.what).toBe(WHAT);
    expect(guard.yes).toBe(true);
    expect(guard.dryRun).toBeUndefined();
    // the plan is what the question shows before it is asked: it must delete nothing
    configManagerDeleteSecretMappings.mockClear();
    configManagerDeleteSecretMappings.mockResolvedValue(true);
    await expect(guard.showPlan()).resolves.toBe(true);
    expect(configManagerDeleteSecretMappings).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteSecretMappings).toHaveBeenCalledWith(
      undefined,
      'alpha',
      true
    );
  });

  test('a plan that cannot be shown is the answer of the ops function', async () => {
    await run('-y', 'matrix');
    const guard = confirmBulkDelete.mock.calls[0][0];

    configManagerDeleteSecretMappings.mockResolvedValue(false);

    await expect(guard.showPlan()).resolves.toBe(false);
  });

  test('--yes goes on to the delete of all secret mappings of all realms', async () => {
    await run('-y', 'matrix');

    expect(checkBulkDelete.mock.calls[0][0].yes).toBe(true);
    expect(configManagerDeleteSecretMappings).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('a realm that is named is handed to the ops function', async () => {
    await run('-y', 'matrix', 'bravo');

    expect(configManagerDeleteSecretMappings).toHaveBeenCalledWith(
      undefined,
      'bravo',
      undefined,
      undefined
    );
  });

  test('a dry run is handed to the ops function and is told to the guard', async () => {
    await run('--dry-run', 'matrix');

    expect(configManagerDeleteSecretMappings).toHaveBeenCalledWith(
      undefined,
      undefined,
      true,
      undefined
    );
    expect(checkBulkDelete.mock.calls[0][0].dryRun).toBe(true);
    expect(confirmBulkDelete.mock.calls[0][0].dryRun).toBe(true);
  });

  test('--allow-failures reaches the ops function', async () => {
    await run('-y', '--allow-failures', 'matrix');

    expect(configManagerDeleteSecretMappings).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      true
    );
  });

  test('a failed login exits 1 and asks and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails exits 1', async () => {
    configManagerDeleteSecretMappings.mockResolvedValue(false);

    await run('-y', 'matrix');

    expect(process.exitCode).toBe(1);
  });

  test('a delete that succeeds leaves the exit code alone', async () => {
    configManagerDeleteSecretMappings.mockResolvedValue(true);

    await run('-y', 'matrix');

    expect(process.exitCode).toBeUndefined();
  });
});

describe('deleting one secret mapping by ID', () => {
  test('is deleted without a check and without a question', async () => {
    await run('-n', 'am.example.secret.id', 'matrix', 'alpha');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(events).toEqual(['login', 'delete']);
    expect(configManagerDeleteSecretMappings).toHaveBeenCalledWith(
      'am.example.secret.id',
      'alpha',
      undefined,
      undefined
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('the dry run and --allow-failures reach the ops function', async () => {
    await run(
      '-n',
      'am.example.secret.id',
      '--dry-run',
      '--allow-failures',
      'matrix',
      'alpha'
    );

    expect(configManagerDeleteSecretMappings).toHaveBeenCalledWith(
      'am.example.secret.id',
      'alpha',
      true,
      true
    );
  });

  test.each([
    ['no realm', ['matrix']],
    ['the default realm of the framework', ['matrix', '__default__realm__']],
  ])(
    'needs a realm: %s is an error before the check and the login',
    async (_, args) => {
      await run('-n', 'am.example.secret.id', ...args);

      expect(printMessage).toHaveBeenCalledWith(
        'The -n/--name option requires a realm argument to be specified.',
        'error'
      );
      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test('a failed login exits 1 and deletes nothing', async () => {
    getTokens.mockResolvedValue(false);

    await run('-n', 'am.example.secret.id', 'matrix', 'alpha');

    expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a delete that fails, or a mapping that is not there, exits 1', async () => {
    configManagerDeleteSecretMappings.mockResolvedValue(false);

    await run('-n', 'am.example.secret.id', 'matrix', 'alpha');

    expect(process.exitCode).toBe(1);
  });
});

describe('the root realm has no secret mappings', () => {
  test.each([
    ['all mappings', ['-y']],
    ['a named mapping', ['-n', 'am.example.secret.id']],
    ['a dry run', ['--dry-run']],
  ])(
    'naming it for %s is an error before the check and the login',
    async (_, options) => {
      await run(...options, 'matrix', '/');

      expect(printMessage).toHaveBeenCalledWith(
        'The root realm has no secret mappings to delete. Name a realm such as alpha, or leave the realm out to use every realm except the root realm.',
        'error'
      );
      expect(checkBulkDelete).not.toHaveBeenCalled();
      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );
});

describe('an empty ID is not "all secret mappings"', () => {
  test.each([[''], ['  ']])(
    'the ID %j is an error before the check, the login and the delete',
    async (name) => {
      await run('-n', name, '-y', 'matrix', 'alpha');

      expect(printMessage).toHaveBeenCalledWith(
        'The secret mapping ID (-n) must not be empty. To delete all secret mappings, leave out -n.',
        'error'
      );
      expect(events).toEqual([]);
      expect(checkBulkDelete).not.toHaveBeenCalled();
      expect(getTokens).not.toHaveBeenCalled();
      expect(confirmBulkDelete).not.toHaveBeenCalled();
      expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test('also in a dry run, without a realm, and as --name=', async () => {
    await run('-n', '', '--dry-run', 'matrix', 'alpha');
    await run('-n', '', 'matrix');
    await run('--name=', 'matrix', 'alpha');

    expect(configManagerDeleteSecretMappings).not.toHaveBeenCalled();
    expect(getTokens).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('an ID that is given is never taken for a delete of all secret mappings', async () => {
    await run('-n', 'am.example.secret.id', 'matrix', 'alpha');

    expect(checkBulkDelete).not.toHaveBeenCalled();
    expect(confirmBulkDelete).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
  });
});
