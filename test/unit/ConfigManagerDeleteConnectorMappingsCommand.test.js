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
 * The command `config-manager delete connector-mappings`: what the command
 * line does before the operation runs. The real bulk-delete guard decides (a
 * command that can delete more than the one object it names asks first:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md),
 * with a terminal that the test switches on and off and an answer that the test
 * gives; the operation is a spy. What the operation does is in
 * FrConfigConnectorMappingsDelete.test.js, the selectors in
 * ConfigManagerDeleteSelectorWiring.test.js, and the real command against a fake
 * tenant in ConfigManagerDeleteConnectorMappingsFakeTenant.test.js.
 *
 * - A delete of all connector mappings is refused before the login without a
 *   terminal and without `-y`, and asks on a terminal after showing a plan that
 *   is a dry run.
 * - A named delete never asks, unless it has `--force`: then it goes ahead
 *   although other objects name the connector mapping, so it is refused
 *   before the login without a terminal and without `-y`, and asks on a terminal
 *   after a plan, which is a dry run of the same command.
 * - `--force` needs a named connector mapping, an id of blanks is refused,
 *   and both are refused before the login.
 * - The command works on Cloud and ForgeOps, and the usage examples run without
 *   a prompt.
 */

const getTokens = jest.fn();
const configManagerDeleteMappings = jest.fn();
const printMessage = jest.fn();
const confirm = jest.fn();
let terminal;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    getHost: () => 'https://openam-matrix.example.com/am',
    getRealm: () => undefined,
  },
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
      this.deploymentTypes = args[2];
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    multiOp() {
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
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigConnectorMappingOps',
  () => ({
    configManagerDeleteMappings,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-connector-mappings');

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

beforeEach(() => {
  jest.clearAllMocks();
  terminal = false;
  process.exitCode = 0;
  getTokens.mockResolvedValue(true);
  configManagerDeleteMappings.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = 0;
});

describe('the options', () => {
  test('-i, --connector-mapping-id is the selector, -n and --name are its aliases, and the rest of the options are the delete options', async () => {
    const program = await run(['-i', 'x', '-y']);

    expect(program.options.map((option) => option.long).sort()).toEqual([
      '--allow-failures',
      '--connector-mapping-id',
      '--dry-run',
      '--force',
      '--yes',
    ]);
    const selector = program.options.find(
      (option) => option.long === '--connector-mapping-id'
    );
    expect(selector.short).toBe('-i');
    expect(selector.description).toContain('(alias: -n, --name)');
  });

  test.each([['-i'], ['--connector-mapping-id'], ['-n'], ['--name']])(
    '%s hands the id to the operation',
    async (flag) => {
      await run([flag, 'mapA']);

      expect(configManagerDeleteMappings).toHaveBeenCalledWith(
        'mapA',
        undefined,
        undefined,
        { force: undefined }
      );
    }
  );

  test('--force is long only: there is no short form', async () => {
    const program = await run(['-i', 'x']);

    const force = program.options.find((option) => option.long === '--force');
    expect(force.short).toBeUndefined();
  });

  test('works on Cloud and ForgeOps, and on nothing else', async () => {
    const program = await run(['-i', 'x']);

    expect(program.deploymentTypes).toEqual(['cloud', 'forgeops']);
    expect(getTokens).toHaveBeenCalledWith(false, true, ['cloud', 'forgeops']);
  });

  test('has usage examples, each of which runs without a prompt, and the description names --force', async () => {
    const program = await run(['-i', 'x']);
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    const examples = help
      .split('\n')
      .filter((line) => line.trimStart().startsWith('$ frodo '));
    expect(examples.length).toBeGreaterThanOrEqual(5);
    // an example without -i deletes everything and carries -d or -y; one that
    // goes ahead although other objects name the connector mapping carries -y
    for (const example of examples) {
      if (!example.includes(' -i ')) expect(example).toMatch(/ -[dy] /);
      if (example.includes('--force')) expect(example).toContain(' -y ');
      expect(example).not.toContain(' -n ');
    }
    expect(program.description()).toContain('--force');
    expect(help).toContain('is not proof that it is unused');
    // what --allow-failures does not turn into exit code 0 is said in the help of the command itself
    expect(help).toContain(
      '--allow-failures keeps the exit code at 0 for a delete that failed, but never for a refusal, for a connector mapping that does not exist or for a list of connector mappings that cannot be read.'
    );
    // the plan lists at most 20 holders for each connector mapping, and the help says so
    expect(help).toContain('(at most 20 for each connector mapping)');
    expect(
      program.options.find((option) => option.long === '--dry-run').description
    ).toContain('at most 20 for each connector mapping');
    // -y is needed for the two guarded deletes, and a plain named delete never asks
    expect(
      program.options.find((option) => option.long === '--yes').description
    ).toContain('deleting one without --force never asks');
    // the help says what --force changes: the connector mapping, and nothing else
    expect(
      program.options.find((option) => option.long === '--force').description
    ).toContain('It deletes the connector mapping and nothing else');
  });

  test('the text of the command says connector mapping, and never remote server or group', async () => {
    const program = await run(['-i', 'x']);
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    expect(help).not.toMatch(/remote server|group/i);
  });
});

describe('a delete of all connector mappings', () => {
  test('is refused before the login without a terminal and without -y, naming -y and --dry-run and what goes', async () => {
    await run([]);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteMappings).not.toHaveBeenCalled();
    expect(refused()).toContain('all connector mappings');
    expect(refused()).toContain('-y/--yes');
    expect(refused()).toContain('--dry-run');
    expect(process.exitCode).toBe(1);
  });

  test.each([[['-y']], [['-d']]])(
    '%j goes on without a question',
    async (args) => {
      await run(args);

      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
      expect(configManagerDeleteMappings.mock.calls[0][0]).toBeUndefined();
      expect(process.exitCode).toBe(0);
    }
  );

  test('on a terminal shows the plan (a dry run that says plan), asks with the default no, and deletes after a yes', async () => {
    terminal = true;

    await run([]);

    const calls = configManagerDeleteMappings.mock.calls;
    // the plan: a dry run, with the flag that makes its text say plan; then the delete
    expect(calls.map((call) => call[1])).toEqual([true, undefined]);
    expect(calls[0][3]).toEqual({ force: undefined, plan: true });
    expect(calls[1][3]).toEqual({ force: undefined });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(messages().join('\n')).toContain(
      'This permanently deletes all connector mappings'
    );
    // the plan comes before the question, and the question before the delete
    expect(
      configManagerDeleteMappings.mock.invocationCallOrder[0]
    ).toBeLessThan(confirm.mock.invocationCallOrder[0]);
    expect(confirm.mock.invocationCallOrder[0]).toBeLessThan(
      configManagerDeleteMappings.mock.invocationCallOrder[1]
    );
    expect(process.exitCode).toBe(0);
  });

  test('on a terminal deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run([], { answer: false });

    // only the plan was shown
    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteMappings.mock.calls[0][1]).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test('on a terminal does not ask when the plan failed (the connector mappings cannot be read)', async () => {
    terminal = true;
    configManagerDeleteMappings.mockResolvedValue(false);

    await run([]);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 when the operation reports a failure, and hands --allow-failures on', async () => {
    configManagerDeleteMappings.mockResolvedValue(false);

    await run(['-y', '--allow-failures']);

    expect(configManagerDeleteMappings).toHaveBeenCalledWith(
      undefined,
      undefined,
      true,
      { force: undefined }
    );
    expect(process.exitCode).toBe(1);
  });

  test('hands the dry run to the operation', async () => {
    await run(['-d']);

    expect(configManagerDeleteMappings).toHaveBeenCalledWith(
      undefined,
      true,
      undefined,
      { force: undefined }
    );
  });
});

describe('a login that fails', () => {
  test.each([
    [['-y']],
    [['-i', 'mapA']],
    [['-i', 'mapA', '--force', '-y']],
    [['-i', 'mapA', '-d']],
  ])('%j ends with exit code 1, and nothing is asked or run', async (args) => {
    getTokens.mockResolvedValue(false);

    await run(args);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteMappings).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('a named delete', () => {
  test('never asks and needs no -y: the operation refuses what is named by something', async () => {
    terminal = true;

    await run(['-i', 'mapA']);

    expect(confirm).not.toHaveBeenCalled();
    expect(refused()).toBeUndefined();
    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  test('without a terminal and without -y goes on to the login', async () => {
    await run(['-i', 'mapA']);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(refused()).toBeUndefined();
    expect(process.exitCode).toBe(0);
  });

  test('exits 1 when the operation says the delete failed or was refused', async () => {
    configManagerDeleteMappings.mockResolvedValue(false);

    await run(['-i', 'mapA']);

    expect(process.exitCode).toBe(1);
  });

  test('-d hands the dry run to the operation, once, and never asks', async () => {
    terminal = true;

    await run(['-i', 'mapA', '-d']);

    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteMappings.mock.calls[0][1]).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  test.each([[' '], ['   '], ['\t']])(
    'an id of blanks (%j) is refused before the login, and never means all',
    async (blank) => {
      await run(['-i', blank, '-y']);

      expect(messages().join('\n')).toContain(
        'The connector mapping name (-i) must not be empty. To delete all connector mappings, leave out -i.'
      );
      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteMappings).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test.each([
    [['-i', '']],
    [['--connector-mapping-id', '']],
    [['--connector-mapping-id=']],
    [['-n', '']],
    [['--name', '']],
    [['--name=']],
  ])(
    'an empty id (%j) is refused while the command line is parsed, even with -y: before the guard, the login and the operation',
    async (args) => {
      await expect(run([...args, '-y'])).rejects.toMatchObject({
        code: 'commander.invalidArgument',
        exitCode: 1,
      });

      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteMappings).not.toHaveBeenCalled();
      expect(printMessage).not.toHaveBeenCalled();
    }
  );
});

describe('a named delete with --force', () => {
  const force = { force: true };

  test('is refused before the login without a terminal and without -y, naming -y and --dry-run', async () => {
    await run(['-i', 'mapA', '--force']);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteMappings).not.toHaveBeenCalled();
    expect(refused()).toContain(
      "delete connector mapping 'mapA' although other objects may name it"
    );
    expect(refused()).toContain('-y/--yes');
    expect(refused()).toContain('--dry-run');
    expect(process.exitCode).toBe(1);
  });

  test('with -y goes on without a question, with --force handed to the operation', async () => {
    await run(['-i', 'mapA', '--force', '-y']);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteMappings).toHaveBeenCalledWith(
      'mapA',
      undefined,
      undefined,
      force
    );
  });

  test('with -d goes on without -y and without a question, as a dry run', async () => {
    await run(['-i', 'mapA', '--force', '-d']);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteMappings.mock.calls[0][1]).toBe(true);
    expect(configManagerDeleteMappings.mock.calls[0][3]).toEqual(force);
  });

  test('on a terminal shows the plan, which is a dry run with --force, asks with the default no, and deletes after a yes', async () => {
    terminal = true;

    await run(['-i', 'mapA', '--force']);

    const calls = configManagerDeleteMappings.mock.calls;
    expect(calls.map((call) => call[1])).toEqual([true, undefined]);
    for (const call of calls) expect(call[0]).toBe('mapA');
    // the first call is the plan before the question, and says so; the second is the delete
    expect(calls[0][3]).toEqual({ force: true, plan: true });
    expect(calls[1][3]).toEqual(force);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(confirm.mock.calls[0][0].message).toContain(
      "Delete connector mapping 'mapA' although other objects may name it"
    );
    expect(messages().join('\n')).toContain(
      "Connector mapping 'mapA' is deleted, and nothing else is changed. This cannot be undone."
    );
    expect(
      configManagerDeleteMappings.mock.invocationCallOrder[0]
    ).toBeLessThan(confirm.mock.invocationCallOrder[0]);
  });

  test('on a terminal deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run(['-i', 'mapA', '--force'], { answer: false });

    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteMappings.mock.calls[0][1]).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test('on a terminal does not ask when the plan failed (the connector mapping is not there, or cannot be checked)', async () => {
    terminal = true;
    configManagerDeleteMappings.mockResolvedValue(false);

    await run(['-i', 'mapA', '--force']);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteMappings).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  test.each([[['--force']], [['--force', '-y']], [['--force', '-d']]])(
    '%j without -i is refused before the login: it applies to a named connector mapping only',
    async (args) => {
      await run(args);

      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteMappings).not.toHaveBeenCalled();
      expect(messages().join('\n')).toContain(
        '--force applies to a named connector mapping only: add -i/--connector-mapping-id, or leave it out.'
      );
      expect(process.exitCode).toBe(1);
    }
  );
});
