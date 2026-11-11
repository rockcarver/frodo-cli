import { afterEach, describe, expect, it, jest } from '@jest/globals';

const { FrodoStubCommand } = await import('../../src/cli/FrodoCommand.ts');

/**
 * The notice a run of a deprecated, experimental or preview command prints
 * (`<Level> feature in use: '<command>'. <sentence>`). `withStability` takes an
 * optional message that replaces the generic sentence, so that a deprecated
 * command can name its replacement (cli#1271: `frodo agent ai` names `frodo
 * aiagent`). A command without a message keeps the generic sentence.
 *
 * Each test uses command names of its own: a notice is printed once per command
 * path and process.
 */

let counter = 0;
const unique = () => `grp${++counter}`;

/** The program `frodo <group> <leaf>`, with `declare` called on the group. */
function program(declare, leafName = 'leaf') {
  const group = declare(new FrodoStubCommand(unique()));
  const leaf = new FrodoStubCommand(leafName).action(() => {});
  group.addCommand(leaf);
  const root = new FrodoStubCommand('frodo');
  root.addCommand(group);
  return { root, group, leaf };
}

/** Runs `frodo <group> <leaf>` and returns what was printed on standard error. */
async function run({ root, group, leaf }) {
  const printed = [];
  jest.spyOn(console, 'error').mockImplementation((text) => printed.push(text));
  await root.parseAsync(['node', 'frodo', group.name(), leaf.name()]);
  return printed.join('\n');
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the message of withStability', () => {
  it('replaces the generic sentence of the notice of a deprecated command', async () => {
    const tree = program((group) =>
      group.withStability('deprecated', undefined, "Use 'frodo newer' instead.")
    );

    const printed = await run(tree);

    expect(printed).toBe(
      `Deprecated feature in use: 'frodo ${tree.group.name()} leaf'. Use 'frodo newer' instead.`
    );
  });

  it('is printed for an experimental command as well, in place of its generic sentence', async () => {
    const tree = program((group) =>
      group.withStability('experimental', undefined, 'Try it on a copy first.')
    );

    expect(await run(tree)).toBe(
      `Experimental feature in use: 'frodo ${tree.group.name()} leaf'. Try it on a copy first.`
    );
  });

  it('leaves the generic sentence of a deprecated command without a message as it was', async () => {
    const tree = program((group) => group.withStability('deprecated'));

    expect(await run(tree)).toBe(
      `Deprecated feature in use: 'frodo ${tree.group.name()} leaf'. This command is deprecated and may be removed in a future release.`
    );
  });

  it('leaves the generic sentence of an experimental command without a message as it was', async () => {
    const tree = program((group) => group.withStability('experimental'));

    expect(await run(tree)).toBe(
      `Experimental feature in use: 'frodo ${tree.group.name()} leaf'. This feature may change without notice.`
    );
  });

  it('prints nothing for a stable command, whatever message it carries', async () => {
    const tree = program((group) =>
      group.withStability('stable', undefined, 'Never shown.')
    );

    expect(await run(tree)).toBe('');
  });

  it('is inherited by the commands of the group from the nearest group at the strongest level', async () => {
    const inner = new FrodoStubCommand('inner').withStability(
      'deprecated',
      undefined,
      'Inner message.'
    );
    const leaf = new FrodoStubCommand('leaf').action(() => {});
    inner.addCommand(leaf);
    const outer = new FrodoStubCommand(unique()).withStability(
      'deprecated',
      undefined,
      'Outer message.'
    );
    outer.addCommand(inner);
    const root = new FrodoStubCommand('frodo');
    root.addCommand(outer);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await root.parseAsync(['node', 'frodo', outer.name(), 'inner', 'leaf']);

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      `Deprecated feature in use: 'frodo ${outer.name()} inner leaf'. Inner message.`
    );
  });

  it('takes the message of the stronger level when an outer group is stronger than the inner one', async () => {
    const inner = new FrodoStubCommand('inner').withStability(
      'experimental',
      undefined,
      'Experimental message.'
    );
    const leaf = new FrodoStubCommand('leaf').action(() => {});
    inner.addCommand(leaf);
    const outer = new FrodoStubCommand(unique()).withStability('deprecated');
    outer.addCommand(inner);
    const root = new FrodoStubCommand('frodo');
    root.addCommand(outer);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await root.parseAsync(['node', 'frodo', outer.name(), 'inner', 'leaf']);

    expect(console.error).toHaveBeenCalledWith(
      `Deprecated feature in use: 'frodo ${outer.name()} inner leaf'. This command is deprecated and may be removed in a future release.`
    );
  });
});
