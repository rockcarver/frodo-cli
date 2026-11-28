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
 * The command `config-manager delete cors`: what the command line does before
 * the operation runs. The real bulk-delete guard decides (a command that can
 * delete more than the one object it names asks first:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md),
 * with a terminal that the test switches on and off and an answer that the
 * test gives; the operation is a spy. What the operation does is in
 * FrConfigCorsDelete.test.js, the selectors in
 * ConfigManagerDeleteSelectorWiring.test.js, and the real command against a fake
 * tenant in ConfigManagerDeleteCorsFakeTenant.test.js.
 *
 * - A delete of all CORS configurations is refused before the login without a
 *   terminal and without `-y`, and asks on a terminal after showing a plan that
 *   is a dry run of the same command; a dry run and `-y` go on without a question.
 * - A named delete never asks and needs no `-y`.
 * - An empty or blank id never means "all CORS configurations".
 * - `--deep` cannot be combined with `-i` (or its aliases): the command line is
 *   refused while it is parsed, before the guard and the login.
 * - The command works on every deployment type and takes no realm.
 */

const getTokens = jest.fn();
const configManagerDeleteCors = jest.fn();
const printMessage = jest.fn();
const confirm = jest.fn();
let terminal;
let deployment;
const declared = { usesRealm: 0, multiOp: 0, deploymentTypes: undefined };

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    getHost: () => 'https://openam-matrix.example.com/am',
    getRealm: () => 'alpha',
    getDeploymentType: () => deployment,
  },
  frodo: {
    utils: {
      constants: {
        DEFAULT_REALM_KEY: '__default__realm__',
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
      },
    },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(args[0]);
      declared.deploymentTypes = args[2];
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    usesRealm() {
      declared.usesRealm += 1;
      return this;
    }
    multiOp() {
      declared.multiOp += 1;
      return this.option('--allow-failures');
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => terminal,
}));
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));
jest.unstable_mockModule('../../src/configManagerOps/FrConfigCorsOps', () => ({
  configManagerDeleteCors,
}));

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-cors');

/** Runs the command with arguments and a host; the answer is what the question gets. */
async function run(args, { answer = true } = {}) {
  confirm.mockReset().mockResolvedValue(answer);
  const program = setup();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  await program.parseAsync([...args, 'matrix'], { from: 'user' });
  return program;
}

const messages = () => printMessage.mock.calls.map(([text]) => String(text));
const refused = () => messages().find((text) => text.startsWith('Refusing'));

const WHAT_DEEP =
  'all CORS configurations and reset the IDM CORS filter to its default values';

beforeEach(() => {
  jest.clearAllMocks();
  terminal = false;
  deployment = 'cloud';
  process.exitCode = 0;
  getTokens.mockResolvedValue(true);
  configManagerDeleteCors.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = 0;
});

