import fs from 'fs';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

const { getEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');
const { oneOfMemberAnswering } =
  await import('../../src/utils/interactive/OptionRequirements.ts');

/**
 * The entity pickers of the real agent commands (decision record 0038,
 * frodo-cli#1081). The agent groups have one registry entry each, and the
 * generic group's entry leaves the typed groups out, so the tree has to be
 * checked as built: a command must get exactly one picker for -i, from the
 * group of its own type, and a command added to a group without one of the
 * entry's `except` entries would inherit two.
 */

const agentIdPicks = (leaf) =>
  getEntityPicks(leaf).filter((pick) => pick.name === 'agentId');
const hasAgentId = (leaf) =>
  leaf.options.some((option) => option.attributeName() === 'agentId');

let leaves = [];

beforeAll(async () => {
  leaves = (await loadLeafCommands()).filter((leaf) =>
    fullName(leaf).startsWith('frodo agent ')
  );
});

describe('the pickers of the agent commands', () => {
  it('gives these commands exactly one picker for -i', () => {
    const withPicker = leaves
      .filter((leaf) => agentIdPicks(leaf).length > 0)
      .map(fullName)
      .sort();
    expect(withPicker).toEqual([
      'frodo agent ai delete',
      'frodo agent ai export',
      'frodo agent cimd describe',
      'frodo agent delete',
      'frodo agent export',
      'frodo agent gateway delete',
      'frodo agent gateway export',
      'frodo agent java delete',
      'frodo agent java export',
      'frodo agent web delete',
      'frodo agent web export',
    ]);
    for (const leaf of leaves) {
      expect(agentIdPicks(leaf).length).toBeLessThanOrEqual(1);
    }
  });

  it('leaves the other commands that take -i without a picker, each for a reason', () => {
    const without = leaves
      .filter((leaf) => hasAgentId(leaf) && agentIdPicks(leaf).length === 0)
      .map(fullName)
      .sort();
    expect(without).toEqual(
      [
        // -i is optional: without it every agent is described
        'frodo agent ai describe',
        'frodo agent describe',
        'frodo agent gateway describe',
        'frodo agent java describe',
        'frodo agent web describe',
        // -i names an agent in a file
        'frodo agent ai import',
        'frodo agent gateway import',
        'frodo agent import',
        'frodo agent java import',
        'frodo agent web import',
      ].sort()
    );
  });

  it('does not ask for -i of the generic export when -g answers the question, and does when nothing does', () => {
    const leaf = leaves.find((l) => fullName(l) === 'frodo agent export');
    expect(oneOfMemberAnswering(leaf, 'agentId')).toBeUndefined();
    leaf.setOptionValue('global', true);
    try {
      expect(oneOfMemberAnswering(leaf, 'agentId')).toBe('global');
    } finally {
      leaf.setOptionValue('global', undefined);
    }
  });

  it('declares no picker in a command file: the framework resolves it', () => {
    const dir = fileURLToPath(new URL('../../src/cli/agent/', import.meta.url));
    const offending = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) =>
        /deferEntityPicks|resolveEntityPicks/.test(
          fs.readFileSync(`${dir}${file}`, 'utf8')
        )
      );
    expect(offending).toEqual([]);
  });
});
