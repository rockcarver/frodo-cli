import { describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

/**
 * The steps of `config-manager pull all` and `pull all-static` are named in the
 * summary of failed steps (decision record 0040). A name is the name of the
 * `config-manager pull` command that does the same, so the user can run that
 * command to see the error again.
 */

const leaves = await loadLeafCommands();
const { deploymentMapAll, deploymentMapAllStatic } =
  await import('../../src/configManagerOps/FrConfigAllOps.ts');

const PREFIX = 'frodo config-manager pull ';
const pullCommands = new Set(
  leaves
    .map(fullName)
    .filter((name) => name.startsWith(PREFIX))
    .map((name) => name.slice(PREFIX.length))
);

describe.each([
  ['pull all', deploymentMapAll],
  ['pull all-static', deploymentMapAllStatic],
])('%s', (_name, map) => {
  it('has steps for the cloud, ForgeOps and classic deployments', () => {
    expect(Object.keys(map).sort()).toEqual(['classic', 'cloud', 'forgeops']);
  });

  it.each(Object.entries(map))(
    'names every step of a %s deployment after a pull command, once',
    (_deployment, steps) => {
      const names = steps.map((step) => step.name);
      expect(names.filter((name) => !pullCommands.has(name))).toEqual([]);
      expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
    }
  );
});