describe('the options', () => {
  test('-i, --cors-id is the selector, -n and --name are its aliases, --deep has no short form, and the rest are the delete options', async () => {
    const program = await run(['-i', 'x', '-y']);

    expect(program.options.map((option) => option.long).sort()).toEqual([
      '--allow-failures',
      '--cors-id',
      '--deep',
      '--dry-run',
      '--yes',
    ]);
    const selector = program.options.find(
      (option) => option.long === '--cors-id'
    );
    expect(selector.short).toBe('-i');
    expect(
      program.options.find((option) => option.long === '--deep').short
    ).toBe(undefined);
  });

  test('--deep and the selector each declare that they cannot be used with the other, as the instructions of a command with options that exclude each other say', async () => {
    const program = await run(['-d']);
    const deep = program.options.find((option) => option.long === '--deep');
    const selector = program.options.find(
      (option) => option.long === '--cors-id'
    );

    expect(deep.conflictsWith).toEqual(['corsId']);
    expect(selector.conflictsWith).toEqual(['deep']);
  });

  test.each([['-i'], ['--cors-id'], ['-n'], ['--name']])(
    '%s hands the id to the operation, as a named delete without --deep',
    async (flag) => {
      await run([flag, 'cors']);

      expect(configManagerDeleteCors).toHaveBeenCalledWith(
        'cors',
        undefined,
        undefined,
        { deep: undefined }
      );
    }
  );

  test('declares the shared --allow-failures, takes no realm and no deployment type: it works on all of them', async () => {
    declared.usesRealm = 0;
    declared.multiOp = 0;
    await run(['-d']);

    expect(declared.usesRealm).toBe(0);
    expect(declared.multiOp).toBe(1);
    expect(declared.deploymentTypes).toBeUndefined();
  });

  test('has the description, the words of the reset and the usage examples that run without a prompt', async () => {
    const program = await run(['-d']);
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    expect(program.description()).toBe('Delete CORS configurations.');
    const examples = help
      .split('\n')
      .filter((line) => line.trimStart().startsWith('$ frodo '));
    expect(examples).toHaveLength(6);
    // an example without -i deletes everything and carries -d or -y
    for (const example of examples) {
      if (!example.includes(' -i ')) expect(example).toMatch(/ -[dy] /);
      expect(example).not.toContain(' -n ');
    }
    expect(examples.some((line) => / -y matrix$/.test(line))).toBe(true);
    expect(examples.some((line) => / -d matrix$/.test(line))).toBe(true);
    expect(examples.some((line) => / -i cors matrix$/.test(line))).toBe(true);
    expect(examples.some((line) => / -i cors -d matrix$/.test(line))).toBe(
      true
    );
    expect(examples.some((line) => / --deep -y matrix$/.test(line))).toBe(true);
    expect(examples.some((line) => / --deep -d matrix$/.test(line))).toBe(true);
    // --deep resets and deletes nothing: the help says so, unlike `connector delete --deep`
    expect(help).toContain(
      'Also reset the IDM CORS filter to its default values'
    );
    expect(help).toContain('Nothing is deleted by this option.');
    expect(help).toContain('Cannot be used with -i.');
    expect(help).toContain('(nothing is deleted by --deep)');
    // what the command leaves alone, in one sentence that promises nothing
    expect(help).toContain(
      'The CORS service entry itself (the switch that turns the CORS filter of AM on and off) is not changed by this command.'
    );
    expect(help).toContain('the one that a new tenant starts with included');
    expect(help).toContain(
      'keeps every other key, the filter class among them'
    );
    expect(help).toContain('(alias: -n, --name)');
    expect(help).toContain(
      'A configuration that is not in the list exits with code 1, also with --dry-run and --allow-failures.'
    );
    // the rule for a listed id, with the characters that a terminal does not show
    expect(help).toContain(
      '(no slash, backslash, question mark, hash, percent sign, double dot, control character, text direction control or invisible separator)'
    );
    // no word that belongs to the library, and no promise of a later change
    expect(help).not.toMatch(
      /library|deleteServiceNextDescendent|exportService|frodo-lib|updateConfigEntity|\byet\b/
    );
  });
});

