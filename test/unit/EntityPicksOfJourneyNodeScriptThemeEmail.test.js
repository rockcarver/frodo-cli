import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

const { familyEntityPicks } =
  await import('../../src/utils/interactive/EntityPickRegistry.ts');
const { blockersOf } =
  await import('../../src/utils/interactive/OptionConflicts.ts');
const { getOneOfGroups } =
  await import('../../src/utils/interactive/OptionRequirements.ts');

/**
 * Decision record 0038 for the families journey, node, script, theme and email
 * template, checked against the real command tree: which commands inherit a
 * picker (a command whose -i and -n only narrow what it covers must not, record
 * 0030), and that -a, -A and the deprecated -s keep a pick from opening.
 */

const EXPECTED = {
  'frodo email template delete': ['templateId'],
  'frodo email template export': ['templateId'],
  'frodo journey delete': ['journeyId'],
  'frodo journey disable': ['journeyId'],
  'frodo journey enable': ['journeyId'],
  'frodo journey export': ['journeyId'],
  'frodo journey validate': ['journeyId'],
  'frodo node delete': ['nodeId', 'nodeName'],
  'frodo node export': ['nodeId', 'nodeName'],
  'frodo script delete': ['scriptId', 'scriptName'],
  'frodo script describe': ['scriptId', 'scriptName'],
  'frodo script export': ['scriptId', 'scriptName'],
  'frodo theme delete': ['themeId', 'themeName'],
  'frodo theme export': ['themeId', 'themeName'],
};

const FAMILIES = /^frodo (email template|journey|node|script|theme) /;

let leaves = [];

beforeAll(async () => {
  leaves = (await loadLeafCommands()).filter((leaf) =>
    FAMILIES.test(`${fullName(leaf)} `)
  );
});

const picksOf = (leaf) => familyEntityPicks(leaf).map((pick) => pick.name);

describe('entity pickers of journey, node, script, theme and email template', () => {
  it('gives a picker to exactly the commands that need an entity, and to no other command of the families', () => {
    expect(leaves.length).toBeGreaterThan(30);
    const actual = Object.fromEntries(
      leaves
        .filter((leaf) => picksOf(leaf).length > 0)
        .map((leaf) => [fullName(leaf), picksOf(leaf)])
    );
    expect(actual).toEqual(EXPECTED);
  });

  it('leaves out the commands whose -i and -n only narrow what they cover, and import', () => {
    for (const path of [
      'frodo journey describe',
      'frodo journey import',
      'frodo node describe',
      'frodo node type describe',
      'frodo node import',
      'frodo script import',
      'frodo theme import',
      'frodo email template import',
    ]) {
      const leaf = leaves.find((candidate) => fullName(candidate) === path);
      expect(leaf).toBeDefined();
      expect(picksOf(leaf)).toEqual([]);
    }
  });

  it('has a pick for a name option (-n) only on a command that has the pick for the id as well, so the runner asks for one of them', () => {
    for (const leaf of leaves) {
      for (const name of picksOf(leaf).filter((n) => /Name$/.test(n))) {
        expect([fullName(leaf), picksOf(leaf)]).toEqual([
          fullName(leaf),
          expect.arrayContaining([name.replace(/Name$/, 'Id')]),
        ]);
      }
    }
  });

  it('opens no picker when -a, -A or another selector was given: each blocks the picks it conflicts with, or answers the one-of group that the pick belongs to', () => {
    for (const leaf of leaves.filter((l) => picksOf(l).length > 0)) {
      for (const selector of ['all', 'allSeparate', 'script']) {
        if (!leaf.options.some((o) => o.attributeName() === selector)) continue;
        leaf.setOptionValue(selector, true);
        for (const pick of picksOf(leaf)) {
          // `journey validate` accepts -i with -a (4.x did), so they do not
          // conflict; the selector answers the group that -i belongs to, and a
          // group that is answered asks for nothing more
          const answersTheGroup = getOneOfGroups(leaf).some(
            (group) =>
              group.options.includes(selector) && group.options.includes(pick)
          );
          expect([
            fullName(leaf),
            selector,
            pick,
            blockersOf(leaf, pick).length > 0 || answersTheGroup,
          ]).toEqual([fullName(leaf), selector, pick, true]);
        }
        leaf.setOptionValue(selector, undefined);
      }
    }
  });
});
