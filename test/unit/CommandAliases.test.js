import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  FrodoCommand,
  FrodoStubCommand,
  getAliasKind,
} from '../../src/cli/FrodoCommand.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';

/**
 * The help names a command by its preferred name only. An alias is written at
 * the end of the description in one fixed form, `(alias: add)`, `(aliases: a,
 * b)` or, for the old name of a renamed command, `(formerly: old)`, so the
 * list teaches the name to use (cli#1273). The old name of a renamed command
 * keeps working and prints one notice on stderr when it is typed.
 *
 * Aliases are added with `withAlias(name, kind)`, which records the kind; ESLint
 * rejects a plain `.alias()` in src/cli. The first block checks the real
 * command tree, the second a small tree built here, because the real tree has no
 * transition alias yet.
 */

// eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
const ANSI = /\x1b\[[0-9;]*m/g;
const NOTE = /\((alias(es)?|formerly): [^)]+\)$/;

/** Every command of the tree: the groups, the stubs between them and the leaves. */
function allCommands(command) {
  return [command, ...command.commands.flatMap(allCommands)];
}

/** The help of a command as text, without colours. */
function renderHelp(command) {
  let text = '';
  command.configureOutput({
    writeOut: (chunk) => (text += chunk),
    writeErr: () => {},
  });
  command.outputHelp();
  return text.replace(ANSI, '');
}

/** The names of a command and of the commands above it, joined. */
function path(command) {
  const names = [];
  for (let c = command; c; c = c.parent) names.unshift(c.name());
  return names.join(' ');
}

