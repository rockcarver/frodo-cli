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
 * The command `config-manager delete remote-servers`: what the command line does
 * before the operation runs. The real bulk-delete guard decides (a command that
 * can delete more than the one object it names asks first:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md),
 * with a terminal that the test switches on and off and an answer that the
 * test gives; the operation is a spy. What the operation does is in
 * FrConfigRemoteServersDelete.test.js, the selectors in
 * ConfigManagerDeleteSelectorWiring.test.js, and the real command against a fake
 * tenant in ConfigManagerDeleteRemoteServersFakeTenant.test.js.
 *
 * - A delete of all connector servers is refused before the login without a
 *   terminal and without `-y`, and asks on a terminal after showing a plan that
 *   is a dry run.
 * - A named delete never asks, unless it has `--force`: then it changes the
 *   server clusters that list the connector server, so it is refused before the
 *   login without a terminal and without `-y`, and asks on a terminal after a
 *   plan, which is a dry run of the same command.
 * - `--force` and `--keep-links` need a named connector server and
 *   `--keep-links` needs `--force`: all refused before the login. A blank id is
 *   refused before the login.
 * - The command is for Cloud and ForgeOps: it says so to the login.
 */

const getTokens = jest.fn();
const configManagerDeleteRemoteServers = jest.fn();
const printMessage = jest.fn();
const confirm = jest.fn();
const constructed = [];
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
      constructed.push(args);
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
  '../../src/configManagerOps/FrConfigRemoteServersOps',
  () => ({
    configManagerDeleteRemoteServers,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-remote-servers');

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
const DEPLOYMENTS = ['cloud', 'forgeops'];

beforeEach(() => {
  jest.clearAllMocks();
  terminal = false;
  process.exitCode = 0;
  getTokens.mockResolvedValue(true);
  configManagerDeleteRemoteServers.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = 0;
});

describe('the options', () => {
  test('-i, --server-id is the selector, -n and --name are its aliases, and the rest of the options are the delete options', async () => {
    const program = await run(['-i', 'x', '-y']);

    expect(program.options.map((option) => option.long).sort()).toEqual([
      '--allow-failures',
      '--dry-run',
      '--force',
      '--keep-links',
      '--server-id',
      '--yes',
    ]);
    const selector = program.options.find(
      (option) => option.long === '--server-id'
    );
    expect(selector.short).toBe('-i');
  });

  test.each([['-i'], ['--server-id'], ['-n'], ['--name']])(
    '%s hands the name to the operation',
    async (flag) => {
      await run([flag, 'rcs']);

      expect(configManagerDeleteRemoteServers).toHaveBeenCalledWith(
        'rcs',
        undefined,
        undefined,
        { force: undefined, keepLinks: undefined }
      );
    }
  );

  test('the command is for Cloud and ForgeOps, and says so to the login', async () => {
    await run(['-i', 'rcs']);

    expect(constructed[0][2]).toEqual(DEPLOYMENTS);
    expect(getTokens).toHaveBeenCalledWith(false, true, DEPLOYMENTS);
  });

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
      '--allow-failures keeps the exit code at 0 for a write that failed, but never for a refusal, a connector server that does not exist, or a configuration that changed while it was being deleted or did not read back as it was written.'
    );
  });

  test('says "connector server" and "server cluster", never "remote server" or "group"', async () => {
    const program = await run(['-i', 'x']);
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();
    const text = `${program.description()}\n${help}\n${program.options.map((option) => option.description).join('\n')}`;

    expect(text).toContain('connector server');
    expect(text).toContain('server cluster');
    // the name of the command is the one place where the old word stays
    const rest = text.replace(/remote-servers/g, '');
    expect(rest).not.toMatch(/\bremote\b/i);
    expect(rest).not.toMatch(/\bgroups?\b/i);
  });
});

