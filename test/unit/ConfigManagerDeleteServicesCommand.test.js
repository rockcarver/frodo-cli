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
 * The command `config-manager delete services`: what the command line does
 * before the operation runs. The real bulk-delete guard decides (a command that
 * can delete more than the one object it names asks first:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md),
 * with a terminal that the test switches on and off and an answer that the
 * test gives; the operation is a spy. What the operation does is in
 * FrConfigServicesDelete.test.js, the selectors in
 * ConfigManagerDeleteSelectorWiring.test.js, and the real command against a fake
 * tenant in ConfigManagerDeleteServicesFakeTenant.test.js.
 *
 * - A delete of all services is refused before the login without a terminal and
 *   without `-y`, and asks on a terminal after showing a plan that is a dry run
 *   of the same command; a dry run and `-y` go on without a question.
 * - A named delete never asks and needs no `-y`, and it needs a realm: without
 *   one it is refused before the login with the error only.
 * - An empty or blank id never means "all services".
 * - The command works on every deployment type, declares its realm and hands the
 *   realm that the run was given to the operation.
 */

const getTokens = jest.fn();
const configManagerDeleteServices = jest.fn();
const printMessage = jest.fn();
const confirm = jest.fn();
let terminal;
const declared = { usesRealm: 0, multiOp: 0, deploymentTypes: undefined };

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
jest.unstable_mockModule('../../src/utils/interactive/PositionalArgs', () => ({
  // the realm that the run was picked or given: the stale parameter must not be what the operation gets
  realmOfRun: (_command, realm) => (realm === 'stale' ? 'picked' : realm),
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => terminal,
}));
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));
jest.unstable_mockModule(
  '../../src/configManagerOps/FrConfigServiceOps',
  () => ({
    configManagerDeleteServices,
  })
);

const { default: setup } =
  await import('../../src/cli/config-manager/config-manager-delete/config-manager-delete-services');

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
  configManagerDeleteServices.mockResolvedValue(true);
});
afterEach(() => {
  process.exitCode = 0;
});

describe('the options', () => {
  test('-i, --service-id is the selector, -n and --name are its aliases, and the rest of the options are the delete options', async () => {
    const program = await run(['-i', 'x', '-y']);

    expect(program.options.map((option) => option.long).sort()).toEqual([
      '--allow-failures',
      '--dry-run',
      '--service-id',
      '--yes',
    ]);
    const selector = program.options.find(
      (option) => option.long === '--service-id'
    );
    expect(selector.short).toBe('-i');
  });

  test.each([['-i'], ['--service-id'], ['-n'], ['--name']])(
    '%s hands the id to the operation, with the realm',
    async (flag) => {
      await run([flag, 'email']);

      expect(configManagerDeleteServices).toHaveBeenCalledWith(
        'email',
        'alpha',
        undefined,
        undefined
      );
    }
  );

  test('declares its realm and the shared --allow-failures, and no deployment type: it works on all of them', async () => {
    declared.usesRealm = 0;
    declared.multiOp = 0;
    await run(['-d']);

    expect(declared.usesRealm).toBe(1);
    expect(declared.multiOp).toBe(1);
    expect(declared.deploymentTypes).toBeUndefined();
  });

  test('has the description of a realm service, and usage examples that run without a prompt', async () => {
    const program = await run(['-d']);
    let help = '';
    program.configureOutput({ writeOut: (text) => (help += text) });
    program.outputHelp();

    expect(program.description()).toBe('Delete realm services.');
    const examples = help
      .split('\n')
      .filter((line) => line.trimStart().startsWith('$ frodo '));
    expect(examples.length).toBeGreaterThanOrEqual(5);
    // an example without -i deletes everything and carries -d or -y
    for (const example of examples) {
      if (!example.includes(' -i ')) expect(example).toMatch(/ -[dy] /);
      expect(example).not.toContain(' -n ');
    }
    // the plain form, the one realm, the one service and the preview of one are all there
    expect(examples.some((line) => / -y matrix$/.test(line))).toBe(true);
    expect(examples.some((line) => / -d matrix$/.test(line))).toBe(true);
    expect(examples.some((line) => / -y matrix alpha$/.test(line))).toBe(true);
    expect(examples.some((line) => / -i email matrix alpha$/.test(line))).toBe(
      true
    );
    expect(
      examples.some((line) => / -i email -d matrix alpha$/.test(line))
    ).toBe(true);
    // what the help says about the services that a realm depends on, and about what a delete of all leaves alone
    expect(help).toContain('Services that other objects use are not looked up');
    expect(help).toContain('DataStoreService excepted');
    expect(help).toContain('It does not refuse to delete them');
    expect(help).toContain(
      '--allow-failures keeps the exit code at 0 for a service that could not be read or deleted and for a realm that could not be listed, but never for a service that is not there.'
    );
    // what the summary counts, what is never sent, and what a restore can and cannot bring back
    expect(help).toContain(
      'a realm whose services cannot be listed, or that the tenant lists with a name that is not a realm name, is one operation of its own, written as realm and its name (realm alpha), so the summary counts it as one'
    );
    expect(help).toContain(
      'named realm/service (root/service in the root realm)'
    );
    expect(help).toContain(
      'or the type or id of one of its next descendents, is not a plain name'
    );
    expect(help).toContain(
      '(no slash, backslash, question mark, hash, percent sign, double dot, control character, text direction control or invisible separator)'
    );
    expect(help).toContain(
      'it counts as one failed service, however many of its next descendents are not plain. --allow-failures forgives that in a delete of all services, and never in a delete that names the service with -i.'
    );
    expect(help).toContain(
      'A delete of all services that asks first stops at a plan that shows such an id, before the question, and says so.'
    );
    expect(help).toContain('With -i only the named service counts');
    expect(help).toContain(
      'as far as pull services exports it: it never exports DataStoreService'
    );
    // no word that belongs to the library
    expect(help).not.toMatch(/deleteFullService|getFullServices|frodo-lib/);
  });
});