describe('aliases in the command tree', () => {
  let commands;

  beforeAll(async () => {
    const { groups } = await loadCommandTree();
    commands = groups.flatMap(allCommands);
  });

  it('are found where the walk of the tree can see them', () => {
    // so the checks below cannot silently run over nothing
    const save = commands.find((c) => fullName(c) === 'frodo conn save');
    expect(save.aliases()).toEqual(['add']);
  });

  it('were all added with withAlias, which records the kind', () => {
    const plain = commands.flatMap((command) =>
      command
        .aliases()
        .filter((alias) => getAliasKind(command, alias) === undefined)
        .map((alias) => `${fullName(command)} (${alias})`)
    );
    expect(plain).toEqual([]);
  });

  it('are not part of any name in a list row or a usage line', () => {
    const offenders = [];
    for (const command of commands) {
      const parentHelp = command.parent?.createHelp();
      if (parentHelp && parentHelp.subcommandTerm(command) !== command.name()) {
        offenders.push(`${fullName(command)}: list row`);
      }
      if (
        !command
          .createHelp()
          .commandUsage(command)
          .startsWith(`${path(command)} `)
      ) {
        offenders.push(`${fullName(command)}: usage line`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('end the description of the command, in a list and on its own page', () => {
    const withAliases = commands.filter((c) => c.aliases().length > 0);
    expect(withAliases.length).toBeGreaterThan(0);
    for (const command of withAliases) {
      const inList = command.parent.createHelp().subcommandDescription(command);
      const onPage = command.createHelp().commandDescription(command);
      for (const description of [inList, onPage]) {
        expect(description).toMatch(NOTE);
        for (const alias of command.aliases()) {
          expect(description).toContain(alias);
        }
      }
    }
  });

  it('show the alias of conn save in the list of conn and on its page', () => {
    const conn = commands.find((c) => fullName(c) === 'frodo conn');
    const save = commands.find((c) => fullName(c) === 'frodo conn save');
    expect(renderHelp(conn)).toMatch(
      /^ {2}save {14}Save connection profiles\. \(alias: add\)$/m
    );
    expect(renderHelp(conn)).not.toMatch(/save\|add/);
    expect(renderHelp(save)).toMatch(/^Usage: conn save \[options\]/m);
    expect(renderHelp(save)).toContain(
      'Save connection profiles. (alias: add)'
    );
  });
});

describe('the alias note', () => {
  /** A leaf in a group, with the aliases `specs` ([name, kind?]) added by withAlias. */
  function describedLeaf(description, specs) {
    const group = new FrodoStubCommand('group');
    const leaf = new FrodoCommand('frodo group leaf', [], undefined, {
      local: true,
    }).description(description);
    for (const [name, kind] of specs) leaf.withAlias(name, kind);
    group.addCommand(leaf.name('leaf'));
    return { group, leaf };
  }

  const listed = ({ group, leaf }) =>
    group.createHelp().subcommandDescription(leaf);
  const onPage = ({ leaf }) => leaf.createHelp().commandDescription(leaf);

  it('names one convenience alias as (alias: a)', () => {
    const tree = describedLeaf('Does it.', [['a']]);
    expect(listed(tree)).toBe('Does it. (alias: a)');
    expect(onPage(tree)).toBe('Does it. (alias: a)');
  });

  it('names several convenience aliases as (aliases: a, b)', () => {
    expect(
      listed(describedLeaf('Does it.', [['a'], ['b', 'convenience']]))
    ).toBe('Does it. (aliases: a, b)');
  });

  it('names the old name of a renamed command as (formerly: old)', () => {
    const tree = describedLeaf('Does it.', [['old', 'transition']]);
    expect(listed(tree)).toBe('Does it. (formerly: old)');
    expect(onPage(tree)).toBe('Does it. (formerly: old)');
  });

  it('puts the transition note last when a command has both kinds', () => {
    const tree = describedLeaf('Does it.', [
      ['old', 'transition'],
      ['a', 'convenience'],
    ]);
    expect(listed(tree)).toBe('Does it. (alias: a) (formerly: old)');
    expect(listed(tree)).toMatch(NOTE);
  });

  it('comes after the stability badge', () => {
    const { group, leaf } = describedLeaf('Does it.', [['old', 'transition']]);
    leaf.withStability('experimental');
    expect(group.createHelp().subcommandDescription(leaf)).toMatch(
      /^\[Experimental\] Does it\. \(formerly: old\)$/
    );
  });

  it('is the whole description of a command that has none', () => {
    expect(listed(describedLeaf('', [['a']]))).toBe('(alias: a)');
  });

  it('is absent for a command without aliases', () => {
    expect(listed(describedLeaf('Does it.', []))).toBe('Does it.');
  });

  it('treats an alias added with plain alias() as a convenience alias', () => {
    const group = new FrodoStubCommand('group');
    const leaf = new FrodoCommand('frodo group leaf', [], undefined, {
      local: true,
    }).description('Does it.');
    leaf.alias('a'); // a plain commander call, on purpose: the kind is not recorded
    group.addCommand(leaf.name('leaf'));
    expect(getAliasKind(leaf, 'a')).toBeUndefined();
    expect(group.createHelp().subcommandDescription(leaf)).toBe(
      'Does it. (alias: a)'
    );
  });
});

describe('a transition alias on a leaf under nested groups', () => {
  let errors;
  let outputs;
  let exitCode;

  /**
   * frodo > config-manager > pull > ui-config, the shape the config-manager
   * tree has, with `oldName` as the transition alias of the leaf. The leaf is a
   * FrodoCommand, not a stub. Its action records that it ran.
   */
  function buildTree(oldName, ran) {
    const root = new FrodoStubCommand('frodo');
    const group = new FrodoStubCommand('config-manager');
    const pull = new FrodoStubCommand('pull').description('Export.');
    const leaf = new FrodoCommand(
      'frodo config-manager pull ui-config',
      [],
      undefined,
      {
        local: true,
      }
    )
      .withAlias(oldName, 'transition')
      .description('Export IDM UI configuration objects.')
      .action(() => {
        ran.push('ui-config');
      });
    pull.addCommand(leaf.name('ui-config'));
    group.addCommand(pull);
    root.addCommand(group);
    let help = '';
    for (const command of [root, group, pull, leaf]) {
      command.exitOverride();
      command.configureOutput({
        writeOut: (chunk) => (help += chunk),
        writeErr: () => {},
      });
    }
    return { root, leaf, helpText: () => help.replace(ANSI, '') };
  }

  beforeAll(() => {
    exitCode = process.exitCode;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = exitCode;
  });

  function spyOnOutput() {
    errors = [];
    outputs = [];
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
    jest.spyOn(console, 'log').mockImplementation((...args) => {
      outputs.push(args.join(' '));
    });
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      outputs.push(String(chunk));
      return true;
    });
  }

  const notice = (oldName) =>
    `'${oldName}' is now called 'ui-config'. The old name still works and will be removed in a future major release.`;

  it('runs the command and prints the notice once, on stderr', async () => {
    const ran = [];
    const { root } = buildTree('uiConfigOnce', ran);
    spyOnOutput();

    await root.parseAsync(['config-manager', 'pull', 'uiConfigOnce'], {
      from: 'user',
    });
    await root.parseAsync(['config-manager', 'pull', 'uiConfigOnce'], {
      from: 'user',
    });

    expect(ran).toEqual(['ui-config', 'ui-config']);
    expect(errors.map((line) => line.replace(ANSI, ''))).toEqual([
      notice('uiConfigOnce'),
    ]);
    expect(outputs).toEqual([]);
    expect(process.exitCode).toBe(exitCode);
  });

  it('prints no notice for the new name', async () => {
    const ran = [];
    const { root } = buildTree('uiConfigNew', ran);
    spyOnOutput();

    await root.parseAsync(['config-manager', 'pull', 'ui-config'], {
      from: 'user',
    });

    expect(ran).toEqual(['ui-config']);
    expect(errors).toEqual([]);
    expect(outputs).toEqual([]);
  });

  it('shows the same help for the old name as for the new name, and says formerly', async () => {
    const asNew = buildTree('uiConfigHelp', []);
    const asOld = buildTree('uiConfigHelp', []);
    spyOnOutput();

    await expect(
      asNew.root.parseAsync(['config-manager', 'pull', 'ui-config', '-h'], {
        from: 'user',
      })
    ).rejects.toMatchObject({ code: 'commander.helpDisplayed' });
    await expect(
      asOld.root.parseAsync(['config-manager', 'pull', 'uiConfigHelp', '-h'], {
        from: 'user',
      })
    ).rejects.toMatchObject({ code: 'commander.helpDisplayed' });

    expect(asOld.helpText()).toBe(asNew.helpText());
    expect(asNew.helpText()).toContain(
      'Usage: frodo config-manager pull ui-config [options]'
    );
    expect(asNew.helpText()).toContain(
      'Export IDM UI configuration objects. (formerly: uiConfigHelp)'
    );
  });

  it('names the new name and the old name in the list of the group', () => {
    const { root } = buildTree('uiConfigList', []);
    const pull = root.commands[0].commands[0];
    // the note can wrap onto a second line of the description column: read it joined
    const page = renderHelp(pull).replace(/\n {10,}(?=\S)/g, ' ');
    expect(page).toMatch(
      /^ {2}ui-config {2,}Export IDM UI configuration objects\. \(formerly: uiConfigList\)$/m
    );
    expect(page).not.toMatch(/ui-config\|uiConfigList/);
  });

  it('prints no notice for a convenience alias', async () => {
    const root = new FrodoStubCommand('frodo');
    const ran = [];
    const leaf = new FrodoCommand('frodo save', [], undefined, { local: true })
      .withAlias('add')
      .action(() => {
        ran.push('save');
      });
    root.addCommand(leaf.name('save'));
    root.exitOverride();
    leaf.exitOverride();
    spyOnOutput();

    await root.parseAsync(['add'], { from: 'user' });

    expect(ran).toEqual(['save']);
    expect(errors).toEqual([]);
  });
});
