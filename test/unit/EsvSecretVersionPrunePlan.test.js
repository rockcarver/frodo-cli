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
  findVersionsToPruneOfAllSecrets,
  findVersionsToPruneOfSecret,
  formatVersionRanges,
  printPrunePlan,
  pruneVersionsOfPlan,
  summarizePrunePlan,
} from '../../src/ops/cloud/SecretsOps.ts';

/**
 * The operations behind `frodo esv secret version prune -a`: finding the plan
 * (all or nothing), showing it, and deleting exactly it. The command's use of
 * them is pinned in EsvSecretVersionPruneFlow.test.js. The library calls are
 * replaced on the facade, so no tenant is needed and the tests do not depend
 * on which library version is installed.
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
      expect(found).toEqual([
        { secretId: 'esv-a', versions: [version('1')] },
        { secretId: 'esv-b', versions: [version('2')] },
      ]);
      expect(secret.findVersionsToPrune.mock.calls).toEqual([
        ['esv-a', true, true],
        ['esv-b', true, true],
      ]);
      expect(secret.deleteVersionOfSecret).not.toHaveBeenCalled();
    });

    it('returns no plan when the secrets cannot be read', async () => {
      secret.readSecrets.mockRejectedValue(new Error('boom'));
      expect(await findVersionsToPruneOfAllSecrets()).toBeUndefined();
      expect(secret.findVersionsToPrune).not.toHaveBeenCalled();
    });

    it('returns no plan, never a partial one, when one secret cannot be checked', async () => {
      secret.readSecrets.mockResolvedValue([
        { _id: 'esv-a' },
        { _id: 'esv-b' },
      ]);
      secret.findVersionsToPrune.mockImplementation(async (id) => {
        if (id === 'esv-a') throw new Error('boom');
        return [version('1')];
      });
      expect(await findVersionsToPruneOfAllSecrets()).toBeUndefined();
      expect(printed()).toContain(
        'Nothing was deleted: the plan is incomplete.'
      );
      expect(secret.deleteVersionOfSecret).not.toHaveBeenCalled();
    });

    it('plans one secret', async () => {
      secret.findVersionsToPrune.mockResolvedValue([version('1')]);
      expect(await findVersionsToPruneOfSecret('esv-a', false, true)).toEqual([
        { secretId: 'esv-a', versions: [version('1')] },
      ]);
      expect(secret.findVersionsToPrune).toHaveBeenCalledWith(
        'esv-a',
        false,
        true
      );
    });

    it('returns no plan when the one secret cannot be checked', async () => {
      secret.findVersionsToPrune.mockRejectedValue(new Error('boom'));
      expect(await findVersionsToPruneOfSecret('esv-a')).toBeUndefined();
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

    it('deletes nothing of a secret it cannot re-check, and still processes the others', async () => {
      secret.findVersionsToPrune.mockImplementation(async (id) => {
        if (id === 'esv-a') throw new Error('boom');
        return [version('4')];
      });
      expect(await pruneVersionsOfPlan(plan)).toBe(false);
      expect(deleted()).toEqual(['esv-c:4']);
    });
  });
});
