import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `frodo dcc session apply` hands `-w, --wait` and `--json` to the operation,
 * and sets the exit code from what the operation answers. `init`, `abort` and
 * `state` keep passing `--json` only: waiting belongs to apply (the commands
 * `config-manager push direct-control-*` that had it are removed, see
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0056-the-configuration-command-group.md).
 *
 * The operations and the login are mocked: this pins how the commands wire them.
 */

const getTokens = jest.fn();
const applyDirectConfigurationSession = jest.fn();
const initDirectConfigurationSession = jest.fn();
const abortDirectConfigurationSession = jest.fn();
const readDirectConfigurationSessionState = jest.fn();
const verboseMessage = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
  },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
      this.exitOverride();
      this.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    }

    handleDefaultArgsAndOpts() {}
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule(
  '../../src/ops/cloud/EnvDirectConfigurationControlOps',
  () => ({
    applyDirectConfigurationSession,
    initDirectConfigurationSession,
    abortDirectConfigurationSession,
    readDirectConfigurationSessionState,
  })
);
jest.unstable_mockModule('../../src/utils/Console', () => ({
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const dir = '../../src/cli/dcc/';
const { default: setupApply } = await import(`${dir}dcc-session-apply`);
const { default: setupInit } = await import(`${dir}dcc-session-init`);
const { default: setupAbort } = await import(`${dir}dcc-session-abort`);
const { default: setupState } = await import(`${dir}dcc-session-state`);

async function run(setup, args) {
  process.exitCode = 0;
  let error;
  try {
    await setup().parseAsync(args, { from: 'user' });
  } catch (e) {
    error = e;
  }
  const exitCode = process.exitCode;
  process.exitCode = 0;
  return { exitCode, error };
}

beforeEach(() => {
  jest.clearAllMocks();
  getTokens.mockResolvedValue(true);
  applyDirectConfigurationSession.mockResolvedValue(true);
  initDirectConfigurationSession.mockResolvedValue(true);
  abortDirectConfigurationSession.mockResolvedValue(true);
  readDirectConfigurationSessionState.mockResolvedValue(true);
});

describe('dcc session apply', () => {
  test.each([
    [[], undefined, false],
    [['-w'], undefined, true],
    [['--wait'], undefined, true],
    [['--json'], true, false],
    [['--json', '--wait'], true, true],
    [['-w', '--json'], true, true],
  ])('%j passes json %s and wait %s on', async (args, json, wait) => {
    expect((await run(setupApply, args)).exitCode).toBe(0);

    expect(applyDirectConfigurationSession).toHaveBeenCalledTimes(1);
    const [jsonArgument, waitArgument] =
      applyDirectConfigurationSession.mock.calls[0];
    expect(jsonArgument).toBe(json);
    expect(Boolean(waitArgument)).toBe(wait);
    if (wait) expect(waitArgument).toBe(true);
  });

  test.each([[[]], [['--wait']]])(
    '%j sets the exit code 1 when the operation fails',
    async (args) => {
      applyDirectConfigurationSession.mockResolvedValue(false);

      expect((await run(setupApply, args)).exitCode).toBe(1);
    }
  );

  test.each([[[]], [['--wait']]])(
    '%j sets the exit code 1 and calls nothing when the login fails',
    async (args) => {
      getTokens.mockResolvedValue(false);

      expect((await run(setupApply, args)).exitCode).toBe(1);
      expect(applyDirectConfigurationSession).not.toHaveBeenCalled();
    }
  );

  test('says what it does in the verbose output, as the removed command did', async () => {
    await run(setupApply, []);

    expect(verboseMessage).toHaveBeenCalledWith(
      'Applying changes from direct configuration session.'
    );
  });

  test('declares -w, --wait and --json, and nothing that takes a time', () => {
    const flags = setupApply().options.map((option) => option.flags);

    expect(flags).toEqual(expect.arrayContaining(['-w, --wait', '--json']));
    expect(flags.filter((flag) => /timeout/.test(flag))).toEqual([]);
  });
});

describe.each([
  [
    'init',
    setupInit,
    initDirectConfigurationSession,
    'Initializing direct configuration session.',
  ],
  [
    'abort',
    setupAbort,
    abortDirectConfigurationSession,
    'Aborting direct configuration session.',
  ],
  [
    'state',
    setupState,
    readDirectConfigurationSessionState,
    'Reading direct configuration session state.',
  ],
])('dcc session %s', (_name, setup, operation, verbose) => {
  test.each([
    [[], undefined],
    [['--json'], true],
  ])('%j passes json %s and nothing else on', async (args, json) => {
    expect((await run(setup, args)).exitCode).toBe(0);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation.mock.calls[0]).toEqual([json]);
  });

  test('says what it does in the verbose output, as the removed command did', async () => {
    await run(setup, []);

    expect(verboseMessage).toHaveBeenCalledWith(verbose);
  });

  test('does not know --wait', async () => {
    const { error } = await run(setup, ['--wait']);

    expect(error?.code).toBe('commander.unknownOption');
    expect(operation).not.toHaveBeenCalled();
  });

  test('sets the exit code 1 when the operation fails', async () => {
    operation.mockResolvedValue(false);

    expect((await run(setup, [])).exitCode).toBe(1);
  });
});
