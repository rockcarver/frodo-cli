import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import { getOneOfGroups } from '../../src/cli/ResolveInteractiveInputs.ts';
import {
  editableOptionalOptions,
  editableOptionsHint,
} from '../../src/utils/interactive/EditableOptions.ts';
import {
  activeConflicts,
  assertNoConflicts,
  commitOption,
  conflictsOf,
  forgetResolverChoices,
  hiddenNote,
  isActive,
  selectableMembers,
} from '../../src/utils/interactive/OptionConflicts.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';

/**
 * Interactive mode must not assemble a command line that the CLI itself
 * rejects (issue #967, cli record 0032). Commander checks `.conflicts()` while
 * it parses; the resolver (picked one-of members, editor values, saved
 * defaults, entity picks) writes options after that, so every write goes
 * through `commitOption`, and the hidden-member / editor / pick logic reads
 * the same rules from src/utils/interactive/OptionConflicts.ts.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** What the user typed: commander's own source for a value from argv. */
const typed = (command, name, value = true) =>
  command.setOptionValueWithSource(name, value, 'cli');

/** `-i, -a, -f` where -a conflicts with both of the others; -x is free. */
function build() {
  const command = new Command('control').exitOverride();
  command.addOption(new Option('-i, --id <id>').conflicts(['all']));
  command.addOption(new Option('-a, --all').conflicts(['id', 'file']));
  command.addOption(new Option('-f, --file <file>'));
  command.addOption(new Option('-x, --extra'));
  command.addOption(new Option('-d, --depth <n>').default('2'));
  return command;
}

describe('isActive and conflictsOf', () => {
  it('counts a value from the command line or the environment, not a default', () => {
    const command = build();
    expect(isActive(command, 'depth')).toBe(false);
    typed(command, 'depth', '5');
    expect(isActive(command, 'depth')).toBe(true);
    command.setOptionValueWithSource('extra', true, 'env');
    expect(isActive(command, 'extra')).toBe(true);
    expect(isActive(command, 'id')).toBe(false);
  });

  it('finds a conflict declared on either side', () => {
    const command = build();
    // -f never declares anything; -a declares it against -f
    expect(conflictsOf(command, 'file').map((o) => o.attributeName())).toEqual([
      'all',
    ]);
    expect(
      conflictsOf(command, 'all')
        .map((o) => o.attributeName())
        .sort()
    ).toEqual(['file', 'id']);
    expect(conflictsOf(command, 'extra')).toEqual([]);
  });

  it('lists only the conflicting options that hold a value', () => {
    const command = build();
    typed(command, 'file', 'out.json');
    expect(
      activeConflicts(command, 'all').map((o) => o.attributeName())
    ).toEqual(['file']);
    expect(activeConflicts(command, 'id')).toEqual([]);
  });
});

