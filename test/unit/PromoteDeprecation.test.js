import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  leafCommands,
  loadCommandTree,
  resolveCommand,
} from '../utils/CommandExamples.js';

const { FrodoStubCommand } = await import('../../src/cli/FrodoCommand.ts');
const { PROMOTE_DEPRECATION_MESSAGE } =
  await import('../../src/cli/promote/promote.ts');

/**
 * The root `frodo promote` is deprecated and frozen (cli#1263): it never ran a
 * promotion of Advanced Identity Cloud, it compares two local directories of a
 * frodo export. It stays as it was, prints a deprecation notice that names the
 * replacements and says when it goes away (5.0.0), and gets no new option. The
 * replacements the notice names must exist, so a rename of one of them fails
 * here and not for a user who follows the notice.
 */

let groups;
let promote;
beforeAll(async () => {
  ({ groups } = await loadCommandTree());
  promote = groups.find((group) => group.name() === 'promote');
});

afterEach(() => {
  jest.restoreAllMocks();
  process.exitCode = undefined;
});

describe('frodo promote is deprecated', () => {
  it('1: the description says it is deprecated, that it does not run a platform promotion, and where to go', () => {
    const description = promote.description();
    expect(
      description.startsWith(
        'Deprecated: this command does not run a platform promotion'
      )
    ).toBe(true);
    expect(description).toContain('frodo config-manager promote run-promotion');
    expect(description).toContain('removed in 5.0.0');
  });

  it('2: the old description, "Prepares a tenant to be promoted", is gone', () => {
    expect(promote.description()).not.toContain(
      'Prepares a tenant to be promoted'
    );
  });

  it('3: a run prints the deprecation notice with the replacements, and otherwise behaves as before', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-promote-'));
    const savedHome = process.env.HOME;
    process.env.HOME = home;
    const printed = [];
    jest
      .spyOn(console, 'error')
      .mockImplementation((text) => printed.push(String(text)));
    jest
      .spyOn(console, 'log')
      .mockImplementation((text) => printed.push(String(text)));
    try {
      const root = new FrodoStubCommand('frodo');
      root.addCommand(promote);
      // no -M and no -e: the command refuses before it connects to anything
      await root.parseAsync(['node', 'frodo', 'promote']);
    } finally {
      process.env.HOME = savedHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
    const output = printed.join('\n');
    expect(output).toContain("Deprecated feature in use: 'frodo promote'.");
    expect(output).toContain(PROMOTE_DEPRECATION_MESSAGE);
    // as before: it asks for the two directories and fails with exit code 1
    expect(output).toContain(
      'Need to designate a master dir (-M) and an export dir (-e).'
    );
    expect(process.exitCode).toBe(1);
  });

  it('4: the notice names the three replacements and the version of the removal', () => {
    expect(PROMOTE_DEPRECATION_MESSAGE).toContain('will be removed in 5.0.0');
    expect(PROMOTE_DEPRECATION_MESSAGE).toContain(
      "'frodo config-manager promote run-promotion'"
    );
    expect(PROMOTE_DEPRECATION_MESSAGE).toContain(
      "'frodo config import -A -D <master> <connection>'"
    );
    expect(PROMOTE_DEPRECATION_MESSAGE).toContain(
      "'frodo config-manager push'"
    );
    expect(PROMOTE_DEPRECATION_MESSAGE).toContain(
      "'frodo config-manager delete <kind> -n <name>'"
    );
  });
});

describe('the replacements that the notice names exist', () => {
  /** Every `'frodo ...'` command line that the notice puts in single quotes. */
  const named = [
    ...PROMOTE_DEPRECATION_MESSAGE.matchAll(/'(frodo [^']+)'/g),
  ].map((match) => match[1]);
  /** `frodo config import -A -D <master> <connection>` -> the words of the command, and the options it names. */
  const parse = (line) => {
    const words = [];
    const flags = [];
    for (const token of line.split(/\s+/)) {
      // a placeholder (<kind>, <master>) is no word of the command and no option
      if (token.startsWith('<')) continue;
      if (token.startsWith('-')) flags.push(token);
      else if (flags.length === 0) words.push(token);
    }
    return { words, flags };
  };
  const hasOption = (command, flag) =>
    command.options.some(
      (option) => option.long === flag || option.short === flag
    );

  it('5: the notice names the commands we expect (a command dropped from the notice fails here)', () => {
    expect(named).toEqual([
      'frodo config-manager promote run-promotion',
      'frodo config import -A -D <master> <connection>',
      'frodo config-manager push',
      'frodo config-manager delete <kind> -n <name>',
    ]);
  });

  it('6: every command the notice names exists in the command tree, with the options the notice names', () => {
    for (const line of named) {
      const { words, flags } = parse(line);
      const command = resolveCommand(groups, words)?.command;
      expect({ line, found: command !== undefined }).toEqual({
        line,
        found: true,
      });
      // an option on a command group is an option of every command of the group (config-manager delete <kind> -n)
      const targets =
        command.commands.length > 0
          ? leafCommands(command).filter((leaf) => leaf.name() !== 'test')
          : [command];
      expect(targets.length).toBeGreaterThan(0);
      for (const flag of flags) {
        // -D is a runtime option that every command has
        if (flag === '-D') continue;
        for (const target of targets) {
          expect({
            line,
            command: target.name(),
            flag,
            has: hasOption(target, flag),
          }).toEqual({
            line,
            command: target.name(),
            flag,
            has: true,
          });
        }
      }
    }
  });

  it('7: frodo config import has --static for what a promotion carries (the notice says so in the help)', () => {
    const command = resolveCommand(
      groups,
      ['config', 'import'].reduce((all, w) => [...all, w], ['frodo'])
    )?.command;
    expect(command).toBeDefined();
    expect(hasOption(command, '--static')).toBe(true);
  });
});

describe('the freeze: no new option', () => {
  it('8: the own options of frodo promote are the ones it had (a new option fails here and needs a decision)', async () => {
    const { FrodoCommand } = await import('../../src/cli/FrodoCommand.ts');
    const { frodo } = await import('@rockcarver/frodo-lib');
    const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
      frodo.utils.constants;
    // a command built the same way, without any option of its own: what FrodoCommand adds to every command
    const bare = new FrodoCommand(
      'probe',
      [],
      [CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY]
    );
    const name = (option) => option.long ?? option.short;
    const common = new Set(bare.options.map(name));
    const own = promote.options
      .filter((option) => !common.has(name(option)))
      .map(name)
      .sort();
    expect(own).toEqual(
      [
        '--allow-failures',
        '--effect-secrets',
        '--frodo-export-dir',
        '--master-dir',
        '--no-prune',
        '--no-validate',
        '--print-diff',
        '--prompt-prune',
        '--propmt-prune',
        '--wait-secrets',
        '--what-if',
        '--yes',
      ].sort()
    );
  });
});
