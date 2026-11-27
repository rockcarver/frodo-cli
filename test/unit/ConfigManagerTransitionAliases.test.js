import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { getAliasKind } from '../../src/cli/FrodoCommand.ts';
import {
  fullName,
  leafCommands,
  loadCommandTree,
  resolveCommand,
} from '../utils/CommandExamples.js';
import {
  ALL_RENAMES,
  noticeFor,
} from '../utils/ConfigManagerRenames.js';

/**
 * The old name of every renamed command of `frodo config pull|push|delete|migrate|promote` is a transition alias
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md,
 * the old name of a renamed command stays as a transition alias): it finds the
 * command of the new name, the help ends with `(formerly: old)`, and typing it
 * prints one notice on stderr, once per process, while stdout and the exit code
 * stay as they were. The table is test/utils/ConfigManagerRenames.js.
 *
 * Every e2e test keeps typing the old words, so this is also what keeps a
 * recording from being orphaned: E2eTypedCommandsResolve.test.js checks the
 * typed commands against the same tree.
 */

// eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
const ANSI = /\x1b\[[0-9;]*m/g;

/** The rendered help of a command, without colours, a wrapped description joined to one line. */
function renderHelp(command) {
  let text = '';
  command.configureOutput({
    writeOut: (chunk) => (text += chunk),
    writeErr: () => {},
  });
  command.outputHelp();
  return text.replace(ANSI, '').replace(/\n {10,}(?=\S)/g, ' ');
}

/** Every command of the tree: the groups, the stubs between them and the leaves. */
function allCommands(command) {
  return [command, ...command.commands.flatMap(allCommands)];
}

const label = ([verb, oldName, newName]) =>
  `config ${verb} ${oldName} -> ${newName}`;

describe('the renamed commands of the config group', () => {
  let groups;
  let configGroup;
  const originalArgv = process.argv;

  beforeAll(async () => {
    // the usage examples are only rendered for -hhh (see FrodoCommand.addHelpText)
    process.argv = [...originalArgv, '--help-all'];
    ({ groups } = await loadCommandTree());
    configGroup = groups.find((group) => group.name() === 'config');
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  /** The leaf of `frodo config <verb> <word>` by name or alias. */
  const find = (verb, word) =>
    resolveCommand(groups, ['frodo', 'config', verb, word])?.command;

  it('are found where the table looks: the tree has the commands of every verb', () => {
    // so the checks below cannot silently run over nothing
    expect(configGroup).toBeDefined();
    expect(ALL_RENAMES.length).toBeGreaterThanOrEqual(22);
    for (const verb of ['pull', 'push', 'delete', 'migrate', 'promote']) {
      expect(configGroup.commands.some((c) => c.name() === verb)).toBe(true);
    }
  });

  describe.each(ALL_RENAMES.map((row) => [label(row), ...row]))(
    '%s',
    (_label, verb, oldName, newName) => {
      it('(a) finds the command of the new name when the old name is typed', () => {
        const typed = find(verb, oldName);
        expect(typed).toBeDefined();
        expect(fullName(typed)).toBe(`frodo config ${verb} ${newName}`);
        expect(find(verb, newName)).toBe(typed);
        expect(typed.commands).toHaveLength(0);
      });

      it('(b) records the old name as a transition alias, the only alias', () => {
        const command = find(verb, newName);
        expect(command.aliases()).toEqual([oldName]);
        expect(getAliasKind(command, oldName)).toBe('transition');
      });

      it('(c) ends the description with (formerly: old), in the list and on the page', () => {
        const command = find(verb, newName);
        const group = command.parent;
        const note = `(formerly: ${oldName})`;
        expect(
          group.createHelp().subcommandDescription(command).endsWith(note)
        ).toBe(true);
        expect(
          command.createHelp().commandDescription(command).endsWith(note)
        ).toBe(true);
        // the row of the list names the new name, not the old one
        expect(group.createHelp().subcommandTerm(command)).toBe(newName);
        expect(renderHelp(group)).toMatch(
          new RegExp(`^ {2}${newName} {2,}.*\\(formerly: ${oldName}\\)$`, 'm')
        );
        expect(renderHelp(command)).toContain(
          `Usage: config ${verb} ${newName} `
        );
      });

      it('(d) leaves no command of the group with the old name as its name', () => {
        const group = configGroup.commands.find((c) => c.name() === verb);
        expect(group.commands.map((c) => c.name())).not.toContain(oldName);
        expect(group.commands.map((c) => c.name())).toContain(newName);
      });

      it('(e) runs the command, prints the notice once on stderr, and changes neither stdout nor the exit code', async () => {
        const command = find(verb, newName);
        const group = command.parent;
        // a probe in place of the run: the registration, the alias and the dispatch of the real tree are used, the login is not
        const ran = [];
        const original = command._parseCommand;
        command._parseCommand = () => {
          ran.push(command.name());
        };
        const errors = [];
        const outputs = [];
        const exitCode = process.exitCode;
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
        try {
          // the group under config is a stub that dispatches by the word typed
          await group._dispatchSubcommand(oldName, [], []);
          await group._dispatchSubcommand(oldName, [], []);
          expect(ran).toEqual([newName, newName]);
          expect(errors.map((line) => line.replace(ANSI, ''))).toEqual([
            noticeFor(oldName, newName),
          ]);
          // the new name prints nothing, and neither does anything else of the run
          await group._dispatchSubcommand(newName, [], []);
          expect(ran).toEqual([newName, newName, newName]);
          expect(errors).toHaveLength(1);
          expect(outputs).toEqual([]);
          expect(process.exitCode).toBe(exitCode);
        } finally {
          command._parseCommand = original;
          jest.restoreAllMocks();
        }
      });
    }
  );

  it('(f) teaches no old spelling on any help page of any command', () => {
    const OLD_NAMES = [...new Set(ALL_RENAMES.map(([, oldName]) => oldName))];
    const verbs = [...new Set(ALL_RENAMES.map(([verb]) => verb))];
    const spelling = new RegExp(
      `\\b(?:config-manager )?(?:${verbs.join('|')}) (?:${OLD_NAMES.join('|')})(?![\\w-])`,
      'g'
    );
    const offenders = [];
    for (const command of groups.flatMap(allCommands)) {
      const help = renderHelp(command);
      for (const match of help.matchAll(spelling)) {
        offenders.push(`${fullName(command)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('(g) lists no other command as renamed than the table says', () => {
    const found = [];
    for (const command of leafCommands(configGroup)) {
      for (const alias of command.aliases()) {
        if (getAliasKind(command, alias) === 'transition') {
          found.push(`${command.parent.name()} ${alias} -> ${command.name()}`);
        }
      }
    }
    expect(found.sort()).toEqual(
      ALL_RENAMES.map(
        ([verb, oldName, newName]) => `${verb} ${oldName} -> ${newName}`
      ).sort()
    );
  });
});