describe('commitOption', () => {
  it('sets an option that conflicts with nothing that is set', () => {
    const command = build();
    const result = commitOption(command, 'all', true);
    expect(result.status).toBe('committed');
    expect(command.getOptionValue('all')).toBe(true);
    expect(command.getOptionValueSource('all')).toBe('cli');
  });

  it('refuses a value that conflicts with an option the user typed, and changes nothing', () => {
    const command = build();
    typed(command, 'file', 'out.json');
    const result = commitOption(command, 'all', true);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy.attributeName()).toBe('file');
    expect(command.getOptionValue('all')).toBeUndefined();
    expect(command.getOptionValue('file')).toBe('out.json');
  });

  it('replaces a conflicting value that the resolver set earlier, back to its default', () => {
    const command = build();
    expect(commitOption(command, 'id', 'abc').status).toBe('committed');
    const result = commitOption(command, 'all', true);
    expect(result.status).toBe('committed');
    expect(result.cleared.map((o) => o.attributeName())).toEqual(['id']);
    expect(command.getOptionValue('id')).toBeUndefined();
    expect(isActive(command, 'id')).toBe(false);
    expect(command.getOptionValue('all')).toBe(true);
  });

  it('puts a replaced option with a default back to that default', () => {
    const command = new Command('control');
    command.addOption(
      new Option('-d, --depth <n>').default('2').conflicts(['all'])
    );
    command.addOption(new Option('-a, --all').conflicts(['depth']));
    expect(commitOption(command, 'depth', '9').status).toBe('committed');
    expect(commitOption(command, 'all', true).status).toBe('committed');
    expect(command.getOptionValue('depth')).toBe('2');
    expect(command.getOptionValueSource('depth')).toBe('default');
  });

  it('with replace: false, a saved default never overrides what the resolver set', () => {
    const command = build();
    expect(commitOption(command, 'id', 'abc').status).toBe('committed');
    const result = commitOption(command, 'all', true, { replace: false });
    expect(result.status).toBe('blocked');
    expect(command.getOptionValue('id')).toBe('abc');
  });

  it('drops the options a pick was scoped by, instead of being blocked by them', () => {
    const command = build();
    typed(command, 'all', true);
    // the loader read -a to narrow the list; the pick consumes it
    const result = commitOption(command, 'id', 'abc', { consume: ['all'] });
    expect(result.status).toBe('committed');
    expect(result.cleared.map((o) => o.attributeName())).toEqual(['all']);
    expect(command.getOptionValue('all')).toBeUndefined();
    expect(() => assertNoConflicts(command)).not.toThrow();
  });

  it('does not let a consumed name hide a different typed conflict', () => {
    const command = build();
    typed(command, 'all', true);
    typed(command, 'file', 'out.json');
    const result = commitOption(command, 'id', 'abc', { consume: ['file'] });
    expect(result.status).toBe('blocked');
    expect(result.blockedBy.attributeName()).toBe('all');
  });
});

describe('selectableMembers', () => {
  it('hides a member that conflicts with an option the user typed, and says which', () => {
    const command = build();
    typed(command, 'file', 'out.json');
    const { selectable, hidden } = selectableMembers(command, ['id', 'all']);
    expect(selectable).toEqual(['id']);
    expect(
      hidden.map((h) => [h.option.attributeName(), h.blockedBy.attributeName()])
    ).toEqual([['all', 'file']]);
    expect(hiddenNote(hidden)).toBe(
      'Not offered, because it cannot be combined with an option already given: -a, --all (with -f, --file <file>).'
    );
  });

  it('still offers a member whose only conflict is a value the resolver set', () => {
    const command = build();
    commitOption(command, 'id', 'abc');
    expect(selectableMembers(command, ['id', 'all']).selectable).toEqual([
      'id',
      'all',
    ]);
    forgetResolverChoices(command);
  });

  it('hides everything when every member is blocked', () => {
    const command = build();
    typed(command, 'file', 'out.json');
    typed(command, 'extra', true);
    command.addOption(new Option('-z, --zed').conflicts(['extra']));
    const { selectable, hidden } = selectableMembers(command, ['all', 'zed']);
    expect(selectable).toEqual([]);
    expect(hidden).toHaveLength(2);
  });
});

describe('assertNoConflicts', () => {
  /** What commander says for the same typed combination. */
  function commanderSays(argv) {
    const command = build();
    command.action(() => {});
    let error;
    try {
      command.parse(argv, { from: 'user' });
    } catch (e) {
      error = e;
    }
    return error;
  }

  it('passes when nothing conflicts', () => {
    const command = build();
    typed(command, 'id', 'abc');
    typed(command, 'extra', true);
    expect(() => assertNoConflicts(command)).not.toThrow();
  });

  it("fails with commander's own message and code for a conflict", () => {
    const expected = commanderSays(['-a', '-f', 'out.json']);
    expect(expected.code).toBe('commander.conflictingOption');
    const command = build().exitOverride();
    command.configureOutput({ writeErr: () => {}, outputError: () => {} });
    typed(command, 'all', true);
    typed(command, 'file', 'out.json');
    let thrown;
    try {
      assertNoConflicts(command);
    } catch (e) {
      thrown = e;
    }
    expect(thrown.code).toBe(expected.code);
    expect(thrown.message).toBe(expected.message);
  });

  it('names the environment variable when the conflicting value came from env', () => {
    const command = build().exitOverride();
    command.configureOutput({ writeErr: () => {}, outputError: () => {} });
    command.addOption(
      new Option('-e, --envy <v>').env('FRODO_TEST_ENVY').conflicts(['extra'])
    );
    command.setOptionValueWithSource('envy', 'v', 'env');
    typed(command, 'extra', true);
    expect(() => assertNoConflicts(command)).toThrow(
      /environment variable 'FRODO_TEST_ENVY'/
    );
  });
});

