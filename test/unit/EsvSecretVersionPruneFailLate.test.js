import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command } from 'commander';

/**
 * Decision record 0040 for `frodo esv secret version prune -a`: the command
 * checks every secret, prunes the secrets it could check, lists the ones it
 * could not, ends with ONE summary and exits 1 because of them (0 with
 * `--allow-failures`). The command and the operations are real here; only the
 * library calls on the facade, the login, the question and the terminal are
 * replaced, so the exit codes and what is deleted are the ones a user gets.
 * (The wiring alone is pinned in EsvSecretVersionPruneFlow.test.js, the
 * operations alone in EsvSecretVersionPrunePlan.test.js.)
 */

const getTokens = jest.fn();
const confirm = jest.fn();
const resolveEntityPicks = jest.fn();

jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));
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

    multiOp() {
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/interactive/EntityPickers', () => ({
  deferEntityPicks: jest.fn(),
  entityPick: jest.fn(),
  resolveEntityPicks,
}));

const { default: setupPrune } =
  await import('../../src/cli/esv/esv-secret-version-prune');

const ansi = /\u001b\[[0-9;]*m/g;
const version = (v) => ({ version: v });

/** esv-a cannot be checked; esv-b and esv-c have versions to prune; esv-d has none. */
const checkable = {
  'esv-b': ['1', '2'],
  'esv-c': ['4'],
  'esv-d': [],
};

describe('frodo esv secret version prune, a secret that cannot be checked', () => {
  const secret = frodo.cloud.secret;
  const original = {};
  const names = ['findVersionsToPrune', 'deleteVersionOfSecret', 'readSecrets'];
  const realIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let output;
  let unreadable;

  const setTerminal = (isTTY) =>
    Object.defineProperty(process.stdin, 'isTTY', {
      value: isTTY,
      configurable: true,
    });

  beforeEach(() => {
    for (const name of names) original[name] = secret[name];
    unreadable = ['esv-a'];
    secret.readSecrets = jest.fn(async () =>
      ['esv-a', ...Object.keys(checkable)].map((_id) => ({ _id }))
    );
    secret.findVersionsToPrune = jest.fn(async (id) => {
      if (unreadable.includes(id)) throw new Error(`cannot read ${id}`);
      return (checkable[id] ?? []).map(version);
    });
    secret.deleteVersionOfSecret = jest.fn(async () => ({}));
    getTokens.mockReset().mockResolvedValue(true);
    confirm.mockReset().mockResolvedValue(true);
    resolveEntityPicks.mockReset().mockResolvedValue(true);
    setTerminal(false);
    output = [];
    const capture = (...args) => {
      output.push(args.join(' ').replace(ansi, ''));
    };
    jest.spyOn(console, 'log').mockImplementation(capture);
    jest.spyOn(console, 'error').mockImplementation(capture);
    jest.spyOn(console, 'warn').mockImplementation(capture);
    jest.spyOn(console, 'info').mockImplementation(capture);
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    for (const name of names) secret[name] = original[name];
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (realIsTTY) Object.defineProperty(process.stdin, 'isTTY', realIsTTY);
    else delete process.stdin.isTTY;
  });

  async function invoke(options) {
    process.exitCode = 0;
    const program = setupPrune();
    for (const [key, value] of Object.entries(options)) {
      program.setOptionValue(key, value);
    }
    await program._actionHandler.call(program, [
      undefined,
      undefined,
      undefined,
    ]);
    const exitCode = process.exitCode;
    process.exitCode = 0;
    return exitCode;
  }

  const printed = () => output.join('\n');
  const deleted = () =>
    secret.deleteVersionOfSecret.mock.calls.map(([id, v]) => `${id}:${v}`);
  const summaries = () => (printed().match(/failed:/g) ?? []).length;
  /** The lines of the summary: one per failed operation. */
  const failureLines = () =>
    printed()
      .split('\n')
      .filter((line) => /^ {2}- (check of secret|version) /.test(line));

  describe('--yes', () => {
    it('prunes the secrets it could check, names the one it could not in one summary, and exits 1', async () => {
      expect(await invoke({ all: true, yes: true })).toBe(1);
      expect(deleted()).toEqual(['esv-b:1', 'esv-b:2', 'esv-c:4']);
      expect(summaries()).toBe(1);
      expect(printed()).toContain('1 of 7 operations failed:');
      expect(printed()).toContain('- check of secret esv-a: cannot read esv-a');
      // nothing else is named as failed
      expect(failureLines()).toEqual([
        '  - check of secret esv-a: cannot read esv-a',
      ]);
      expect(printed()).not.toContain('plan is incomplete');
    });

    it('shows the secret as not checked in the plan', async () => {
      await invoke({ all: true, yes: true });
      expect(printed()).toContain(
        'Selected for deletion: 3 versions in 2 of 3 secrets.'
      );
      expect(printed()).toContain(
        'Not checked, so nothing is selected for 1 secret:'
      );
      expect(printed()).toContain('  - esv-a: cannot read esv-a');
    });

    it('with --allow-failures prunes the same, prints the same summary and exits 0', async () => {
      expect(await invoke({ all: true, yes: true, allowFailures: true })).toBe(
        0
      );
      expect(deleted()).toEqual(['esv-b:1', 'esv-b:2', 'esv-c:4']);
      expect(summaries()).toBe(1);
      expect(printed()).toContain('- check of secret esv-a: cannot read esv-a');
      expect(printed()).toContain('The exit code stays 0');
    });

    it('puts a failed deletion after the gap into the same summary', async () => {
      secret.deleteVersionOfSecret.mockImplementation(async (id, v) => {
        if (id === 'esv-b' && v === '2') throw new Error('boom');
        return {};
      });
      expect(await invoke({ all: true, yes: true })).toBe(1);
      expect(deleted()).toEqual(['esv-b:1', 'esv-b:2', 'esv-c:4']);
      expect(summaries()).toBe(1);
      expect(printed()).toContain('2 of 7 operations failed:');
      expect(printed()).toContain('- check of secret esv-a: cannot read esv-a');
      expect(printed()).toContain('- version 2 of secret esv-b: boom');
    });

    it('still re-checks every version just before it deletes it', async () => {
      const seen = new Set();
      secret.findVersionsToPrune.mockImplementation(async (id) => {
        if (unreadable.includes(id)) throw new Error(`cannot read ${id}`);
        // after the plan was made, version 2 of esv-b became active
        const again = seen.has(id);
        seen.add(id);
        if (id === 'esv-b') return (again ? ['1'] : ['1', '2']).map(version);
        return (checkable[id] ?? []).map(version);
      });
      expect(await invoke({ all: true, yes: true })).toBe(1);
      expect(deleted()).toEqual(['esv-b:1', 'esv-c:4']);
      expect(printed()).toContain('Skipped 1 version that changed');
    });
  });

  describe('--dry-run', () => {
    it('deletes nothing and exits 1', async () => {
      expect(await invoke({ all: true, dryRun: true })).toBe(1);
      expect(deleted()).toEqual([]);
      expect(printed()).toContain('Dry run: nothing was deleted.');
      expect(summaries()).toBe(1);
      expect(printed()).toContain('- check of secret esv-a: cannot read esv-a');
    });

    it('with --allow-failures exits 0 and still prints the summary', async () => {
      expect(
        await invoke({ all: true, dryRun: true, allowFailures: true })
      ).toBe(0);
      expect(deleted()).toEqual([]);
      expect(printed()).toContain('The exit code stays 0');
    });

    it('never deletes, not even with --yes', async () => {
      expect(await invoke({ all: true, dryRun: true, yes: true })).toBe(1);
      expect(deleted()).toEqual([]);
    });
  });

  describe('on a terminal', () => {
    beforeEach(() => setTerminal(true));

    it('names the gap in the question, which defaults to no', async () => {
      await invoke({ all: true });
      expect(confirm).toHaveBeenCalledTimes(1);
      const [question] = confirm.mock.calls[0];
      expect(question.default).toBe(false);
      expect(question.message).toContain(
        'Could not check 1 secret (listed above).'
      );
      expect(question.message).toContain(
        'the 3 versions found in the other 3 secrets'
      );
    });

    it('deletes nothing when the answer is no; declining is not a failure but the secret that could not be checked is', async () => {
      confirm.mockResolvedValue(false);
      expect(await invoke({ all: true })).toBe(1);
      expect(deleted()).toEqual([]);
      expect(printed()).toContain('Nothing was deleted.');
      expect(summaries()).toBe(1);
      expect(printed()).toContain('1 of 4 operations failed:');
    });

    it('declining exits 0 when nothing could fail', async () => {
      unreadable = [];
      confirm.mockResolvedValue(false);
      expect(await invoke({ all: true })).toBe(0);
      expect(deleted()).toEqual([]);
      expect(summaries()).toBe(0);
    });

    it('prunes the checked secrets when the answer is yes, and exits 1 for the other', async () => {
      expect(await invoke({ all: true })).toBe(1);
      expect(deleted()).toEqual(['esv-b:1', 'esv-b:2', 'esv-c:4']);
      expect(summaries()).toBe(1);
    });

    it('does not ask when nothing is left to delete in the checked secrets, and exits 1', async () => {
      secret.readSecrets.mockResolvedValue([
        { _id: 'esv-a' },
        { _id: 'esv-d' },
      ]);
      expect(await invoke({ all: true })).toBe(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(deleted()).toEqual([]);
      expect(printed()).toContain('Nothing to prune: 1 secret checked');
      expect(printed()).toContain('- check of secret esv-a: cannot read esv-a');
    });
  });

  describe('every secret unchecked', () => {
    it('deletes nothing, does not ask and exits 1', async () => {
      unreadable = ['esv-a', ...Object.keys(checkable)];
      setTerminal(true);
      expect(await invoke({ all: true })).toBe(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(deleted()).toEqual([]);
      expect(printed()).toContain(
        'Nothing to prune: 4 secrets could not be checked.'
      );
      expect(printed()).toContain('4 of 4 operations failed:');
    });
  });

  describe('the secrets cannot be listed', () => {
    it('exits 1 without a plan, as before', async () => {
      secret.readSecrets.mockRejectedValue(new Error('boom'));
      expect(await invoke({ all: true, yes: true })).toBe(1);
      expect(secret.findVersionsToPrune).not.toHaveBeenCalled();
      expect(deleted()).toEqual([]);
    });
  });

  describe('-i', () => {
    it('--dry-run on a secret that cannot be checked exits 1 with one summary', async () => {
      expect(await invoke({ secretId: 'esv-a', dryRun: true })).toBe(1);
      expect(printed()).toContain(
        'Nothing to prune: 1 secret could not be checked.'
      );
      expect(printed()).toContain('1 of 1 operation failed:');
      expect(summaries()).toBe(1);
    });

    it('--dry-run on a secret that cannot be checked exits 0 with --allow-failures', async () => {
      expect(
        await invoke({ secretId: 'esv-a', dryRun: true, allowFailures: true })
      ).toBe(0);
      expect(printed()).toContain('The exit code stays 0');
    });
  });

  describe('when every secret can be checked', () => {
    beforeEach(() => {
      unreadable = [];
    });

    it('prunes them all, prints no summary and exits 0', async () => {
      expect(await invoke({ all: true, yes: true })).toBe(0);
      expect(deleted()).toEqual(['esv-b:1', 'esv-b:2', 'esv-c:4']);
      expect(summaries()).toBe(0);
      expect(printed()).not.toContain('Not checked');
    });

    it('asks the question without a gap in it', async () => {
      setTerminal(true);
      await invoke({ all: true });
      expect(confirm.mock.calls[0][0].message).toBe(
        '\nPermanently delete 3 versions from 2 secrets?'
      );
    });
  });

  it('refuses before it reads the tenant when there is no terminal and no --yes', async () => {
    expect(await invoke({ all: true })).toBe(1);
    expect(getTokens).not.toHaveBeenCalled();
    expect(secret.readSecrets).not.toHaveBeenCalled();
    expect(printed()).toContain('-y/--yes');
  });
});
