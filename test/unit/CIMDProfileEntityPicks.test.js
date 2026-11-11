import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

const { getEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');

/**
 * The entity pickers of the real `oauth cimd` commands (decision record 0038).
 * The group has an entry of its own in the registry and sits beside `oauth
 * client`, whose entry names another option (`appId`), so the tree has to be
 * checked as built: a command must get exactly one picker for -i, and none of
 * the other agent or oauth entries may add a second.
 */

const agentIdPicks = (leaf) =>
  getEntityPicks(leaf).filter((pick) => pick.name === 'agentId');
const hasAgentId = (leaf) =>
  leaf.options.some((option) => option.attributeName() === 'agentId');

let leaves = [];

beforeAll(async () => {
  leaves = (await loadLeafCommands()).filter((leaf) =>
    fullName(leaf).startsWith('frodo oauth cimd ')
  );
});

describe('the pickers of the oauth cimd commands', () => {
  it('gives these commands exactly one picker for -i, and no command any other pick', () => {
    const withPicker = leaves
      .filter((leaf) => agentIdPicks(leaf).length > 0)
      .map(fullName)
      .sort();
    expect(withPicker).toEqual([
      'frodo oauth cimd delete',
      'frodo oauth cimd describe',
      'frodo oauth cimd export',
    ]);
    for (const leaf of leaves) {
      expect(agentIdPicks(leaf).length).toBeLessThanOrEqual(1);
      expect(getEntityPicks(leaf).length).toBe(agentIdPicks(leaf).length);
    }
  });

  it('leaves import without a picker: -i names a profile in a file', () => {
    const without = leaves
      .filter((leaf) => hasAgentId(leaf) && agentIdPicks(leaf).length === 0)
      .map(fullName)
      .sort();
    expect(without).toEqual(['frodo oauth cimd import']);
  });

  it('lists the five verbs, and the group is not among the agent commands', async () => {
    expect(leaves.map(fullName).sort()).toEqual([
      'frodo oauth cimd delete',
      'frodo oauth cimd describe',
      'frodo oauth cimd export',
      'frodo oauth cimd import',
      'frodo oauth cimd list',
    ]);
    const agents = (await loadLeafCommands()).filter((leaf) =>
      fullName(leaf).startsWith('frodo agent ')
    );
    expect(
      agents.map(fullName).filter((name) => name.includes('cimd'))
    ).toEqual([]);
  });
});
