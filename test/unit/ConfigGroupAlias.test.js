import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { getAliasKind } from '../../src/cli/FrodoCommand.ts';
import {
  extractExamples,
  fullName,
  leafCommands,
  loadCommandTree,
  renderFullHelp,
  resolveCommand,
} from '../utils/CommandExamples.js';

/**
 * One group, `frodo config`: it hosts `export` and `import` next to the five
 * verbs that work on a tree of files (`pull`, `push`, `delete`, `migrate` and
 * `promote`), and `config-manager`, the old name of the group, is a transition
 * alias of it (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0056-the-configuration-command-group.md,
 * the configuration command group, and
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md,
 * the old name of a renamed command stays as a transition alias).
 *
 * The alias is declared inside src/cli/config/config.ts, so the tree that this
 * test builds from the group modules (as src/app.ts registers them) sees it.
 * The experimental label sits on the five verb groups, so `config export` and
 * `config import` stay stable and every leaf below a verb keeps its label.
 */

const VERBS = ['delete', 'migrate', 'promote', 'pull', 'push'];

// eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
const ANSI = /\x1b\[[0-9;]*m/g;

/** The help of a command as text, without colours, a wrapped description joined to one line. */
function renderHelp(command) {
  let text = '';
  command.configureOutput({
    writeOut: (chunk) => (text += chunk),
    writeErr: () => {},
  });
  command.outputHelp();
  return text.replace(ANSI, '').replace(/\n {10,}(?=\S)/g, ' ');
}

/** Every command below a command, the stubs between and the leaves. */
function allCommands(command) {
  return [command, ...command.commands.flatMap(allCommands)];
}

/** The description paragraph of a page, where a label of the command sits (the options of -hhh carry labels of their own). */
const descriptionOf = (command) => renderHelp(command).split('\n\n')[1] ?? '';

/** The leaf by the words of its path below the root, by name or alias. */
const find = (groups, words) =>
  resolveCommand(groups, ['frodo', ...words])?.command;

describe('frodo config, the one group', () => {
  let groups;
  let config;
  let leaves;
  const originalArgv = process.argv;

  beforeAll(async () => {
    // the usage examples are only rendered for -hhh (see FrodoCommand.addHelpText)
    process.argv = [...originalArgv, '--help-all'];
    ({ groups } = await loadCommandTree());
    config = groups.find((group) => group.name() === 'config');
    leaves = VERBS.flatMap((verb) =>
      leafCommands(config.commands.find((c) => c.name() === verb))
    );
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  it('is one root command named config, and no root command is named config-manager', () => {
    expect(config).toBeDefined();
    expect(groups.filter((group) => group.name() === 'config')).toHaveLength(1);
    expect(groups.map((group) => group.name())).not.toContain('config-manager');
  });

  it('records config-manager as its transition alias, the only one, and ends the description with the note', () => {
    expect(config.aliases()).toEqual(['config-manager']);
    expect(getAliasKind(config, 'config-manager')).toBe('transition');
    expect(
      config
        .createHelp()
        .commandDescription(config)
        .endsWith('(formerly: config-manager)')
    ).toBe(true);
    expect(find(groups, ['config-manager'])).toBe(config);
  });

  it('has the seven children: the five verbs, and export and import', () => {
    expect(config.commands.map((c) => c.name()).sort()).toEqual(
      [...VERBS, 'export', 'import'].sort()
    );
  });

  it('has a leaf under every verb, so the checks below have something to check', () => {
    expect(leaves.length).toBeGreaterThanOrEqual(126);
    for (const verb of VERBS) {
      expect(
        leaves.filter((leaf) =>
          fullName(leaf).startsWith(`frodo config ${verb} `)
        ).length
      ).toBeGreaterThan(0);
    }
  });

  it('reaches every leaf by the old group word and by the new one, as the same command', () => {
    const different = [];
    for (const leaf of leaves) {
      const words = fullName(leaf).split(' ').slice(1);
      const viaNew = find(groups, words);
      const viaOld = find(groups, ['config-manager', ...words.slice(1)]);
      if (viaNew !== leaf || viaOld !== leaf) different.push(fullName(leaf));
    }
    expect(different).toEqual([]);
  });

  it('reaches config export and config import by the old group word too (a side effect of the join)', () => {
    for (const verb of ['export', 'import']) {
      const viaOld = find(groups, ['config-manager', verb]);
      expect(viaOld).toBe(find(groups, ['config', verb]));
      expect(fullName(viaOld)).toBe(`frodo config ${verb}`);
    }
  });

  it('keeps the experimental label on the five verb groups and not on config: the row and the page of every leaf say Experimental or Deprecated, export and import say neither', () => {
    // the page of the group has no label of its own
    expect(renderHelp(config).split('Commands:')[0]).not.toMatch(
      /\[(Experimental|Deprecated)\]/
    );
    for (const verb of ['export', 'import']) {
      const command = config.commands.find((c) => c.name() === verb);
      expect(descriptionOf(command)).not.toMatch(
        /\[(Experimental|Deprecated)\]/
      );
      expect(renderHelp(config)).toMatch(
        new RegExp(`^ {2}${verb} {2,}(?!\\[(Experimental|Deprecated)\\])`, 'm')
      );
    }
    const unlabelled = [];
    for (const verb of VERBS) {
      const group = config.commands.find((c) => c.name() === verb);
      // the row of the verb in the list of config and its own page
      if (
        !new RegExp(`^ {2}${verb} {2,}\\[Experimental\\]`, 'm').test(
          renderHelp(config)
        )
      ) {
        unlabelled.push(`row of ${verb}`);
      }
      if (!/^\[Experimental\]/.test(descriptionOf(group))) {
        unlabelled.push(`page of ${verb}`);
      }
      for (const leaf of leafCommands(group)) {
        const parent = leaf.parent;
        const row = new RegExp(
          `^ {2}${leaf.name()} {2,}\\[(Experimental|Deprecated)\\]`,
          'm'
        );
        if (!row.test(renderHelp(parent))) {
          unlabelled.push(`row ${fullName(leaf)}`);
        }
        if (!/^\[(Experimental|Deprecated)\]/.test(descriptionOf(leaf))) {
          unlabelled.push(`page ${fullName(leaf)}`);
        }
      }
    }
    expect(unlabelled).toEqual([]);
  });

  it('keeps the deprecated pair deprecated: the strongest label of the ancestry wins', () => {
    for (const verb of ['pull', 'push']) {
      const leaf = find(groups, ['config', verb, 'oauth2-agents']);
      expect(descriptionOf(leaf)).toMatch(/^\[Deprecated\]/);
    }
  });

  it('teaches no old group spelling in any usage example of any leaf', () => {
    const offenders = [];
    for (const leaf of leaves) {
      const examples = extractExamples(renderFullHelp(leaf));
      for (const example of examples) {
        if (/(^|\s)(frodo )?config-manager\s/.test(example)) {
          offenders.push(`${fullName(leaf)}: ${example}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('words the option descriptions with the new group: -F, --force-update names config push, and no option names the old group word', () => {
    const pushJourneys = find(groups, ['config', 'push', 'journeys']);
    const force = pushJourneys.options.find((o) => o.long === '--force-update');
    expect(force.description).toContain(
      'and the config push equivalents of previous commands.'
    );
    // the layout family keeps the word: the tool, the layout file, the layout setting and a tree
    const allowed =
      /fr-config-manager|frodo-config-manager\.json|config-manager-layout|config-manager trees?/g;
    const offenders = [];
    for (const command of allCommands(config)) {
      for (const option of command.options) {
        if (
          option.description.replace(allowed, '').includes('config-manager')
        ) {
          offenders.push(`${fullName(command)} ${option.flags}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('teaches no old group spelling on any help page of any command (the layout settings and fr-config-manager are not group spellings)', () => {
    const offenders = [];
    for (const command of allCommands(config)) {
      const help = renderFullHelp(command);
      for (const match of help
        .replace(ANSI, '')
        .matchAll(
          /(?<![\w-])(?:frodo )?config-manager (?:pull|push|delete|migrate|promote|export|import)(?![\w-])/g
        )) {
        offenders.push(`${fullName(command)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the sources of src', () => {
  const root = fileURLToPath(new URL('../../src', import.meta.url));

  /** Every .ts file below a folder, except the tests that sit next to the sources. */
  function sources(folder) {
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) return sources(full);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
        ? [full]
        : [];
    });
  }

  const OLD_SPELLING =
    /(?<![\w-])(?:frodo )?config-manager (?:pull|push|delete|migrate|promote)(?![\w-])/;

  it('name no command of the config group by the old group word, in a message, a hint, a description, an example or a comment (the allow-list is empty)', () => {
    const files = sources(root);
    expect(files.length).toBeGreaterThan(300);
    const offenders = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (OLD_SPELLING.test(line)) {
            offenders.push(
              `${path.relative(root, file)}:${index + 1}: ${line.trim()}`
            );
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('are found by the scan: it flags a line that carries the old spelling', () => {
    expect(OLD_SPELLING.test('use frodo config-manager pull cors')).toBe(true);
    expect(OLD_SPELLING.test('see config-manager push all')).toBe(true);
    // the tool, the layout and the file keep the word
    expect(OLD_SPELLING.test('fr-config-manager pull')).toBe(false);
    expect(OLD_SPELLING.test('frodo settings config-manager-layout')).toBe(
      false
    );
    expect(OLD_SPELLING.test('frodo-config-manager.json')).toBe(false);
    expect(OLD_SPELLING.test('a config-manager tree')).toBe(false);
  });
});
