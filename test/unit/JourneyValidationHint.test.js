import { missingNodesHint } from '../../src/ops/JourneyValidationOps.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';

// The advice after the findings of a journey that names nodes which are not
// there is written in the words of this command line: every command it names
// has to exist.

function allCommandNames(groups) {
  const names = new Set();
  const visit = (command) => {
    names.add(fullName(command));
    command.commands.forEach(visit);
  };
  groups.forEach(visit);
  return names;
}

describe('the advice for journeys that name nodes that are not there', () => {
  test('every command it names exists', async () => {
    const { groups } = await loadCommandTree();
    const commands = allCommandNames(groups);
    const named = [true, false].flatMap((fromTenant) =>
      [...missingNodesHint(fromTenant).matchAll(/'(frodo [^']+)'/g)].map(
        (match) => match[1]
      )
    );

    expect(named).toEqual(
      expect.arrayContaining([
        'frodo journey export',
        'frodo journey describe',
        'frodo journey import',
      ])
    );
    expect(named.filter((name) => !commands.has(name))).toEqual([]);
  });

  test('it is one line each', () => {
    expect(missingNodesHint(true)).not.toContain('\n');
    expect(missingNodesHint(false)).not.toContain('\n');
  });
});