describe('across every command', () => {
  let leaves;
  beforeAll(async () => {
    ({ leaves } = await loadCommandTree());
  });

  /** Forget everything a previous step wrote to this command object. */
  function reset(command) {
    forgetResolverChoices(command);
    for (const option of command.options) {
      command.setOptionValueWithSource(
        option.attributeName(),
        Array.isArray(option.defaultValue)
          ? [...option.defaultValue]
          : option.defaultValue,
        'default'
      );
    }
  }

  it('offers exactly the one-of members that do not conflict with an option typed alone', () => {
    const problems = [];
    let checked = 0;
    for (const command of leaves) {
      const groups = getOneOfGroups(command);
      if (groups.length === 0) continue;
      for (const seed of command.options) {
        const seedName = seed.attributeName();
        reset(command);
        typed(command, seedName, true);
        for (const group of groups) {
          const { selectable, hidden } = selectableMembers(
            command,
            group.options
          );
          const expectedHidden = group.options.filter(
            (member) =>
              member !== seedName &&
              conflictsOf(command, member).some(
                (o) => o.attributeName() === seedName
              )
          );
          checked += 1;
          if (
            JSON.stringify(
              hidden.map((h) => h.option.attributeName()).sort()
            ) !== JSON.stringify([...expectedHidden].sort())
          ) {
            problems.push(
              `${fullName(command)} with ${seed.flags}: hid ${hidden.map((h) => h.option.flags)}`
            );
          }
          // every member still offered can be committed without a conflict
          for (const member of selectable) {
            if (member === seedName) continue;
            const result = commitOption(command, member, true);
            if (result.status !== 'committed') {
              problems.push(
                `${fullName(command)}: ${member} offered but blocked with ${seed.flags}`
              );
            }
            try {
              assertNoConflicts(command);
            } catch (error) {
              problems.push(
                `${fullName(command)}: ${member} + ${seed.flags}: ${error.message}`
              );
            }
            reset(command);
            typed(command, seedName, true);
          }
        }
      }
      reset(command);
    }
    expect(checked).toBeGreaterThan(500);
    expect(problems).toEqual([]);
  });

  it('keeps the editor list and its hint count in step, without options the user already blocked', () => {
    const problems = [];
    for (const command of leaves) {
      for (const seed of command.options) {
        if (conflictsOf(command, seed.attributeName()).length === 0) continue;
        reset(command);
        typed(command, seed.attributeName(), true);
        const offered = editableOptionalOptions(command).map((o) =>
          o.attributeName()
        );
        for (const other of conflictsOf(command, seed.attributeName())) {
          if (offered.includes(other.attributeName())) {
            problems.push(
              `${fullName(command)}: editor offers ${other.flags} beside ${seed.flags}`
            );
          }
        }
        if (editableOptionsHint(command) !== `→ ${offered.length} options`) {
          problems.push(`${fullName(command)}: hint differs from the list`);
        }
      }
      reset(command);
    }
    expect(problems).toEqual([]);
  });
});

describe('the resolver sets options only through commitOption', () => {
  it('has no other call to setOptionValueWithSource in src, except the preview shadows', () => {
    const allowed = new Set([
      'src/utils/interactive/OptionConflicts.ts',
      'src/utils/interactive/CommandPreview.ts',
    ]);
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          const rel = path.relative(ROOT, full).split(path.sep).join('/');
          const code = fs
            .readFileSync(full, 'utf8')
            .split('\n')
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join('\n');
          if (/\.setOptionValueWithSource\(/.test(code) && !allowed.has(rel))
            offenders.push(rel);
        }
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
