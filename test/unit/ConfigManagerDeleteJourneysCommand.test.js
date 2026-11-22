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
 * The command `config-manager delete journeys`: what the command line does
 * before the operation runs. The real bulk-delete guard decides (a command that
 * can delete more than the one object it names asks first:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md),
 * with a terminal that the test switches on and off and an answer that the
 * test gives; the operation is a spy. What the operation does is in
 * ConfigManagerDeleteJourneys.test.js, the selectors in
 * ConfigManagerDeleteSelectorWiring.test.js, and the real command against a fake
 * tenant in ConfigManagerDeleteJourneysFakeTenant.test.js.
 *
 * - A delete of all journeys is refused before the login without a terminal and
 *   without `-y` (and says that the journeys of the login go too), and asks on
 *   a terminal after showing a plan that is a dry run.
 * - A named delete never asks, unless it has `--force`: then it changes the
 *   objects that name the journey, so it is refused before the login without a
 *   terminal and without `-y`, and asks on a terminal after a plan, which is a
 *   dry run of the same command.
 * - `--force` and `--keep-links` need a named journey, `--keep-links` needs
 *   `--force`, and a named journey needs a realm: all refused before the login.
 */

const getTokens = jest.fn();
const configManagerDeleteJourneys = jest.fn();
const printMessage = jest.fn();
const confirm = jest.fn();
let terminal;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    getHost: () => 'https://openam-matrix.example.com/am',
    getRealm: () => 'alpha',
  },
  frodo: {
    utils: { constants: { DEFAULT_REALM_KEY: '__default__realm__' } },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(args[0]);
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
jest.unstable_mockModule('../../src/utils/interactive/PositionalArgs', () => ({
  realmOfRun: (_command, realm) => realm,
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => terminal,
}));
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigJourneysOps',
  () => ({
    configManagerDeleteJourneys,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-journeys');

/** Runs the command with arguments, a host and a realm; the answer is what the question gets. */
async function run(args, { answer = true, realm = 'alpha' } = {}) {
  confirm.mockReset().mockResolvedValue(answer);
  const program = setup();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  await program.parseAsync([...args, 'matrix', ...(realm ? [realm] : [])], {
    from: 'user',
  });
  return program;
}

const messages = () => printMessage.mock.calls.map(([text]) => String(text));
const refused = () => messages().find((text) => text.startsWith('Refusing'));

beforeEach(() => {
  jest.clearAllMocks();
  terminal = false;
  process.exitCode = 0;
  getTokens.mockResolvedValue(true);
  configManagerDeleteJourneys.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = 0;
});

describe('the options', () => {
  test('-i, --journey-id is the selector, -n and --name are its aliases, and the rest of the options are the delete options', async () => {
    const program = await run(['-i', 'x', '-y']);

    expect(program.options.map((option) => option.long).sort()).toEqual([
      '--allow-failures',
      '--dry-run',
      '--force',
      '--journey-id',
      '--keep-links',
      '--yes',
    ]);
    const selector = program.options.find(
      (option) => option.long === '--journey-id'
    );
    expect(selector.short).toBe('-i');
  });

  test.each([['-i'], ['--journey-id'], ['-n'], ['--name']])(
    '%s hands the id to the operation',
    async (flag) => {
      await run([flag, 'ZionLogin']);

      expect(configManagerDeleteJourneys).toHaveBeenCalledWith(
        'ZionLogin',
        'alpha',
        undefined,
        undefined,
        { force: undefined, keepLinks: undefined }
      );
    }
  );

  test('has usage examples, each of which runs without a prompt, and the description names --force', async () => {
    const program = await run(['-i', 'x']);
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    const examples = help
      .split('\n')
      .filter((line) => line.trimStart().startsWith('$ frodo '));
    expect(examples.length).toBeGreaterThanOrEqual(6);
    // an example without -i deletes everything and carries -d or -y; one that
    // changes other objects (--force) carries -y
    for (const example of examples) {
      if (!example.includes(' -i ')) expect(example).toMatch(/ -[dy] /);
      if (example.includes('--force')) expect(example).toContain(' -y ');
      expect(example).not.toContain(' -n ');
    }
    expect(program.description()).toContain('--force');
    expect(help).toContain('is not proof that it is unused');
    // what --allow-failures does not turn into exit code 0 is said in the help of the command itself
    expect(help).toContain(
      '--allow-failures keeps the exit code at 0 for a delete that failed, but never for a refusal, a journey that does not exist, or a failed clearing, restore or unlink.'
    );
  });
});

describe('a delete of all journeys', () => {
  test('is refused before the login without a terminal and without -y, naming -y and --dry-run and what goes', async () => {
    await run([]);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteJourneys).not.toHaveBeenCalled();
    expect(refused()).toContain(
      'all journeys (the journeys that the realm uses for login included) and all orphaned nodes in the selected realms'
    );
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
      expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
      expect(configManagerDeleteJourneys.mock.calls[0][0]).toBeUndefined();
      expect(process.exitCode).toBe(0);
    }
  );

  test('on a terminal shows the plan (a dry run), asks, and deletes after a yes', async () => {
    terminal = true;

    await run([]);

    expect(
      configManagerDeleteJourneys.mock.calls.map((call) => call[2])
    ).toEqual([true, undefined]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(messages().join('\n')).toContain(
      'This permanently deletes all journeys (the journeys that the realm uses for login included) and all orphaned nodes in the selected realms'
    );
    expect(process.exitCode).toBe(0);
  });

  test('on a terminal deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run([], { answer: false });

    expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteJourneys.mock.calls[0][2]).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 when the operation reports a failure, and hands --allow-failures and the dry run on', async () => {
    configManagerDeleteJourneys.mockResolvedValue(false);

    await run(['-y', '--allow-failures']);

    expect(configManagerDeleteJourneys).toHaveBeenCalledWith(
      undefined,
      'alpha',
      undefined,
      true,
      { force: undefined, keepLinks: undefined }
    );
    expect(process.exitCode).toBe(1);
  });
});

describe('a login that fails', () => {
  test.each([
    [['-y']],
    [['-i', 'ZionLogin']],
    [['-i', 'ZionLogin', '--force', '-y']],
    [['-i', 'ZionLogin', '-d']],
  ])('%j ends with exit code 1, and nothing is asked or run', async (args) => {
    getTokens.mockResolvedValue(false);

    await run(args);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteJourneys).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('a named delete', () => {
  test('never asks and needs no -y: the operation refuses what is named by something', async () => {
    terminal = true;

    await run(['-i', 'ZionLogin']);

    expect(confirm).not.toHaveBeenCalled();
    expect(refused()).toBeUndefined();
    expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  test('without a realm is refused before the login', async () => {
    await run(['-i', 'ZionLogin'], { realm: null });

    expect(messages()).toContain(
      'The -i, --journey-id option requires a realm argument to be specified.'
    );
    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteJourneys).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 when the operation says the delete failed or was refused', async () => {
    configManagerDeleteJourneys.mockResolvedValue(false);

    await run(['-i', 'ZionLogin']);

    expect(process.exitCode).toBe(1);
  });

  test('-d hands the dry run to the operation, once, and never asks', async () => {
    terminal = true;

    await run(['-i', 'ZionLogin', '-d']);

    expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteJourneys.mock.calls[0][2]).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('a named delete with --force', () => {
  const force = { force: true, keepLinks: undefined };

  test('is refused before the login without a terminal and without -y, naming -y and --dry-run', async () => {
    await run(['-i', 'ZionLogin', '--force']);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteJourneys).not.toHaveBeenCalled();
    expect(refused()).toContain(
      "delete journey 'ZionLogin' and change the objects that name it"
    );
    expect(refused()).toContain('-y/--yes');
    expect(refused()).toContain('--dry-run');
    expect(process.exitCode).toBe(1);
  });

  test('with -y goes on without a question, with --force handed to the operation', async () => {
    await run(['-i', 'ZionLogin', '--force', '-y']);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteJourneys).toHaveBeenCalledWith(
      'ZionLogin',
      'alpha',
      undefined,
      undefined,
      force
    );
  });

  test('with -d goes on without -y and without a question, as a dry run', async () => {
    await run(['-i', 'ZionLogin', '--force', '-d']);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteJourneys.mock.calls[0][2]).toBe(true);
    expect(configManagerDeleteJourneys.mock.calls[0][4]).toEqual(force);
  });

  test('on a terminal shows the plan, which is a dry run with --force, asks with the default no, and deletes after a yes', async () => {
    terminal = true;

    await run(['-i', 'ZionLogin', '--force', '--keep-links']);

    const calls = configManagerDeleteJourneys.mock.calls;
    expect(calls.map((call) => call[2])).toEqual([true, undefined]);
    for (const call of calls) expect(call[0]).toBe('ZionLogin');
    // the first call is the plan before the question, and says so; the second is the delete
    expect(calls[0][4]).toEqual({ force: true, keepLinks: true, plan: true });
    expect(calls[1][4]).toEqual({ force: true, keepLinks: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(confirm.mock.calls[0][0].message).toContain(
      "Delete journey 'ZionLogin' and change the objects that name it"
    );
    expect(messages().join('\n')).toContain(
      "Journey 'ZionLogin' is deleted and every change listed above is made. This cannot be undone."
    );
    // the plan comes before the question
    expect(
      calls[0] && configManagerDeleteJourneys.mock.invocationCallOrder[0]
    ).toBeLessThan(confirm.mock.invocationCallOrder[0]);
  });

  test('on a terminal changes and deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run(['-i', 'ZionLogin', '--force'], { answer: false });

    expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteJourneys.mock.calls[0][2]).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test('on a terminal does not ask when the plan failed (the journey is not there, or is named by something)', async () => {
    terminal = true;
    configManagerDeleteJourneys.mockResolvedValue(false);

    await run(['-i', 'ZionLogin', '--force']);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteJourneys).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});

describe('--force and --keep-links', () => {
  test.each([[['--force', '-y']], [['--keep-links', '--force', '-y']]])(
    '%j without -i is refused before the login: it applies to a named journey only',
    async (args) => {
      await run(args);

      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteJourneys).not.toHaveBeenCalled();
      expect(messages().join('\n')).toContain(
        'applies to a named journey only: add -i/--journey-id, or leave it out.'
      );
      expect(process.exitCode).toBe(1);
    }
  );

  test('--keep-links without --force is refused before the login', async () => {
    await run(['-i', 'ZionLogin', '--keep-links']);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteJourneys).not.toHaveBeenCalled();
    expect(messages().join('\n')).toContain(
      '--keep-links applies together with --force only'
    );
    expect(process.exitCode).toBe(1);
  });

  test('--keep-links with --force is handed to the operation', async () => {
    await run(['-i', 'ZionLogin', '--force', '--keep-links', '-y']);

    expect(configManagerDeleteJourneys.mock.calls[0][4]).toEqual({
      force: true,
      keepLinks: true,
    });
  });
});
