import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `frodo esv secret version prune -a` deletes versions of every secret, so the
 * command shows the plan and asks first. What must hold, whatever the options:
 *
 * - nothing is deleted unless there is a `-y` or a person said yes;
 * - `--dry-run` never deletes, not even with `-y`;
 * - no terminal and no `-y` refuses before the tenant is touched;
 * - declining deletes nothing and is not an error;
 * - the versions deleted are exactly the plan that was shown;
 * - `-i` still prunes directly and never asks.
 *
 * The operations are mocked: this pins how the command wires them. The
 * operations themselves are tested in EsvSecretVersionPrunePlan.test.js.
 */

const getTokens = jest.fn();
const confirm = jest.fn();
const findVersionsToPruneOfAllSecrets = jest.fn();
const findVersionsToPruneOfSecret = jest.fn();
const printPrunePlan = jest.fn();
const pruneVersionsOfPlan = jest.fn();
const pruneVersionsOfSecret = jest.fn();
const printMessage = jest.fn();
const verboseMessage = jest.fn();
const resolveEntityPicks = jest.fn();

jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
    cloud: { secret: { readSecrets: jest.fn() } },
  },
  state: {},
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]').argument('[username]').argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf() {
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console.js', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));
jest.unstable_mockModule('../../src/utils/interactive/EntityPickers', () => ({
  deferEntityPicks: jest.fn(),
  entityPick: jest.fn(),
  resolveEntityPicks,
}));
jest.unstable_mockModule('../../src/ops/cloud/SecretsOps', () => ({
  findVersionsToPruneOfAllSecrets,
  findVersionsToPruneOfSecret,
  printPrunePlan,
  pruneVersionsOfPlan,
  pruneVersionsOfSecret,
  summarizePrunePlan: (plan) => ({
    secrets: plan.length,
    affected: plan.filter((p) => p.versions.length > 0).length,
    versions: plan.reduce((sum, p) => sum + p.versions.length, 0),
  }),
}));

const { default: setupPrune, pruneGate } =
  await import('../../src/cli/esv/esv-secret-version-prune');

const version = (v) => ({ version: v });
const plan = [
  { secretId: 'esv-a', versions: [version('1'), version('2')] },
  { secretId: 'esv-b', versions: [] },
  { secretId: 'esv-c', versions: [version('4')] },
];
const emptyPlan = [{ secretId: 'esv-a', versions: [] }];

function setTerminal(isTTY) {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: isTTY,
    configurable: true,
  });
}

async function invoke(options) {
  process.exitCode = 0;
  const program = setupPrune();
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  await program._actionHandler.call(program, [undefined, undefined, undefined]);
  const exitCode = process.exitCode;
  process.exitCode = 0;
  return exitCode;
}

const errors = () =>
  printMessage.mock.calls.filter(([, type]) => type === 'error');

describe('pruneGate', () => {
  it.each([
    [{ interactive: true }, 'ask'],
    [{ interactive: false }, 'refuse'],
    [{ yes: true, interactive: true }, 'proceed'],
    [{ yes: true, interactive: false }, 'proceed'],
    [{ dryRun: true, interactive: true }, 'dry-run'],
    [{ dryRun: true, interactive: false }, 'dry-run'],
    [{ dryRun: true, yes: true, interactive: true }, 'dry-run'],
    [{ dryRun: true, yes: true, interactive: false }, 'dry-run'],
  ])('%j -> %s', (options, expected) => {
    expect(pruneGate(options)).toBe(expected);
  });
});

