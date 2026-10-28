import { describe, expect, it } from '@jest/globals';
import { pruneTarget } from '../../src/cli/esv/esv-secret-version-prune.ts';

/**
 * `frodo esv secret version prune` deletes data, and `--all` reaches every
 * secret of the tenant. The command decides what to act on only through
 * pruneTarget, so everything that must never lead to "all" is pinned here:
 * a declined, failed or empty pick (no option set), and a prompted or saved
 * secret id arriving beside `--all` (commander rejects the combination on the
 * command line, but the interactive resolver can fill options in afterwards).
 * An earlier command (`esv secret delete`) once ran delete-all on a live
 * tenant after a failed picker read, which is why this is a unit test.
 */
describe('pruneTarget', () => {
  it('prunes one secret when only a secret id is given', () => {
    expect(pruneTarget({ secretId: 'esv-a' })).toEqual({
      kind: 'secret',
      secretId: 'esv-a',
    });
  });

  it('prunes all secrets only when --all is given on its own', () => {
    expect(pruneTarget({ all: true })).toEqual({ kind: 'all' });
  });

  it('prunes nothing when neither option is set (declined, failed or empty pick)', () => {
    expect(pruneTarget({})).toEqual({
      kind: 'none',
      reason: 'nothing-selected',
    });
    expect(pruneTarget({ secretId: undefined, all: undefined })).toEqual({
      kind: 'none',
      reason: 'nothing-selected',
    });
  });

  it('treats an empty secret id and a false --all as not given', () => {
    expect(pruneTarget({ secretId: '', all: false })).toEqual({
      kind: 'none',
      reason: 'nothing-selected',
    });
    expect(pruneTarget({ secretId: 'esv-a', all: false })).toEqual({
      kind: 'secret',
      secretId: 'esv-a',
    });
  });

  it('refuses, and does not let --all win, when both are given', () => {
    expect(pruneTarget({ secretId: 'esv-a', all: true })).toEqual({
      kind: 'none',
      reason: 'ambiguous',
    });
  });
});
