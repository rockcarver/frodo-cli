import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import {
  createPruneRun,
  findVersionsToPruneOfAllSecrets,
  findVersionsToPruneOfSecret,
  finishPrune,
  formatVersionRanges,
  printPrunePlan,
  pruneVersionsOfPlan,
  summarizePrunePlan,
} from '../../src/ops/cloud/SecretsOps.ts';

/**
 * The operations behind `frodo esv secret version prune -a`: finding the plan
 * (every secret is checked; one that cannot be checked is listed and does not
 * stop the others), showing it, and deleting exactly it, with one summary for
 * the checks and the deletions together. The command's use of them is pinned
 * in EsvSecretVersionPruneFlow.test.js and EsvSecretVersionPruneFailLate.test.js.
 * The library calls are replaced on the facade, so no tenant is needed and the
 * tests do not depend on which library version is installed.
 */

const ansi = /\u001b\[[0-9;]*m/g;
const version = (v) => ({ version: v });
const plan = [
  { secretId: 'esv-a', versions: [version('1'), version('2'), version('3')] },
  { secretId: 'esv-b', versions: [] },
  { secretId: 'esv-c', versions: [version('4')] },
];

describe('esv secret version prune plan', () => {
  const secret = frodo.cloud.secret;
  const original = {};
  const names = ['findVersionsToPrune', 'deleteVersionOfSecret', 'readSecrets'];
  let output;

  beforeEach(() => {
    for (const name of names) original[name] = secret[name];
    secret.findVersionsToPrune = jest.fn();
    secret.deleteVersionOfSecret = jest.fn(async () => ({}));
    secret.readSecrets = jest.fn();
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

  const printed = () => output.join('\n');
  const deleted = () =>
    secret.deleteVersionOfSecret.mock.calls.map(([id, v]) => `${id}:${v}`);

  describe('formatVersionRanges', () => {
    it.each([
      [['1', '2', '3', '5'], '1-3, 5'],
      [['5', '1', '3', '2'], '1-3, 5'],
      [['10', '9', '11'], '9-11'],
      [['4'], '4'],
      [['1', '2'], '1-2'],
      [['1', '3', '5'], '1, 3, 5'],
      [[], ''],
    ])('%j -> "%s"', (versions, expected) => {
      expect(formatVersionRanges(versions)).toBe(expected);
    });

    it('lists versions it cannot read as numbers as they are', () => {
      expect(formatVersionRanges(['b', 'a'])).toBe('b, a');
    });
  });

  describe('summarizePrunePlan', () => {
    it('counts secrets, affected secrets and versions', () => {
      expect(summarizePrunePlan(plan)).toEqual({
        secrets: 3,
        affected: 2,
        versions: 4,
      });
      expect(summarizePrunePlan([])).toEqual({
        secrets: 0,
        affected: 0,
        versions: 0,
      });
    });
  });

  describe('printPrunePlan', () => {
    it('lists the affected secrets with their versions and the totals', () => {
      printPrunePlan(plan);
      const text = printed();
      expect(text).toMatch(/esv-a\s*│\s*3│1-3/);
      expect(text).toMatch(/esv-c\s*│\s*1│4/);
      expect(text).not.toContain('esv-b');
      expect(text).toContain(
        'Selected for deletion: 4 versions in 2 of 3 secrets.'
      );
      expect(text).toContain('Always kept: the active version of each secret.');
      expect(text).toContain('cannot be recovered');
    });

    it('says which versions are also kept', () => {
      printPrunePlan(plan, true, true);
      expect(printed()).toContain(
        'Always kept: the active version of each secret, the loaded versions, the deactivated versions.'
      );
    });

    it('uses the singular for one version in one secret', () => {
      printPrunePlan([{ secretId: 'esv-a', versions: [version('2')] }]);
      expect(printed()).toContain(
        'Selected for deletion: 1 version in 1 of 1 secret.'
      );
    });

    it('says there is nothing to prune when no secret has a version to delete', () => {
      printPrunePlan([{ secretId: 'esv-a', versions: [] }]);
      expect(printed()).toContain('Nothing to prune');
      expect(printed()).not.toContain('Selected for deletion');
    });

    it('lists the secrets that could not be checked, with the reason, beside the plan', () => {
      printPrunePlan(plan, false, false, [
        { secretId: 'esv-d', reason: 'forbidden' },
        { secretId: 'esv-e' },
      ]);
      const text = printed();
      expect(text).toContain(
        'Selected for deletion: 4 versions in 2 of 3 secrets.'
      );
      expect(text).toContain(
        'Not checked, so nothing is selected for 2 secrets:'
      );
      expect(text).toContain('  - esv-d: forbidden');
      expect(text).toContain('  - esv-e');
      expect(text).not.toContain('esv-e:');
    });

    it('lists the secrets that could not be checked when nothing else is left to prune', () => {
      printPrunePlan([{ secretId: 'esv-a', versions: [] }], false, false, [
        { secretId: 'esv-d', reason: 'forbidden' },
      ]);
      expect(printed()).toContain('Nothing to prune: 1 secret checked');
      expect(printed()).toContain(
        'Not checked, so nothing is selected for 1 secret:'
      );
      expect(printed()).toContain('  - esv-d: forbidden');
    });

    it('says that no secret could be checked when none could', () => {
      printPrunePlan([], false, false, [
        { secretId: 'esv-a' },
        { secretId: 'esv-b' },
      ]);
      expect(printed()).toContain(
        'Nothing to prune: 2 secrets could not be checked.'
      );
    });

    it('prints no list of unchecked secrets when every secret was checked', () => {
      printPrunePlan(plan);
      expect(printed()).not.toContain('Not checked');
    });
  });

  describe('finding the plan', () => {
    it('plans every secret, in id order, with the keep options', async () => {
      secret.readSecrets.mockResolvedValue([
        { _id: 'esv-b' },
        { _id: 'esv-a' },
      ]);
      secret.findVersionsToPrune.mockImplementation(async (id) => [
        version(id === 'esv-a' ? '1' : '2'),
      ]);
      const found = await findVersionsToPruneOfAllSecrets(true, true);
      expect(found.plan).toEqual([
        { secretId: 'esv-a', versions: [version('1')] },
        { secretId: 'esv-b', versions: [version('2')] },
      ]);
      expect(found.notChecked).toEqual([]);
      expect(secret.findVersionsToPrune.mock.calls).toEqual([
        ['esv-a', true, true],
        ['esv-b', true, true],
      ]);
      expect(secret.deleteVersionOfSecret).not.toHaveBeenCalled();
    });

    it('returns no check when the secrets cannot be read', async () => {
      secret.readSecrets.mockRejectedValue(new Error('boom'));
      expect(await findVersionsToPruneOfAllSecrets()).toBeUndefined();
      expect(secret.findVersionsToPrune).not.toHaveBeenCalled();
    });

    it('keeps the plan of the secrets it could check when one cannot be checked', async () => {
      secret.readSecrets.mockResolvedValue([
        { _id: 'esv-a' },
        { _id: 'esv-b' },
      ]);
      secret.findVersionsToPrune.mockImplementation(async (id) => {
        if (id === 'esv-a') throw new Error('boom');
        return [version('1')];
      });
      const found = await findVersionsToPruneOfAllSecrets();
      expect(found.plan).toEqual([
        { secretId: 'esv-b', versions: [version('1')] },
      ]);
      expect(found.notChecked).toEqual([{ secretId: 'esv-a', reason: 'boom' }]);
      expect(printed()).not.toContain('plan is incomplete');
      expect(secret.deleteVersionOfSecret).not.toHaveBeenCalled();
    });

    it('checks every secret and names the ones it could not check in the one summary of the run', async () => {
      secret.readSecrets.mockResolvedValue([
        { _id: 'esv-a' },
        { _id: 'esv-b' },
        { _id: 'esv-c' },
      ]);
      secret.findVersionsToPrune.mockImplementation(async (id) => {
        if (id !== 'esv-b') throw new Error(`cannot read ${id}`);
        return [version('1')];
      });
      const found = await findVersionsToPruneOfAllSecrets();
      expect(secret.findVersionsToPrune).toHaveBeenCalledTimes(3);
      expect(found.notChecked.map((n) => n.secretId)).toEqual([
        'esv-a',
        'esv-c',
      ]);
      // the summary is the end of the whole command, not of the check
      expect(printed()).not.toContain('failed:');
      expect(finishPrune(found)).toBe(false);
      expect(printed()).toContain('2 of 3 operations failed:');
      expect(printed()).toContain('- check of secret esv-a: cannot read esv-a');
      expect(printed()).toContain('- check of secret esv-c: cannot read esv-c');
      expect(printed()).not.toContain('esv-b: ');
    });

    it('lets --allow-failures turn the secrets that could not be checked into a warning', async () => {
      secret.readSecrets.mockResolvedValue([{ _id: 'esv-a' }]);
      secret.findVersionsToPrune.mockRejectedValue(new Error('boom'));
      const found = await findVersionsToPruneOfAllSecrets(false, false, true);
      expect(finishPrune(found)).toBe(true);
      expect(printed()).toContain('1 of 1 operation failed:');
      expect(printed()).toContain('The exit code stays 0');
    });

    it('prints no summary when every secret was checked', async () => {
      secret.readSecrets.mockResolvedValue([{ _id: 'esv-a' }]);
      secret.findVersionsToPrune.mockResolvedValue([version('1')]);
      const found = await findVersionsToPruneOfAllSecrets();
      expect(found.plan).toHaveLength(1);
      expect(finishPrune(found)).toBe(true);
      expect(printed()).not.toContain('failed');
    });

    it('plans one secret', async () => {
      secret.findVersionsToPrune.mockResolvedValue([version('1')]);
      const found = await findVersionsToPruneOfSecret('esv-a', false, true);
      expect(found.plan).toEqual([
        { secretId: 'esv-a', versions: [version('1')] },
      ]);
      expect(found.notChecked).toEqual([]);
      expect(secret.findVersionsToPrune).toHaveBeenCalledWith(
        'esv-a',
        false,
        true
      );
    });

    it('lists the one secret as not checked when it cannot be checked, and fails', async () => {
      secret.findVersionsToPrune.mockRejectedValue(new Error('boom'));
      const found = await findVersionsToPruneOfSecret('esv-a');
      expect(found.plan).toEqual([]);
      expect(found.notChecked).toEqual([{ secretId: 'esv-a', reason: 'boom' }]);
      expect(finishPrune(found)).toBe(false);
      expect(printed()).toContain('1 of 1 operation failed:');
    });
  });

  describe('pruneVersionsOfPlan', () => {
    const stillEligible = (byId) => async (id) => (byId[id] ?? []).map(version);

    it('deletes exactly the planned versions', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '2', '3'], 'esv-c': ['4'] })
      );
      expect(await pruneVersionsOfPlan(plan)).toBe(true);
      expect(deleted()).toEqual(['esv-a:1', 'esv-a:2', 'esv-a:3', 'esv-c:4']);
    });

    it('does not touch a secret that has nothing to delete', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '2', '3'], 'esv-c': ['4'] })
      );
      await pruneVersionsOfPlan(plan);
      expect(secret.findVersionsToPrune.mock.calls.map(([id]) => id)).toEqual([
        'esv-a',
        'esv-c',
      ]);
    });

    it('re-checks with the same keep options', async () => {
      secret.findVersionsToPrune.mockImplementation(stillEligible({}));
      await pruneVersionsOfPlan(plan, true, true);
      expect(secret.findVersionsToPrune).toHaveBeenCalledWith(
        'esv-a',
        true,
        true
      );
    });

    it('skips a planned version that is no longer eligible, for example one that became active', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '3'], 'esv-c': ['4'] })
      );
      expect(await pruneVersionsOfPlan(plan)).toBe(true);
      expect(deleted()).toEqual(['esv-a:1', 'esv-a:3', 'esv-c:4']);
      expect(printed()).toContain('Skipped 1 version that changed');
    });

    it('never deletes a version that is eligible now but was not in the plan', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '2', '3', '9'], 'esv-c': ['4', '5'] })
      );
      await pruneVersionsOfPlan(plan);
      expect(deleted()).toEqual(['esv-a:1', 'esv-a:2', 'esv-a:3', 'esv-c:4']);
    });

    it('carries on after a failed deletion and reports failure', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '2', '3'], 'esv-c': ['4'] })
      );
      secret.deleteVersionOfSecret.mockImplementation(async (id, v) => {
        if (id === 'esv-a' && v === '1') throw new Error('boom');
        return {};
      });
      expect(await pruneVersionsOfPlan(plan)).toBe(false);
      expect(deleted()).toEqual(['esv-a:1', 'esv-a:2', 'esv-a:3', 'esv-c:4']);
    });

    it('names the versions that could not be deleted in one summary', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '2', '3'], 'esv-c': ['4'] })
      );
      secret.deleteVersionOfSecret.mockImplementation(async (id, v) => {
        if (id === 'esv-a' && v === '1') throw new Error('boom');
        if (id === 'esv-c') throw new Error('bang');
        return {};
      });
      expect(await pruneVersionsOfPlan(plan)).toBe(false);
      expect(printed()).toContain('2 of 4 operations failed:');
      expect(printed()).toContain('- version 1 of secret esv-a: boom');
      expect(printed()).toContain('- version 4 of secret esv-c: bang');
      expect(printed()).not.toContain('- version 2 of secret esv-a');
      expect(printed()).not.toContain('exit code stays 0');
    });

    it('--allow-failures reports the versions that failed but succeeds', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '2', '3'], 'esv-c': ['4'] })
      );
      secret.deleteVersionOfSecret.mockImplementation(async (id, v) => {
        if (id === 'esv-a' && v === '1') throw new Error('boom');
        return {};
      });
      expect(
        await pruneVersionsOfPlan(plan, false, false, createPruneRun(true))
      ).toBe(true);
      expect(deleted()).toEqual(['esv-a:1', 'esv-a:2', 'esv-a:3', 'esv-c:4']);
      expect(printed()).toContain('1 of 4 operations failed:');
      expect(printed()).toContain('The exit code stays 0');
    });

    it('prints no summary when every version was deleted', async () => {
      secret.findVersionsToPrune.mockImplementation(
        stillEligible({ 'esv-a': ['1', '2', '3'], 'esv-c': ['4'] })
      );
      expect(await pruneVersionsOfPlan(plan)).toBe(true);
      expect(printed()).not.toContain('failed:');
    });

    it('counts the versions of a secret it cannot re-check as failed', async () => {
      secret.findVersionsToPrune.mockImplementation(async (id) => {
        if (id === 'esv-a') throw new Error('cannot read esv-a');
        return [version('4')];
      });
      expect(await pruneVersionsOfPlan(plan)).toBe(false);
      expect(printed()).toContain('3 of 4 operations failed:');
      expect(printed()).toContain(
        '- version 2 of secret esv-a: cannot read esv-a'
      );
    });

    it('deletes nothing of a secret it cannot re-check, and still processes the others', async () => {
      secret.findVersionsToPrune.mockImplementation(async (id) => {
        if (id === 'esv-a') throw new Error('boom');
        return [version('4')];
      });
      expect(await pruneVersionsOfPlan(plan)).toBe(false);
      expect(deleted()).toEqual(['esv-c:4']);
    });

    describe('with a secret that could not be checked', () => {
      const checkWithGap = async (allowFailures = false) => {
        secret.readSecrets.mockResolvedValue([
          { _id: 'esv-a' },
          { _id: 'esv-b' },
          { _id: 'esv-c' },
        ]);
        secret.findVersionsToPrune.mockImplementation(async (id) => {
          if (id === 'esv-a') throw new Error('cannot read esv-a');
          return id === 'esv-b' ? [version('1'), version('2')] : [];
        });
        return findVersionsToPruneOfAllSecrets(false, false, allowFailures);
      };

      it('deletes the versions of the checked secrets and still fails, with the one summary', async () => {
        const check = await checkWithGap();
        expect(
          await pruneVersionsOfPlan(check.plan, false, false, check.run)
        ).toBe(false);
        expect(deleted()).toEqual(['esv-b:1', 'esv-b:2']);
        expect(printed().match(/failed:/g)).toHaveLength(1);
        expect(printed()).toContain('1 of 5 operations failed:');
        expect(printed()).toContain(
          '- check of secret esv-a: cannot read esv-a'
        );
      });

      it('puts a failed check and a failed deletion in the same summary', async () => {
        const check = await checkWithGap();
        secret.deleteVersionOfSecret.mockImplementation(async (id, v) => {
          if (v === '2') throw new Error('boom');
          return {};
        });
        expect(
          await pruneVersionsOfPlan(check.plan, false, false, check.run)
        ).toBe(false);
        expect(printed().match(/failed:/g)).toHaveLength(1);
        expect(printed()).toContain('2 of 5 operations failed:');
        expect(printed()).toContain(
          '- check of secret esv-a: cannot read esv-a'
        );
        expect(printed()).toContain('- version 2 of secret esv-b: boom');
      });

      it('succeeds with --allow-failures and still prints the summary', async () => {
        const check = await checkWithGap(true);
        expect(
          await pruneVersionsOfPlan(check.plan, false, false, check.run)
        ).toBe(true);
        expect(deleted()).toEqual(['esv-b:1', 'esv-b:2']);
        expect(printed()).toContain('1 of 5 operations failed:');
        expect(printed()).toContain('The exit code stays 0');
      });
    });
  });
});
