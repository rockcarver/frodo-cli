import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * The prune options of `promote`, parsed from a real command line. After a
 * journey is deleted `promote` prunes the orphaned nodes of the realm. The
 * option that asks first was spelled `--propmt-prune`, so the action never saw
 * `promptPrune`, and `--no-prune` is stored by commander as `prune` (true unless
 * the option is given), which the action did not read, so neither option had
 * any effect. The other command tests set the option values directly and so
 * cannot see this: these parse argv. What the ops function does with the two
 * flags is covered by PromoteFailures.test.js.
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
const PROMPT_PRUNE = 5;
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

  test('with neither option the prune runs without asking, as before', async () => {
    const args = await run();

    expect(args[PROMPT_PRUNE]).toBe(false);
    expect(args[NO_PRUNE]).toBe(false);
  });

  test('--no-prune stops the prune', async () => {
    const args = await run('--no-prune');

    expect(args[PROMPT_PRUNE]).toBe(false);
    expect(args[NO_PRUNE]).toBe(true);
  });

  test('--prompt-prune asks first', async () => {
    const args = await run('--prompt-prune');

    expect(args[PROMPT_PRUNE]).toBe(true);
    expect(args[NO_PRUNE]).toBe(false);
  });

  test('the old spelling --propmt-prune still asks first', async () => {
    const args = await run('--propmt-prune');

    expect(args[PROMPT_PRUNE]).toBe(true);
    expect(args[NO_PRUNE]).toBe(false);
  });

  test('both options together hand both flags on (no-prune wins in the ops function)', async () => {
    const args = await run('--prompt-prune', '--no-prune');

    expect(args[PROMPT_PRUNE]).toBe(true);
    expect(args[NO_PRUNE]).toBe(true);
  });

  describe('help', () => {
    const help = () => setupPromote().helpInformation();

    test('lists --prompt-prune and --no-prune but not the old spelling', () => {
      expect(help()).toContain('--prompt-prune');
      expect(help()).toContain('--no-prune');
      expect(help()).not.toContain('--propmt-prune');
    });

    test('says that the prune covers every orphaned node of the realm', () => {
      const text = help().replace(/\s+/g, ' ');

      expect(text).toContain(
        'every orphaned node of the realm, not only those of the deleted journey'
      );
      expect(text).toContain(
        'every orphaned node of the realm is pruned (permanently deleted) without asking'
      );
    });
  });
});