describe('frodo esv secret version prune', () => {
  const realIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

  beforeEach(() => {
    jest.resetAllMocks();
    getTokens.mockResolvedValue(true);
    resolveEntityPicks.mockResolvedValue(true);
    findVersionsToPruneOfAllSecrets.mockResolvedValue(plan);
    findVersionsToPruneOfSecret.mockResolvedValue([plan[0]]);
    pruneVersionsOfPlan.mockResolvedValue(true);
    pruneVersionsOfSecret.mockResolvedValue(true);
    confirm.mockResolvedValue(true);
    setTerminal(true);
  });

  afterAll(() => {
    if (realIsTTY) Object.defineProperty(process.stdin, 'isTTY', realIsTTY);
    else delete process.stdin.isTTY;
  });

  describe('-a (all secrets)', () => {
    it('shows the plan, asks (default no) and deletes exactly that plan on yes', async () => {
      expect(await invoke({ all: true })).toBe(0);
      expect(printPrunePlan).toHaveBeenCalledWith(plan, undefined, undefined);
      expect(confirm).toHaveBeenCalledTimes(1);
      const [question] = confirm.mock.calls[0];
      expect(question.default).toBe(false);
      expect(question.message).toContain('3 versions');
      expect(question.message).toContain('2 secrets');
      expect(pruneVersionsOfPlan).toHaveBeenCalledWith(
        plan,
        undefined,
        undefined
      );
    });

    it('deletes nothing and succeeds when the answer is no', async () => {
      confirm.mockResolvedValue(false);
      expect(await invoke({ all: true })).toBe(0);
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
      expect(pruneVersionsOfSecret).not.toHaveBeenCalled();
    });

    it('does not ask with -y, and deletes the plan', async () => {
      setTerminal(false);
      expect(await invoke({ all: true, yes: true })).toBe(0);
      expect(confirm).not.toHaveBeenCalled();
      expect(pruneVersionsOfPlan).toHaveBeenCalledWith(
        plan,
        undefined,
        undefined
      );
    });

    it('refuses without -y or a terminal, before reading the tenant', async () => {
      setTerminal(false);
      expect(await invoke({ all: true })).toBe(1);
      expect(errors()).toHaveLength(1);
      expect(errors()[0][0]).toContain('-y/--yes');
      expect(errors()[0][0]).toContain('--dry-run');
      expect(getTokens).not.toHaveBeenCalled();
      expect(findVersionsToPruneOfAllSecrets).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
    });

    it.each([
      ['a terminal', true, {}],
      ['no terminal', false, {}],
      ['a terminal and -y', true, { yes: true }],
      ['no terminal and -y', false, { yes: true }],
    ])(
      '--dry-run shows the plan and never deletes (%s)',
      async (_, tty, extra) => {
        setTerminal(tty);
        expect(await invoke({ all: true, dryRun: true, ...extra })).toBe(0);
        expect(printPrunePlan).toHaveBeenCalledTimes(1);
        expect(confirm).not.toHaveBeenCalled();
        expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
        expect(pruneVersionsOfSecret).not.toHaveBeenCalled();
      }
    );

    it('neither asks nor deletes when there is nothing to prune', async () => {
      findVersionsToPruneOfAllSecrets.mockResolvedValue(emptyPlan);
      expect(await invoke({ all: true, yes: true })).toBe(0);
      expect(printPrunePlan).toHaveBeenCalledTimes(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
    });

    it('deletes nothing and fails when the plan could not be made', async () => {
      findVersionsToPruneOfAllSecrets.mockResolvedValue(undefined);
      expect(await invoke({ all: true, yes: true })).toBe(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
    });

    it('fails when a deletion fails', async () => {
      pruneVersionsOfPlan.mockResolvedValue(false);
      expect(await invoke({ all: true })).toBe(1);
    });

    it('does nothing when the login fails', async () => {
      getTokens.mockResolvedValue(false);
      expect(await invoke({ all: true, yes: true })).toBe(1);
      expect(findVersionsToPruneOfAllSecrets).not.toHaveBeenCalled();
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
    });

    it('passes --keep-loaded and --keep-deactivated to the plan, the display and the deletion', async () => {
      expect(
        await invoke({ all: true, keepLoaded: true, keepDeactivated: true })
      ).toBe(0);
      expect(findVersionsToPruneOfAllSecrets).toHaveBeenCalledWith(true, true);
      expect(printPrunePlan).toHaveBeenCalledWith(plan, true, true);
      expect(pruneVersionsOfPlan).toHaveBeenCalledWith(plan, true, true);
    });
  });

  describe('-i (one secret)', () => {
    it('prunes directly and never asks, even on a terminal', async () => {
      expect(await invoke({ secretId: 'esv-a' })).toBe(0);
      expect(pruneVersionsOfSecret).toHaveBeenCalledWith(
        'esv-a',
        undefined,
        undefined
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(findVersionsToPruneOfSecret).not.toHaveBeenCalled();
    });

    it('ignores -y (there is nothing to answer)', async () => {
      setTerminal(false);
      expect(await invoke({ secretId: 'esv-a', yes: true })).toBe(0);
      expect(pruneVersionsOfSecret).toHaveBeenCalledTimes(1);
    });

    it('fails when the prune fails', async () => {
      pruneVersionsOfSecret.mockResolvedValue(false);
      expect(await invoke({ secretId: 'esv-a' })).toBe(1);
    });

    it.each([true, false])(
      '--dry-run only shows the plan and never deletes (terminal: %s)',
      async (tty) => {
        setTerminal(tty);
        expect(await invoke({ secretId: 'esv-a', dryRun: true })).toBe(0);
        expect(findVersionsToPruneOfSecret).toHaveBeenCalledWith(
          'esv-a',
          undefined,
          undefined
        );
        expect(printPrunePlan).toHaveBeenCalledTimes(1);
        expect(pruneVersionsOfSecret).not.toHaveBeenCalled();
        expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
        expect(confirm).not.toHaveBeenCalled();
      }
    );
  });

  describe('no clear target', () => {
    it('prunes nothing when -i and -a both arrive', async () => {
      expect(await invoke({ secretId: 'esv-a', all: true, yes: true })).toBe(1);
      expect(getTokens).not.toHaveBeenCalled();
      expect(pruneVersionsOfSecret).not.toHaveBeenCalled();
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
    });

    it('prunes nothing when the pick is declined or fails', async () => {
      resolveEntityPicks.mockResolvedValue(false);
      expect(await invoke({ yes: true })).toBe(1);
      expect(getTokens).not.toHaveBeenCalled();
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
    });

    it('prunes nothing when no secret is selected', async () => {
      expect(await invoke({ yes: true })).toBe(1);
      expect(errors()).toHaveLength(1);
      expect(pruneVersionsOfPlan).not.toHaveBeenCalled();
    });
  });
});