describe('a delete of all CORS configurations', () => {
  test('is refused before the login without a terminal and without -y, naming -y and --dry-run', async () => {
    await run([]);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteCors).not.toHaveBeenCalled();
    expect(refused()).toBe(
      'Refusing to delete all CORS configurations without confirmation: there is no interactive terminal to ask. Pass -y/--yes to delete without asking, or --dry-run to only show what would be deleted.'
    );
    expect(process.exitCode).toBe(1);
  });

  test.each([[['-y']], [['-d']]])(
    '%j goes on without a question',
    async (args) => {
      await run(args);

      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(configManagerDeleteCors).toHaveBeenCalledTimes(1);
      expect(configManagerDeleteCors.mock.calls[0][0]).toBeUndefined();
      expect(process.exitCode).toBe(0);
    }
  );

  test('on a terminal shows the plan (a dry run of the same command), asks with the default no, and deletes after a yes', async () => {
    terminal = true;

    await run([]);

    expect(configManagerDeleteCors.mock.calls).toEqual([
      [undefined, true, false, { deep: undefined, plan: true }],
      [undefined, undefined, undefined, { deep: undefined }],
    ]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(confirm.mock.calls[0][0].message).toBe(
      'Delete all CORS configurations? This cannot be undone. Continue?'
    );
    expect(messages()).toContain(
      'This permanently deletes all CORS configurations from https://openam-matrix.example.com/am.'
    );
    expect(process.exitCode).toBe(0);
  });

  test('on a terminal deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run([], { answer: false });

    expect(configManagerDeleteCors).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteCors.mock.calls[0][1]).toBe(true);
    expect(messages()).toContain('Delete aborted.');
    expect(process.exitCode).toBe(1);
  });

  test('on a terminal, a plan that failed is not followed by a question or a delete', async () => {
    terminal = true;
    configManagerDeleteCors.mockResolvedValue(false);

    await run([]);

    expect(configManagerDeleteCors).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a dry run hands the dry run to the operation, once, and never asks', async () => {
    terminal = true;

    await run(['-d']);

    expect(configManagerDeleteCors).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteCors.mock.calls[0][1]).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('exits 1 when the operation reports a failure, and hands --allow-failures on', async () => {
    configManagerDeleteCors.mockResolvedValue(false);

    await run(['-y', '--allow-failures']);

    expect(configManagerDeleteCors).toHaveBeenCalledWith(
      undefined,
      undefined,
      true,
      { deep: undefined }
    );
    expect(process.exitCode).toBe(1);
  });

  test('exits 0 when the operation succeeds', async () => {
    await run(['-y']);

    expect(process.exitCode).toBe(0);
  });
});

describe('--deep', () => {
  test('without a terminal and without -y is refused before the login, and the refusal says what is reset', async () => {
    await run(['--deep']);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteCors).not.toHaveBeenCalled();
    expect(refused()).toBe(
      `Refusing to delete ${WHAT_DEEP} without confirmation: there is no interactive terminal to ask. Pass -y/--yes to delete without asking, or --dry-run to only show what would be deleted.`
    );
    expect(process.exitCode).toBe(1);
  });

  test.each([[['--deep', '-y']], [['--deep', '-d']]])(
    '%j goes on without a question and hands --deep to the operation',
    async (args) => {
      await run(args);

      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(configManagerDeleteCors).toHaveBeenCalledTimes(1);
      expect(configManagerDeleteCors.mock.calls[0][0]).toBeUndefined();
      expect(configManagerDeleteCors.mock.calls[0][3]).toEqual({ deep: true });
      expect(process.exitCode).toBe(0);
    }
  );

  test('on a terminal the plan carries --deep, and the question says that the filter is reset', async () => {
    terminal = true;

    await run(['--deep']);

    expect(configManagerDeleteCors.mock.calls).toEqual([
      [undefined, true, false, { deep: true, plan: true }],
      [undefined, undefined, undefined, { deep: true }],
    ]);
    expect(confirm.mock.calls[0][0].message).toBe(
      `Delete ${WHAT_DEEP}? This cannot be undone. Continue?`
    );
    expect(messages()).toContain(
      'This permanently deletes all CORS configurations from https://openam-matrix.example.com/am and resets the IDM CORS filter to its default values.'
    );
    expect(process.exitCode).toBe(0);
  });

  test.each([['cloud'], ['forgeops']])(
    'on a terminal the question of a %s deployment says that the filter is reset',
    async (type) => {
      terminal = true;
      deployment = type;

      await run(['--deep']);

      expect(confirm.mock.calls[0][0].message).toContain(
        'reset the IDM CORS filter'
      );
      expect(messages().join('\n')).toContain(
        'and resets the IDM CORS filter to its default values.'
      );
    }
  );

  test('on a terminal the question of a classic deployment leaves the reset out: it has no IDM CORS filter, and the run skips that part', async () => {
    terminal = true;
    deployment = 'classic';

    await run(['--deep']);

    expect(confirm.mock.calls[0][0].message).toBe(
      'Delete all CORS configurations? This cannot be undone. Continue?'
    );
    expect(messages()).toContain(
      'This permanently deletes all CORS configurations from https://openam-matrix.example.com/am.'
    );
    expect(messages().join('\n')).not.toMatch(/reset/);
    // the plan and the delete are still asked for --deep: the operation says what it skips there
    expect(configManagerDeleteCors.mock.calls).toEqual([
      [undefined, true, false, { deep: true, plan: true }],
      [undefined, undefined, undefined, { deep: true }],
    ]);
  });

  test('on a terminal deletes and resets nothing after a no', async () => {
    terminal = true;

    await run(['--deep'], { answer: false });

    expect(configManagerDeleteCors).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteCors.mock.calls[0][1]).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test.each([
    [['-i', 'cors', '--deep']],
    [['--deep', '-i', 'cors']],
    [['-n', 'cors', '--deep']],
    [['--name', 'cors', '--deep']],
    [['--cors-id', 'cors', '--deep', '-y']],
    [['-i', 'cors', '--deep', '-d']],
  ])(
    '%j is refused while the command line is parsed, before the guard, the login and the operation',
    async (args) => {
      await expect(run(args)).rejects.toMatchObject({
        code: 'commander.conflictingOption',
        exitCode: 1,
        message:
          "error: option '--deep' cannot be used with option '-i, --cors-id <id>'",
      });

      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteCors).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(printMessage).not.toHaveBeenCalled();
    }
  );
});