describe('a delete of all connector servers', () => {
  test('is refused before the login without a terminal and without -y, naming -y and --dry-run and what goes', async () => {
    await run([]);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).not.toHaveBeenCalled();
    expect(refused()).toContain('all connector servers');
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
      expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
      expect(configManagerDeleteRemoteServers.mock.calls[0][0]).toBeUndefined();
      expect(process.exitCode).toBe(0);
    }
  );

  test('on a terminal shows the plan (a dry run), asks, and deletes after a yes', async () => {
    terminal = true;

    await run([]);

    const calls = configManagerDeleteRemoteServers.mock.calls;
    expect(calls.map((call) => call[1])).toEqual([true, undefined]);
    // the first call is the plan before the question, and says so; the second is the delete
    expect(calls[0][3]).toEqual({
      force: undefined,
      keepLinks: undefined,
      plan: true,
    });
    expect(calls[1][3]).toEqual({ force: undefined, keepLinks: undefined });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(messages().join('\n')).toContain(
      'This permanently deletes all connector servers from https://openam-matrix.example.com/am'
    );
    expect(
      configManagerDeleteRemoteServers.mock.invocationCallOrder[0]
    ).toBeLessThan(confirm.mock.invocationCallOrder[0]);
    expect(process.exitCode).toBe(0);
  });

  test('on a terminal deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run([], { answer: false });

    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteRemoteServers.mock.calls[0][1]).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test('on a terminal does not ask when the plan failed', async () => {
    terminal = true;
    configManagerDeleteRemoteServers.mockResolvedValue(false);

    await run([]);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  test('exits 1 when the operation reports a failure, and hands --allow-failures on', async () => {
    configManagerDeleteRemoteServers.mockResolvedValue(false);

    await run(['-y', '--allow-failures']);

    expect(configManagerDeleteRemoteServers).toHaveBeenCalledWith(
      undefined,
      undefined,
      true,
      { force: undefined, keepLinks: undefined }
    );
    expect(process.exitCode).toBe(1);
  });

  test('hands the dry run to the operation', async () => {
    await run(['-d']);

    expect(configManagerDeleteRemoteServers.mock.calls[0][1]).toBe(true);
  });
});

describe('a login that fails', () => {
  test.each([
    [['-y']],
    [['-i', 'rcs']],
    [['-i', 'rcs', '--force', '-y']],
    [['-i', 'rcs', '-d']],
  ])('%j ends with exit code 1, and nothing is asked or run', async (args) => {
    getTokens.mockResolvedValue(false);

    await run(args);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteRemoteServers).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('a named delete', () => {
  test('never asks and needs no -y: the operation refuses what is named by something', async () => {
    terminal = true;

    await run(['-i', 'rcs']);

    expect(confirm).not.toHaveBeenCalled();
    expect(refused()).toBeUndefined();
    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  test('exits 1 when the operation says the delete failed or was refused', async () => {
    configManagerDeleteRemoteServers.mockResolvedValue(false);

    await run(['-i', 'rcs']);

    expect(process.exitCode).toBe(1);
  });

  test('-d hands the dry run to the operation, once, and never asks', async () => {
    terminal = true;

    await run(['-i', 'rcs', '-d']);

    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteRemoteServers.mock.calls[0][1]).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  test.each([[['-i', '  ']], [['-n', '\t']], [['--server-id', ' ']]])(
    'a blank name %j is refused before the login, in the words of the command',
    async (args) => {
      await run(args);

      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteRemoteServers).not.toHaveBeenCalled();
      expect(messages().join('\n')).toContain(
        'The connector server id (-i) must not be empty. To delete all connector servers, leave out -i.'
      );
      expect(process.exitCode).toBe(1);
    }
  );

  test('an empty name is refused while the command line is parsed', async () => {
    await expect(run(['-i', ''])).rejects.toMatchObject({
      code: 'commander.invalidArgument',
    });

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).not.toHaveBeenCalled();
  });
});

describe('a named delete with --force', () => {
  const force = { force: true, keepLinks: undefined };

  test('is refused before the login without a terminal and without -y, naming -y and --dry-run', async () => {
    await run(['-i', 'rcs', '--force']);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).not.toHaveBeenCalled();
    expect(refused()).toContain(
      "delete connector server 'rcs' and change the server clusters that list it"
    );
    expect(refused()).toContain('-y/--yes');
    expect(refused()).toContain('--dry-run');
    expect(process.exitCode).toBe(1);
  });

  test('with --keep-links the refusal says that no server cluster changes', async () => {
    await run(['-i', 'rcs', '--force', '--keep-links']);

    expect(refused()).toContain(
      "delete connector server 'rcs' although server clusters and connectors still name it"
    );
    expect(process.exitCode).toBe(1);
  });

  test('with -y goes on without a question, with --force handed to the operation', async () => {
    await run(['-i', 'rcs', '--force', '-y']);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteRemoteServers).toHaveBeenCalledWith(
      'rcs',
      undefined,
      undefined,
      force
    );
  });

  test('with -d goes on without -y and without a question, as a dry run', async () => {
    await run(['-i', 'rcs', '--force', '-d']);

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteRemoteServers.mock.calls[0][1]).toBe(true);
    expect(configManagerDeleteRemoteServers.mock.calls[0][3]).toEqual(force);
  });

  test('on a terminal shows the plan, which is a dry run with --force, asks with the default no, and deletes after a yes', async () => {
    terminal = true;

    await run(['-i', 'rcs', '--force', '--keep-links']);

    const calls = configManagerDeleteRemoteServers.mock.calls;
    expect(calls.map((call) => call[1])).toEqual([true, undefined]);
    for (const call of calls) expect(call[0]).toBe('rcs');
    expect(calls[0][3]).toEqual({ force: true, keepLinks: true, plan: true });
    expect(calls[1][3]).toEqual({ force: true, keepLinks: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(confirm.mock.calls[0][0].message).toContain(
      "Delete connector server 'rcs' although server clusters and connectors still name it"
    );
    expect(messages().join('\n')).toContain(
      "Connector server 'rcs' is deleted and every change listed above is made. This cannot be undone."
    );
    expect(
      configManagerDeleteRemoteServers.mock.invocationCallOrder[0]
    ).toBeLessThan(confirm.mock.invocationCallOrder[0]);
  });

  test('on a terminal changes and deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run(['-i', 'rcs', '--force'], { answer: false });

    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteRemoteServers.mock.calls[0][1]).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  test('on a terminal does not ask when the plan failed (the connector server is not there)', async () => {
    terminal = true;
    configManagerDeleteRemoteServers.mockResolvedValue(false);

    await run(['-i', 'rcs', '--force']);

    expect(confirm).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});

describe('--force and --keep-links', () => {
  test.each([[['--force', '-y']], [['--keep-links', '--force', '-y']]])(
    '%j without -i is refused before the login: it applies to a named connector server only',
    async (args) => {
      await run(args);

      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteRemoteServers).not.toHaveBeenCalled();
      expect(messages().join('\n')).toContain(
        'applies to a named connector server only: add -i/--server-id, or leave it out.'
      );
      expect(process.exitCode).toBe(1);
    }
  );

  test('--keep-links without --force is refused before the login', async () => {
    await run(['-i', 'rcs', '--keep-links']);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteRemoteServers).not.toHaveBeenCalled();
    expect(messages().join('\n')).toContain(
      '--keep-links applies together with --force only'
    );
    expect(process.exitCode).toBe(1);
  });

  test('--keep-links with --force is handed to the operation', async () => {
    await run(['-i', 'rcs', '--force', '--keep-links', '-y']);

    expect(configManagerDeleteRemoteServers.mock.calls[0][3]).toEqual({
      force: true,
      keepLinks: true,
    });
  });
});
