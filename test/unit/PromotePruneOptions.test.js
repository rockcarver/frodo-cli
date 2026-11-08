import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The prune options of `promote`, parsed from a real command line. After a
 * journey is deleted `promote` prunes the orphaned nodes of the realm, and
 * that deletes more than the one journey it names, so it asks first (cli record
 * 0037): `-y, --yes` prunes without asking, `--no-prune` skips the prune, a
 * terminal is asked otherwise and without one the prune is refused. The option
 * that asks first was spelled `--propmt-prune`, so the action never saw
 * `promptPrune`, and `--no-prune` is stored by commander as `prune` (true unless
 * the option is given), which the action did not read, so neither option had
 * any effect. The other command tests set the option values directly and so
 * cannot see this: these parse argv. What the ops function does with the flags
 * is covered by PromoteFailures.test.js.
 */

const getTokens = jest.fn();
const compareExportToDirectory = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
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
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    multiOp() {
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/ops/PromoteOps', () => ({
  compareExportToDirectory,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Console.js', () => ({
  printMessage: jest.fn(),
  verboseMessage: jest.fn(),
}));

const { default: setupPromote } = await import('../../src/cli/promote/promote');

// positions of the two flags in the arguments of compareExportToDirectory
const YES = 5;
const NO_PRUNE = 6;

/** Parses a real command line and returns the arguments the ops function got. */
async function run(...argv) {
  const program = setupPromote();
  program.exitOverride();
  await program.parseAsync(['-M', 'master', '-e', 'current', ...argv], {
    from: 'user',
  });
  expect(compareExportToDirectory.mock.calls).toHaveLength(1);
  return compareExportToDirectory.mock.calls[0];
}

describe('promote prune options', () => {
  let exitCodeBefore;

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    getTokens.mockResolvedValue(true);
    compareExportToDirectory.mockResolvedValue(true);
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('with neither option nothing is passed on: the ops function asks, or refuses without a terminal', async () => {
    const args = await run();

    expect(args[YES]).toBe(false);
    expect(args[NO_PRUNE]).toBe(false);
  });

  test('--no-prune stops the prune', async () => {
    const args = await run('--no-prune');

    expect(args[YES]).toBe(false);
    expect(args[NO_PRUNE]).toBe(true);
  });

  test.each(['--yes', '-y'])('%s prunes without asking', async (flag) => {
    const args = await run(flag);

    expect(args[YES]).toBe(true);
    expect(args[NO_PRUNE]).toBe(false);
  });

  test.each(['--prompt-prune', '--propmt-prune'])(
    '%s is accepted and passes nothing on: asking is what happens on a terminal anyway',
    async (flag) => {
      const args = await run(flag);

      expect(args[YES]).toBe(false);
      expect(args[NO_PRUNE]).toBe(false);
    }
  );

  test('--prompt-prune with --no-prune hands --no-prune on (the prune is skipped without a question)', async () => {
    const args = await run('--prompt-prune', '--no-prune');

    expect(args[YES]).toBe(false);
    expect(args[NO_PRUNE]).toBe(true);
  });

  test.each([
    [['--yes', '--no-prune'], '--no-prune'],
    [['--no-prune', '-y'], '--no-prune'],
    [['--yes', '--prompt-prune'], '--prompt-prune'],
    [['--propmt-prune', '--yes'], '--propmt-prune'],
  ])(
    '%j is a conflict, found while the command line is parsed',
    async (argv, other) => {
      await expect(run(...argv)).rejects.toThrow(
        new RegExp(`cannot be used with option '(-y, --yes|${other})'`)
      );
      expect(compareExportToDirectory).not.toHaveBeenCalled();
    }
  );

  describe('help', () => {
    const help = () => setupPromote().helpInformation();

    test('lists --prompt-prune, --no-prune and -y, --yes but not the old spelling', () => {
      expect(help()).toContain('--prompt-prune');
      expect(help()).toContain('--no-prune');
      expect(help()).toContain('-y, --yes');
      expect(help()).not.toContain('--propmt-prune');
    });

    test('says that the prune covers every orphaned node of the realm', () => {
      const text = help().replace(/\s+/g, ' ');

      expect(text).toContain(
        'every orphaned node of the realm, not only those of the deleted journey'
      );
    });

    test('says what happens without an option: it asks on a terminal and refuses without one', () => {
      const text = help().replace(/\s+/g, ' ');

      expect(text).toContain(
        'the prune asks on a terminal and is refused when there is no terminal'
      );
      expect(text).toContain(
        'Required for the prune when there is no terminal'
      );
    });

    test('has an example of the prune that carries --yes, so that no example opens a prompt', () => {
      const program = setupPromote();
      let out = '';
      program.configureOutput({
        writeOut: (text) => {
          out += text;
        },
      });
      program.outputHelp();

      expect(out).toContain('frodo promote --yes -M ./master -e ./export');
    });
  });
});
