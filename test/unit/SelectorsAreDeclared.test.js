import { Command, Option } from 'commander';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

const { deferOneOfGroups, getOneOfGroups } =
  await import('../../src/utils/interactive/OptionRequirements.ts');
const { NEW_ENTITY_VERBS } =
  await import('../../src/utils/interactive/EntityPickRegistry.ts');

/**
 * A command that acts on one entity (-i, -n) or on all of them (-a, -A) says
 * which in a one-of group. The framework can ask for what a command requires
 * only if the command declares it (`requireOneOf`): a requirement that the
 * action checks by hand is invisible to it. That is what `journey validate` was
 * (a person who chose the host got "Specify -i or -a" and no way to say which),
 * and why its -i had no picker either.
 *
 * Left out: `create` and `import`, whose entity is new or named in a file, and
 * whose group is about where it comes from.
 */

/** The options that select every entity. */
const ALL_SELECTORS = ['all', 'allSeparate'];
/** Options that end in Id or Name and name something else than an entity of the command. */
const NOT_ENTITIES = ['clientId', 'loginClientId', 'idmHost', 'saId', 'appId'];

/**
 * Commands that choose between one entity and all without declaring it.
 * This list only ever shrinks: a new command declares its selector.
 */
export const SELECTOR_NOT_DECLARED = [];

const entityOptionsOf = (names) =>
  names.filter(
    (name) => /(Id|Name)$/.test(name) && !NOT_ENTITIES.includes(name)
  );

/**
 * The commands that can act on one entity or on all of them, and do not
 * declare a one-of group that holds one option of each kind.
 * @param {Command[]} commands the commands to check
 * @returns {string[]} the full names of the commands
 */
export function undeclaredSelectors(commands) {
  const violations = [];
  for (const command of commands) {
    const verb = fullName(command).split(' ').pop();
    if (NEW_ENTITY_VERBS.includes(verb)) continue;
    const names = command.options.map((option) => option.attributeName());
    const all = names.filter((name) => ALL_SELECTORS.includes(name));
    const entities = entityOptionsOf(names);
    if (all.length === 0 || entities.length === 0) continue;
    const declared = getOneOfGroups(command).some(
      (group) =>
        group.options.some((name) => all.includes(name)) &&
        group.options.some((name) => entities.includes(name))
    );
    if (!declared) violations.push(fullName(command));
  }
  return violations;
}

describe('commands that choose between one entity and all of them', () => {
  let leaves;

  beforeAll(async () => {
    leaves = await loadLeafCommands();
  });

  test('declare the choice in a one-of group, so that the framework can ask for it', () => {
    const undeclared = undeclaredSelectors(leaves).filter(
      (name) => !SELECTOR_NOT_DECLARED.includes(name)
    );
    expect(undeclared).toEqual([]);
  });

  test('are not hard to find: the check looks at many commands, including the ones it exists for', () => {
    const checked = leaves.filter((leaf) => {
      const names = leaf.options.map((option) => option.attributeName());
      return (
        names.some((name) => ALL_SELECTORS.includes(name)) &&
        entityOptionsOf(names).length > 0
      );
    });
    expect(checked.length).toBeGreaterThan(60);
    const paths = checked.map(fullName);
    expect(paths).toContain('frodo journey export');
    expect(paths).toContain('frodo journey validate');
  });

  test('the list of commands left out names only commands that break the rule', () => {
    const broken = undeclaredSelectors(leaves);
    expect(
      SELECTOR_NOT_DECLARED.filter((name) => !broken.includes(name))
    ).toEqual([]);
  });
});

describe('the check', () => {
  function command(path, ...flags) {
    // like the tree of the helpers: a group without the program above it
    const group = new Command(path[0]);
    const leaf = new Command(path[1]);
    for (const flag of flags) leaf.addOption(new Option(flag));
    group.addCommand(leaf);
    return leaf;
  }
  const flags = ['-i, --thing-id <id>', '-a, --all'];

  test('finds a command with a one and an all that declares nothing', () => {
    expect(
      undeclaredSelectors([command(['thing', 'validate'], ...flags)])
    ).toEqual(['frodo thing validate']);
  });

  test('accepts one that declares a one-of group with both', () => {
    const declared = command(['thing', 'validate'], ...flags);
    deferOneOfGroups(declared, [{ options: ['thingId', 'all'], all: false }]);
    expect(undeclaredSelectors([declared])).toEqual([]);
  });

  test('wants a group that holds one of each kind, not any group', () => {
    const wrong = command(['thing', 'validate'], ...flags, '-f, --file <file>');
    deferOneOfGroups(wrong, [{ options: ['file', 'all'], all: false }]);
    expect(undeclaredSelectors([wrong])).toEqual(['frodo thing validate']);
  });

  test('leaves out a command with only one kind, and the verbs of a new entity or a file', () => {
    expect(
      undeclaredSelectors([
        command(['thing', 'list'], '-a, --all'),
        command(['thing', 'describe'], '-i, --thing-id <id>'),
        command(['thing', 'import'], ...flags),
        command(['thing', 'create'], ...flags),
      ])
    ).toEqual([]);
  });

  test('does not take a connection id for an entity', () => {
    expect(
      undeclaredSelectors([
        command(['thing', 'export'], '--login-client-id <id>', '-a, --all'),
      ])
    ).toEqual([]);
  });
});
