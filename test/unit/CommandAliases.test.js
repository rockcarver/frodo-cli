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
import { getOptionAliases } from '../../src/cli/OptionAlias.ts';
import {
  fullName,
  loadCommandTree,
  resolveCommand,
} from '../utils/CommandExamples.js';

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
      // a group is built on its own here and has no parent: its row in the list of the root is read in
      // ConfigGroupAlias.test.js and by the snapshot of the root page
      const inList = command.parent
        ?.createHelp()
        .subcommandDescription(command);
      const onPage = command.createHelp().commandDescription(command);
      for (const description of [inList, onPage].filter(Boolean)) {
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

/** The shape of config-manager: frodo > config-manager > pull > ui-config. */
const UI_CONFIG = {
  path: ['config-manager', 'pull', 'ui-config'],
  description: 'Export IDM UI configuration objects.',
};

describe('a transition alias in a nested tree', () => {
  let errors;
  let outputs;
  let exitCode;

  /**
   * frodo > ...`path`, the shape the config-manager tree has. The last name of
   * the path is the leaf (a FrodoCommand, not a stub, whose action records its
   * name in `ran`), the names before it are stubs. `oldName` becomes the
   * transition alias of the command at `aliasAt`: the leaf by default, or 0 for
   * the group under the root stub. The notice fires once per process for each
   * path typed, so every test types an old name no other test types.
   */
  function buildTree(
    { path, description = 'Does it.' },
    oldName,
    ran,
    aliasAt
  ) {
    const at = aliasAt ?? path.length - 1;
    const root = new FrodoStubCommand('frodo');
    const commands = [];
    let child;
    for (let depth = path.length - 1; depth >= 0; depth--) {
      const name = path[depth];
      const command =
        depth === path.length - 1
          ? new FrodoCommand(`frodo ${path.join(' ')}`, [], undefined, {
              local: true,
            })
              .description(description)
              .action(() => {
                ran.push(name);
              })
          : new FrodoStubCommand(name).description(`Commands of ${name}.`);
      if (depth === at) command.withAlias(oldName, 'transition');
      if (child) command.addCommand(child);
      command.name(name);
      commands.unshift(command);
      child = command;
    }
    root.addCommand(child);
    let help = '';
    for (const command of [root, ...commands]) {
      command.exitOverride();
      command.configureOutput({
        writeOut: (chunk) => (help += chunk),
        writeErr: () => {},
      });
    }
    return {
      root,
      leaf: commands[commands.length - 1],
      helpText: () => help.replace(ANSI, ''),
    };
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

  const notice = (oldName, newName) =>
    `'${oldName}' is now called '${newName}'. The old name still works and will be removed in a future major release.`;

  it('runs the command and prints the notice once, on stderr', async () => {
    const ran = [];
    const { root } = buildTree(UI_CONFIG, 'uiConfigOnce', ran);
    spyOnOutput();

    await root.parseAsync(['config-manager', 'pull', 'uiConfigOnce'], {
      from: 'user',
    });
    await root.parseAsync(['config-manager', 'pull', 'uiConfigOnce'], {
      from: 'user',
    });

    expect(ran).toEqual(['ui-config', 'ui-config']);
    expect(errors.map((line) => line.replace(ANSI, ''))).toEqual([
      notice('uiConfigOnce', 'ui-config'),
    ]);
    expect(outputs).toEqual([]);
    expect(process.exitCode).toBe(exitCode);
  });

  it('prints no notice for the new name', async () => {
    const ran = [];
    const { root } = buildTree(UI_CONFIG, 'uiConfigNew', ran);
    spyOnOutput();

    await root.parseAsync(['config-manager', 'pull', 'ui-config'], {
      from: 'user',
    });

    expect(ran).toEqual(['ui-config']);
    expect(errors).toEqual([]);
    expect(outputs).toEqual([]);
  });

  it('shows the same help for the old name as for the new name, and says formerly', async () => {
    const asNew = buildTree(UI_CONFIG, 'uiConfigHelp', []);
    const asOld = buildTree(UI_CONFIG, 'uiConfigHelp', []);
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
    const { root } = buildTree(UI_CONFIG, 'uiConfigList', []);
    const pull = root.commands[0].commands[0];
    // the note can wrap onto a second line of the description column: read it joined
    const page = renderHelp(pull).replace(/\n {10,}(?=\S)/g, ' ');
    expect(page).toMatch(
      /^ {2}ui-config {2,}Export IDM UI configuration objects\. \(formerly: uiConfigList\)$/m
    );
    expect(page).not.toMatch(/ui-config\|uiConfigList/);
  });

  describe('on the group under the root, as config-manager becomes config', () => {
    const CONFIG = {
      path: ['config', 'pull', 'cors'],
      description: 'Export CORS configuration.',
    };

    it('runs the command under the old group name and prints the notice once, on stderr', async () => {
      const ran = [];
      const { root } = buildTree(CONFIG, 'configGroupOnce', ran, 0);
      spyOnOutput();

      await root.parseAsync(['configGroupOnce', 'pull', 'cors'], {
        from: 'user',
      });
      await root.parseAsync(['configGroupOnce', 'pull', 'cors'], {
        from: 'user',
      });

      expect(ran).toEqual(['cors', 'cors']);
      expect(errors.map((line) => line.replace(ANSI, ''))).toEqual([
        notice('configGroupOnce', 'config'),
      ]);
      expect(outputs).toEqual([]);
      expect(process.exitCode).toBe(exitCode);
    });

    it('prints no notice for the new group name', async () => {
      const ran = [];
      const { root } = buildTree(CONFIG, 'configGroupNew', ran, 0);
      spyOnOutput();

      await root.parseAsync(['config', 'pull', 'cors'], { from: 'user' });

      expect(ran).toEqual(['cors']);
      expect(errors).toEqual([]);
      expect(outputs).toEqual([]);
    });

    it('shows the same help for the old group name as for the new one, and names the old one in the list of the root', async () => {
      const asNew = buildTree(CONFIG, 'configGroupHelp', [], 0);
      const asOld = buildTree(CONFIG, 'configGroupHelp', [], 0);
      spyOnOutput();

      await expect(
        asNew.root.parseAsync(['config', '-h'], { from: 'user' })
      ).rejects.toMatchObject({ code: 'commander.helpDisplayed' });
      await expect(
        asOld.root.parseAsync(['configGroupHelp', '-h'], { from: 'user' })
      ).rejects.toMatchObject({ code: 'commander.helpDisplayed' });

      expect(asOld.helpText()).toBe(asNew.helpText());
      expect(asNew.helpText()).toContain(
        'Commands of config. (formerly: configGroupHelp)'
      );
      const list = renderHelp(buildTree(CONFIG, 'configGroupList', [], 0).root)
        // the note can wrap onto a second line of the description column: read it joined
        .replace(/\n {10,}(?=\S)/g, ' ');
      expect(list).toMatch(
        /^ {2}config {2,}Commands of config\. \(formerly: configGroupList\)$/m
      );
      expect(list).not.toMatch(/config\|configGroupList/);
    });
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

/**
 * The old words of the renames of cli#1264. The old words of the types and of the
 * promotion commands (`applications`, `authentication`, `custom-nodes`,
 * `connector-definitions`, `secret-mappings`, `remote-servers`, and the seven
 * promotion names) and the old group word `config-manager` are transition
 * aliases now, and their rows below are real tests of the real tree. Each row
 * says what has to stay true, in two parts:
 *
 * - a real test that the old word still leads to a command (`resolveCommand`
 *   finds a command by name or by alias). It fails if a rename drops the word,
 *   the property the recorded e2e tests rely on because they type the old
 *   spelling;
 * - for the renamed types, a real test of the transition contract: `getAliasKind`
 *   is `transition`, the help ends `(formerly: old)`, and the old word leads to
 *   the command of the new name. For the group word, the same on the group
 *   `config`, and a test that the first use prints one notice on stderr.
 *
 * The notice and help of a transition alias are proven on a small tree above and,
 * for every renamed command of the real tree, in
 * ConfigManagerTransitionAliases.test.js. An alias is named in the description
 * and the old name of a renamed command stays as a transition alias:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md
 */
describe('the old words of the planned renames (cli#1264)', () => {
  let groups;

  beforeAll(async () => {
    ({ groups } = await loadCommandTree());
  });

  /** The command the words lead to (the leaf, not a group), or undefined. */
  const leafOf = (...words) => {
    const found = resolveCommand(groups, ['frodo', ...words])?.command;
    return found && found.commands.length === 0 ? found : undefined;
  };

  it('finds a command by the word it has today, so the rows below cannot silently run over nothing', () => {
    expect(leafOf('config-manager', 'pull', 'cors')).toBeDefined();
    expect(leafOf('config-manager', 'pull', 'no-such-word')).toBeUndefined();
    expect(leafOf('no-such-group', 'pull', 'cors')).toBeUndefined();
  });

  describe('the group word config-manager, a transition alias of config', () => {
    // one command of every verb of the group
    const verbs = [
      ['pull', 'cors'],
      ['push', 'cors'],
      ['delete', 'scripts'],
      ['migrate', 'applications'],
      ['promote', 'run'],
    ];

    it.each(verbs)('config-manager %s %s leads to a command', (verb, word) => {
      const command = leafOf('config-manager', verb, word);
      expect(command).toBeDefined();
    });

    it('keeps config export and config import, which stay as they are', () => {
      expect(leafOf('config', 'export')).toBeDefined();
      expect(leafOf('config', 'import')).toBeDefined();
    });

    it('config-manager is the only alias of config, a transition alias, and no group of the tree is named config-manager', () => {
      const config = groups.find((group) => group.name() === 'config');
      expect(config).toBeDefined();
      expect(groups.some((group) => group.name() === 'config-manager')).toBe(
        false
      );
      expect(config.aliases()).toEqual(['config-manager']);
      expect(getAliasKind(config, 'config-manager')).toBe('transition');
      expect(resolveCommand(groups, ['frodo', 'config-manager'])?.command).toBe(
        config
      );
    });

    it('the description of config ends with (formerly: config-manager), and its page and its usage line name config', () => {
      const config = groups.find((group) => group.name() === 'config');
      expect(
        config
          .createHelp()
          .commandDescription(config)
          .endsWith('(formerly: config-manager)')
      ).toBe(true);
      const page = renderHelp(config).replace(/\n {10,}(?=\S)/g, ' ');
      expect(page).toContain('Usage: config [options] [command]');
      expect(page).not.toContain('Usage: config-manager');
      // the list of the group names the verbs under their one name
      expect(config.commands.map((c) => c.name()).sort()).toEqual([
        'delete',
        'export',
        'import',
        'migrate',
        'promote',
        'pull',
        'push',
      ]);
    });

    it('typing config-manager prints one notice on stderr, once per process, and then dispatches to config; typing config prints none', async () => {
      const { groups: fresh } = await loadCommandTree();
      const config = fresh.find((group) => group.name() === 'config');
      const root = new FrodoStubCommand('frodo');
      root.addCommand(config);
      // a probe in place of the group's own parsing: the registration, the alias and the dispatch of the real group are used
      const ran = [];
      const original = config._parseCommand;
      config._parseCommand = () => {
        ran.push(config.name());
      };
      const errors = [];
      const exitCode = process.exitCode;
      jest.spyOn(console, 'error').mockImplementation((...args) => {
        errors.push(args.join(' '));
      });
      try {
        await root._dispatchSubcommand('config-manager', ['pull', 'cors'], []);
        await root._dispatchSubcommand('config-manager', ['pull', 'cors'], []);
        expect(ran).toEqual(['config', 'config']);
        expect(errors.map((line) => line.replace(ANSI, ''))).toEqual([
          "'config-manager' is now called 'config'. The old name still works and will be removed in a future major release.",
        ]);
        await root._dispatchSubcommand('config', ['pull', 'cors'], []);
        expect(ran).toEqual(['config', 'config', 'config']);
        expect(errors).toHaveLength(1);
        expect(process.exitCode).toBe(exitCode);
      } finally {
        config._parseCommand = original;
        jest.restoreAllMocks();
      }
    });

    // the join puts export and import next to pull and push, so the old group word reaches them too
    it.each(['export', 'import'])(
      'config-manager %s leads to the same command as config %s (a side effect of the join, documented in MIGRATION.md)',
      (verb) => {
        const viaOld = resolveCommand(groups, [
          'frodo',
          'config-manager',
          verb,
        ]);
        const viaNew = resolveCommand(groups, ['frodo', 'config', verb]);
        expect(viaOld?.command).toBeDefined();
        expect(viaOld.command).toBe(viaNew.command);
        expect(fullName(viaOld.command)).toBe(`frodo config ${verb}`);
      }
    );

    // the experimental label sits on the five verb groups, so export and import keep being stable
    it('config export and config import stay stable (no label); the five verb groups and every leaf under them are experimental or deprecated', () => {
      const config = groups.find((group) => group.name() === 'config');
      for (const verb of ['export', 'import']) {
        const command = config.commands.find((c) => c.name() === verb);
        expect(renderHelp(command)).not.toMatch(
          /\[(Experimental|Deprecated)\]/
        );
      }
      for (const verb of ['pull', 'push', 'delete', 'migrate', 'promote']) {
        const group = config.commands.find((c) => c.name() === verb);
        expect(renderHelp(group)).toMatch(/\[Experimental\]/);
        for (const leaf of allCommands(group).filter(
          (c) => c.commands.length === 0
        )) {
          expect(renderHelp(leaf)).toMatch(/\[(Experimental|Deprecated)\]/);
        }
      }
    });
  });

  describe('the words of the types that get a shorter name, each kept as a transition alias in every verb that has it', () => {
    /** [new word, old word, the verbs of config-manager that have the old word today] */
    const renames = [
      ['apps', 'applications', ['pull', 'push', 'delete', 'migrate']],
      ['authn', 'authentication', ['pull', 'push']],
      ['nodes', 'custom-nodes', ['pull', 'push', 'delete']],
      ['connectors', 'connector-definitions', ['pull', 'push', 'delete']],
      ['secretstore-mappings', 'secret-mappings', ['pull', 'push', 'delete']],
    ];
    const rows = renames.flatMap(([newWord, oldWord, verbs]) =>
      verbs.map((verb) => [verb, oldWord, newWord])
    );

    it('has a row for every verb that has the old word today (15 rows)', () => {
      expect(rows.length).toBe(15);
      // the rows cover all of them: no other config-manager command carries an old word
      const olds = new Set(renames.map(([, oldWord]) => oldWord));
      const covered = new Set(
        rows.map(([verb, oldWord]) => `${verb} ${oldWord}`)
      );
      const group = groups.find((g) =>
        [g.name(), ...g.aliases()].includes('config-manager')
      );
      const present = group.commands.flatMap((verb) =>
        verb.commands.flatMap((leaf) =>
          [leaf.name(), ...leaf.aliases()]
            .filter((word) => olds.has(word))
            .map((word) => `${verb.name()} ${word}`)
        )
      );
      expect(present.sort()).toEqual([...covered].sort());
    });

    it.each(rows)(
      'config-manager %s %s leads to a command',
      (verb, oldWord) => {
        const command = leafOf('config-manager', verb, oldWord);
        expect(command).toBeDefined();
      }
    );

    // the notice and the unchanged stdout and exit code of every rename are run in ConfigManagerTransitionAliases.test.js
    it.each(rows)(
      'config-manager %s %s is a transition alias of the new word (getAliasKind), the help ends (formerly: old), and the old word leads to the command of the new word',
      (verb, oldWord, newWord) => {
        const command = leafOf('config-manager', verb, newWord);
        expect(command).toBeDefined();
        expect(command.name()).toBe(newWord);
        expect(getAliasKind(command, oldWord)).toBe('transition');
        expect(leafOf('config-manager', verb, oldWord)).toBe(command);
        expect(
          command.parent.createHelp().subcommandDescription(command)
        ).toMatch(new RegExp(`\\(formerly: ${oldWord}\\)$`));
        expect(renderHelp(command).replace(/\s+/g, ' ')).toContain(
          `(formerly: ${oldWord})`
        );
      }
    );
  });

  describe('oauth2-agents, which splits into oauth-clients and agents and stays as a deprecated command that runs both', () => {
    // not an alias of either new command: pipelines and pull all keep working
    const verbs = ['pull', 'push'];

    it.each(verbs)(
      'config-manager %s oauth2-agents leads to a command',
      (verb) => {
        const command = leafOf('config-manager', verb, 'oauth2-agents');
        expect(command).toBeDefined();
      }
    );

    it.each(verbs)(
      'config-manager %s oauth2-agents is a deprecated command that runs both oauth-clients and agents, not an alias of either',
      (verb) => {
        const command = leafOf('config-manager', verb, 'oauth2-agents');
        // it is a command of its own that keeps its name and has no alias
        expect(command.name()).toBe('oauth2-agents');
        expect(command.aliases()).toEqual([]);
        for (const word of ['oauth-clients', 'agents']) {
          const target = leafOf('config-manager', verb, word);
          expect(target).toBeDefined();
          expect(target).not.toBe(command);
          expect(target.name()).toBe(word);
          // the two new commands are commands, not aliases: typing one is not a transition
          expect(target.aliases()).toEqual([]);
          expect(getAliasKind(target, 'oauth2-agents')).toBeUndefined();
          expect(getAliasKind(command, word)).toBeUndefined();
        }
      }
    );

    it.each(verbs)(
      'config-manager %s oauth2-agents is marked deprecated, and its page and its row name oauth-clients and agents',
      (verb) => {
        const command = leafOf('config-manager', verb, 'oauth2-agents');
        // the page wraps its lines
        const page = renderHelp(command).replace(/\s+/g, ' ');
        const row = command.parent.createHelp().subcommandDescription(command);

        for (const text of [page, row]) {
          expect(text).toContain('Deprecated:');
          expect(text).toContain(`"${verb} oauth-clients"`);
          expect(text).toContain(`"${verb} agents"`);
        }
        expect(page).toContain('[Deprecated]');
        // the two new commands are not deprecated
        for (const word of ['oauth-clients', 'agents']) {
          expect(
            renderHelp(leafOf('config-manager', verb, word))
          ).not.toContain('[Deprecated]');
        }
      }
    );

    it('config-manager pull all keeps one step named oauth2-agents and none named after the new commands, so a pipeline and pull all still pull the OAuth2 clients and the other agents', async () => {
      const { deploymentMapAll } =
        await import('../../src/configManagerOps/FrConfigAllOps.ts');
      for (const steps of Object.values(deploymentMapAll)) {
        const names = steps.map((step) => step.name);
        expect(names.filter((name) => name === 'oauth2-agents')).toHaveLength(
          1
        );
        expect(names).not.toContain('oauth-clients');
        expect(names).not.toContain('agents');
      }
      // the step is named after a pull command, which is the deprecated one
      expect(leafOf('config-manager', 'pull', 'oauth2-agents')).toBeDefined();
    });
  });

  describe('-n, --name, which stays a permanent alias', () => {
    // the 61 commands of config-manager that take -n today (the decision of cli#1264 counts the same)
    const withName = {
      delete: [
        'applications',
        'custom-nodes',
        'email-templates',
        'endpoints',
        'locales',
        'oauth-cimd-profiles',
        'oauth-issuers',
        'oauth-software-publishers',
        'schedules',
        'scripts',
        'secret-mappings',
        'secrets',
        'telemetry',
        'terms-and-conditions',
        'themes',
        'variables',
      ],
      pull: [
        'applications',
        'connector-definitions',
        'custom-nodes',
        'email-templates',
        'endpoints',
        'iga-workflows',
        'internal-roles',
        'journeys',
        'locales',
        'managed-objects',
        'oauth-cimd-profiles',
        'oauth-issuers',
        'oauth-software-publishers',
        'org-privileges',
        'remote-proxies',
        'schedules',
        'secret-mappings',
        'services',
        'telemetry',
      ],
      push: [
        'applications',
        'connector-definitions',
        'connector-mappings',
        'csp',
        'custom-nodes',
        'email-templates',
        'endpoints',
        'iga-workflows',
        'internal-roles',
        'journeys',
        'locales',
        'managed-objects',
        'oauth-cimd-profiles',
        'oauth-issuers',
        'oauth-software-publishers',
        'org-privileges',
        'remote-proxies',
        'saml',
        'schedules',
        'scripts',
        'secret-mappings',
        'secrets',
        'services',
        'telemetry',
        'variables',
      ],
    };
    // the one command that takes -n with another long name today: -n, --script-name
    const withScriptName = [['pull', 'scripts']];
    const named = Object.entries(withName).flatMap(([verb, words]) =>
      words.map((word) => [verb, word])
    );

    // an option of the command by its short or long flag, or by a spelling that the option
    // answers to as its permanent alias (src/cli/OptionAlias.ts: -i, --journey-id keeps -n and
    // --name once the selectors of the command are renamed)
    const takes = (command, flag) =>
      command.options.some(
        (option) =>
          option.short === flag ||
          option.long === flag ||
          getOptionAliases(option).includes(flag)
      );

    it('lists 60 commands with -n, --name and 1 with -n, --script-name', () => {
      expect(named.length).toBe(60);
      expect(withScriptName.length).toBe(1);
    });

    it('still takes -n on every command that takes it today', () => {
      const missing = [...named, ...withScriptName].flatMap(([verb, word]) => {
        const command = leafOf('config-manager', verb, word);
        return command && takes(command, '-n')
          ? []
          : [`config-manager ${verb} ${word}`];
      });
      expect(missing).toEqual([]);
    });

    it('still takes --name on every command that takes -n, --name today', () => {
      const missing = named.flatMap(([verb, word]) => {
        const command = leafOf('config-manager', verb, word);
        return command && takes(command, '--name')
          ? []
          : [`config-manager ${verb} ${word}`];
      });
      expect(missing).toEqual([]);
    });

    it.todo(
      '-n, --name is a permanent alias on every command that takes it: it is accepted, prints no notice and is documented in the help (the option alias is designed in cli#1264)'
    );
  });
});