describe('a login that fails', () => {
  test.each([
    [['-y']],
    [['-i', 'cors']],
    [['-i', 'cors', '-d']],
    [['--deep', '-y']],
  ])('%j ends with exit code 1, and nothing is asked or run', async (args) => {
    getTokens.mockResolvedValue(false);

    await run(args);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteCors).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('a named delete', () => {
  test('never asks and needs no -y, with or without a terminal', async () => {
    for (terminal of [true, false]) {
      await run(['-i', 'cors']);

      expect(confirm).not.toHaveBeenCalled();
      expect(refused()).toBeUndefined();
    }
    expect(configManagerDeleteCors).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(0);
  });

  test('exits 1 when the operation says the delete failed or the configuration is not there', async () => {
    configManagerDeleteCors.mockResolvedValue(false);

    await run(['-i', 'cors']);

    expect(process.exitCode).toBe(1);
  });

  test('-d hands the dry run to the operation, once, and never asks', async () => {
    terminal = true;

    await run(['-i', 'cors', '-d']);

    expect(configManagerDeleteCors).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteCors.mock.calls[0][1]).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('an id that is blank is never "all"', () => {
  test.each([[' '], ['   '], ['\t']])(
    '-i %j is refused before the login, even with -y, and nothing is run',
    async (blank) => {
      await run(['-i', blank, '-y']);

      expect(messages()).toContain(
        'The CORS configuration id (-i) must not be empty. To delete all CORS configurations, leave out -i.'
      );
      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteCors).not.toHaveBeenCalled();
      expect(refused()).toBeUndefined();
      expect(process.exitCode).toBe(1);
    }
  );

  test.each([
    [['-i', '']],
    [['--cors-id', '']],
    [['--cors-id=']],
    [['-n', '']],
    [['--name', '']],
    [['--name=']],
  ])(
    '%j is refused while the command line is parsed, before the guard, the login and the operation, even with -y',
    async (args) => {
      await expect(run([...args, '-y'])).rejects.toMatchObject({
        code: 'commander.invalidArgument',
        exitCode: 1,
      });

      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteCors).not.toHaveBeenCalled();
      expect(printMessage).not.toHaveBeenCalled();
    }
  );
});