describe('a delete of all services', () => {
  test('is refused before the login without a terminal and without -y, naming -y and --dry-run and the realms', async () => {
    await run([]);

    expect(getTokens).not.toHaveBeenCalled();
    expect(configManagerDeleteServices).not.toHaveBeenCalled();
    expect(refused()).toContain(
      'Refusing to delete all services in the selected realms without confirmation'
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
      expect(configManagerDeleteServices).toHaveBeenCalledTimes(1);
      expect(configManagerDeleteServices.mock.calls[0][0]).toBeUndefined();
      expect(process.exitCode).toBe(0);
    }
  );

  test('on a terminal shows the plan (a dry run of the same command), asks with the default no, and deletes after a yes', async () => {
    terminal = true;

    await run([]);

    expect(configManagerDeleteServices.mock.calls).toEqual([
      [undefined, 'alpha', true, false, { plan: true }],
      [undefined, 'alpha', undefined, undefined],
    ]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].default).toBe(false);
    expect(confirm.mock.calls[0][0].message).toContain(
      'all services in the selected realms'
    );
    expect(messages().join('\n')).toContain(
      'This permanently deletes all services in the selected realms from https://openam-matrix.example.com/am'
    );
    expect(process.exitCode).toBe(0);
  });

  test('on a terminal the question names the realm that was given, and for every realm it names none: the plan above it names the realms', async () => {
    terminal = true;

    await run([], { realm: 'alpha' });
    const withRealm = messages().find((text) =>
      text.startsWith('This permanently deletes')
    );
    expect(withRealm).toBe(
      'This permanently deletes all services in the selected realms from https://openam-matrix.example.com/am (realm alpha).'
    );

    printMessage.mockClear();
    await run([], { realm: null });
    const everyRealm = messages().find((text) =>
      text.startsWith('This permanently deletes')
    );
    expect(everyRealm).toBe(
      'This permanently deletes all services in the selected realms from https://openam-matrix.example.com/am.'
    );
    // a realm that is the default is no realm either
    printMessage.mockClear();
    await run([], { realm: '__default__realm__' });
    expect(
      messages().find((text) => text.startsWith('This permanently deletes'))
    ).not.toContain('(realm');
  });

  test('on a terminal deletes nothing after a no, and fails', async () => {
    terminal = true;

    await run([], { answer: false });

    expect(configManagerDeleteServices).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteServices.mock.calls[0][2]).toBe(true);
    expect(messages()).toContain('Delete aborted.');
    expect(process.exitCode).toBe(1);
  });

  test('on a terminal, a plan that failed is not followed by a question or a delete', async () => {
    terminal = true;
    configManagerDeleteServices.mockResolvedValue(false);

    await run([]);

    expect(configManagerDeleteServices).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('a dry run hands the dry run to the operation, once, and never asks', async () => {
    terminal = true;

    await run(['-d']);

    expect(configManagerDeleteServices).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteServices.mock.calls[0][2]).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('exits 1 when the operation reports a failure, and hands --allow-failures on', async () => {
    configManagerDeleteServices.mockResolvedValue(false);

    await run(['-y', '--allow-failures']);

    expect(configManagerDeleteServices).toHaveBeenCalledWith(
      undefined,
      'alpha',
      undefined,
      true
    );
    expect(process.exitCode).toBe(1);
  });

  test('exits 0 when the operation succeeds', async () => {
    await run(['-y']);

    expect(process.exitCode).toBe(0);
  });

  test('hands the realm that the run was given, which the realm picker may have changed, and none when there is no realm', async () => {
    await run(['-y'], { realm: 'stale' });
    expect(configManagerDeleteServices.mock.calls[0][1]).toBe('picked');

    configManagerDeleteServices.mockClear();
    await run(['-y'], { realm: null });
    expect(configManagerDeleteServices.mock.calls[0][1]).toBeUndefined();
  });
});

describe('a login that fails', () => {
  test.each([[['-y']], [['-i', 'email']], [['-i', 'email', '-d']]])(
    '%j ends with exit code 1, and nothing is asked or run',
    async (args) => {
      getTokens.mockResolvedValue(false);

      await run(args);

      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(configManagerDeleteServices).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );
});

describe('a named delete', () => {
  test('never asks and needs no -y, with or without a terminal', async () => {
    for (terminal of [true, false]) {
      await run(['-i', 'email']);

      expect(confirm).not.toHaveBeenCalled();
      expect(refused()).toBeUndefined();
    }
    expect(configManagerDeleteServices).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(0);
  });

  test.each([[null], ['__default__realm__']])(
    'without a realm (%s) is refused before the login, with the error only',
    async (realm) => {
      await run(['-i', 'email'], { realm });

      expect(messages()).toEqual([
        'The -i, --service-id option requires a realm argument to be specified.',
      ]);
      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteServices).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test('exits 1 when the operation says the delete failed or the service is not there', async () => {
    configManagerDeleteServices.mockResolvedValue(false);

    await run(['-i', 'email']);

    expect(process.exitCode).toBe(1);
  });

  test('-d hands the dry run to the operation, once, and never asks', async () => {
    terminal = true;

    await run(['-i', 'email', '-d']);

    expect(configManagerDeleteServices).toHaveBeenCalledTimes(1);
    expect(configManagerDeleteServices.mock.calls[0][2]).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('an id that is blank is never "all"', () => {
  test.each([[' '], ['   '], ['\t']])(
    '-i %j is refused before the login, even with -y, and nothing is run',
    async (blank) => {
      await run(['-i', blank, '-y']);

      expect(messages()).toContain(
        'The service id (-i) must not be empty. To delete all services, leave out -i.'
      );
      expect(getTokens).not.toHaveBeenCalled();
      expect(configManagerDeleteServices).not.toHaveBeenCalled();
      expect(refused()).toBeUndefined();
      expect(process.exitCode).toBe(1);
    }
  );

  test.each([
    [['-i', '']],
    [['--service-id', '']],
    [['--service-id=']],
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
      expect(configManagerDeleteServices).not.toHaveBeenCalled();
      expect(printMessage).not.toHaveBeenCalled();
    }
  );
});
