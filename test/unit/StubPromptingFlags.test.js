import { loadCommandTree } from '../utils/CommandExamples.js';

/**
 * `--prompt` and `--no-prompt` typed anywhere after the name of a command
 * group that has an action of its own (`frodo conn set --alias a --no-prompt`)
 * must reach the sub-command that runs. The group declares the pair too, and
 * commander gives a flag to the first command in the chain that declares it,
 * so the sub-command would otherwise see no value at all: the interactive
 * input resolution and the "never prompt" gate both read the sub-command
 * (cli#990).
 *
 * The groups and their sub-commands come from the real command tree, so a
 * group that gains an action of its own later is covered without touching
 * this file.
 */

function subcommands(command) {
  return command.commands.filter((c) => c.name() !== 'help');
}

/** Every command with sub-commands and an action of its own, with its path. */
function actionGroups(command, path = []) {
  const here = [...path, command];
  const subs = subcommands(command);
  if (subs.length === 0) return [];
  return [
    ...(command._actionHandler !== null ? [here] : []),
    ...subs.flatMap((sub) => actionGroups(sub, here)),
  ];
}

/** Every chain from `chain` down to a leaf command. */
function leafChains(chain) {
  const subs = subcommands(chain[chain.length - 1]);
  if (subs.length === 0) return [chain];
  return subs.flatMap((sub) => leafChains([...chain, sub]));
}

/**
 * Parses `args` below the group (so the group is the root of the chain) with
 * the leaf's action replaced, and returns the `prompt` value each command in
 * the chain holds afterwards. The input resolution may refuse the command
 * (missing mandatory input); only the stored values matter here.
 */
async function parsedPromptValues(chain, args) {
  const [root] = chain;
  const leaf = chain[chain.length - 1];
  leaf._actionHandler = async () => {};
  for (const command of chain) {
    command.exitOverride();
    command.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  }
  const operands = leaf.registeredArguments
    .filter((argument) => argument.required)
    .map(() => 'x');
  const names = chain.slice(1).map((command) => command.name());
  try {
    await root.parseAsync([...names, ...operands, ...args], { from: 'user' });
  } catch {
    // refused by the input resolution or by the fake operands: not the point
  }
  return Object.fromEntries(
    chain.map((command) => [command.name(), command.getOptionValue('prompt')])
  );
}

describe('--prompt and --no-prompt after a group that has its own action', () => {
  let chains;

  beforeAll(async () => {
    const { groups } = await loadCommandTree();
    chains = groups
      .flatMap((group) => actionGroups(group))
      .flatMap((chain) => leafChains(chain))
      .filter(
        (chain, i, all) => all.findIndex((c) => c.at(-1) === chain.at(-1)) === i
      );
  });

  test('the tree has such groups, with sub-commands below them', () => {
    const names = chains.map((chain) => chain.map((c) => c.name()).join(' '));
    expect(names).toEqual(
      expect.arrayContaining([
        'conn set',
        'settings guided',
        'settings theme list',
      ])
    );
  });

  test.each([
    ['--no-prompt', false],
    ['--prompt', true],
  ])('%s typed after the sub-command reaches it', async (flag, expected) => {
    const misses = [];
    for (const chain of chains) {
      const values = await parsedPromptValues(chain, [flag]);
      const leaf = chain[chain.length - 1].name();
      if (values[leaf] !== expected) {
        misses.push(
          `${chain.map((c) => c.name()).join(' ')}: ${JSON.stringify(values)}`
        );
      }
    }
    expect(misses).toEqual([]);
  });

  test('the flag typed before the other options reaches the sub-command too', async () => {
    const chain = chains.find(
      (c) => c.map((x) => x.name()).join(' ') === 'conn set'
    );
    const values = await parsedPromptValues(chain, [
      '--no-prompt',
      '--alias',
      'a',
    ]);
    expect(values.set).toBe(false);
  });

  test('a sub-command that is given no flag stays unset', async () => {
    const chain = chains.find(
      (c) => c.map((x) => x.name()).join(' ') === 'conn set'
    );
    const values = await parsedPromptValues(chain, ['--alias', 'a']);
    expect(values).toEqual({ conn: undefined, set: undefined });
  });
});
