import { beforeAll, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  deferOneOfGroups,
  getOneOfGroups,
} from '../../src/cli/ResolveInteractiveInputs.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';
import { conflictViolations } from '../utils/OptionConflicts.js';

/**
 * `.conflicts()` must never contradict a command's option requirements.
 * Commander checks conflicts at parse time, before requireOneOf / requireAllOf
 * are evaluated, so a conflict can make a requirement unsatisfiable (for
 * example `-a` conflicting with a forced `-i` leaves `-a` unusable) or can
 * silently do nothing (a target that names no option). The rules are in
 * test/utils/OptionConflicts.js; the reasoning is in ADR 0032.
 *
 * This test cannot judge whether a conflict is right. Whether an option such
 * as --set-id really is ignored in the branch of -i is a review question: read
 * the action before declaring a conflict between a one-of member and a
 * modifier (see .github/instructions/cli-commands.instructions.md).
 */

const HOW_TO_FIX =
  'Fix the .conflicts() / requireOneOf / requireAllOf declarations in src/cli/...: ' +
  'a conflict must name an option of the same command (attribute name, camelCase), ' +
  'and must not make a required or one-of option unusable. See docs/decisions/0032-*.md.';

/** A command with plain commander options and requirement groups, for the seeded-defect controls. */
function build({ options, groups = [] }) {
  const command = new Command('control');
  for (const [flags, conflicts = [], mandatory = false] of options) {
    const option = new Option(flags).conflicts(conflicts);
    if (mandatory) option.makeOptionMandatory();
    command.addOption(option);
  }
  for (const group of groups) deferOneOfGroups(command, [group]);
  return command;
}

const rules = (command) => conflictViolations(command).map((v) => v.rule);

describe('conflictViolations (seeded defects)', () => {
  it('accepts mutually exclusive members of a requireOneOf group', () => {
    const command = build({
      options: [
        ['-i, --id <id>', ['all']],
        ['-a, --all', ['id']],
      ],
      groups: [{ options: ['id', 'all'], all: false }],
    });
    expect(conflictViolations(command)).toEqual([]);
  });

  it('accepts a modifier that conflicts with a non-forced option', () => {
    const command = build({
      options: [
        ['-f, --file <file>', ['allSeparate']],
        ['-A, --all-separate', ['file']],
        ['-a, --all'],
      ],
      groups: [{ options: ['file', 'all', 'allSeparate'], all: false }],
    });
    expect(conflictViolations(command)).toEqual([]);
  });

  it('flags an option that conflicts with a requireAllOf member', () => {
    // esv secret version delete after #957: -a conflicted with the forced -i.
    const command = build({
      options: [
        ['-i, --secret-id <id>', ['all']],
        ['-v, --version <v>'],
        ['-a, --all', ['secretId']],
      ],
      groups: [{ options: ['secretId', 'version'], all: true }],
    });
    expect(rules(command)).toEqual(['unusable-option']);
  });

  it('flags two requireAllOf members that conflict', () => {
    const command = build({
      options: [['-i, --id <id>', ['version']], ['-v, --version <v>']],
      groups: [{ options: ['id', 'version'], all: true }],
    });
    expect(rules(command)).toContain('forced-conflict');
    expect(rules(command)).toContain('unsatisfiable');
  });

  it('flags a requireOneOf member that a mandatory option makes unselectable', () => {
    const command = build({
      options: [
        ['-f, --file <f>', [], true],
        ['-a, --all', ['file']],
        ['-i, --id <id>'],
      ],
      groups: [{ options: ['all', 'id'], all: false }],
    });
    expect(rules(command)).toContain('unusable-option');
  });

  it('flags a requireOneOf member blocked through another group', () => {
    const command = build({
      options: [
        ['-x, --xa <x>', ['p', 'q']],
        ['-y, --ya'],
        ['-p, --p <p>'],
        ['-q, --q <q>'],
      ],
      groups: [
        { options: ['xa', 'ya'], all: false },
        { options: ['p', 'q'], all: false },
      ],
    });
    expect(rules(command)).toContain('unusable-option');
  });

  it('flags a conflict target that names no option, including the no-x spelling', () => {
    const command = build({
      options: [['--log-api-key [key]', ['noLogApi']], ['--no-log-api']],
    });
    expect(rules(command)).toEqual(['dangling-conflict']);
  });

  it('flags a requireOneOf member that is not an option', () => {
    const command = build({
      options: [['-i, --id <id>']],
      groups: [{ options: ['allSeparate', 'id'], all: false }],
    });
    expect(rules(command)).toEqual(['unknown-group-member']);
  });
});

describe('every real command', () => {
  let leaves = [];

  beforeAll(async () => {
    ({ leaves } = await loadCommandTree());
  });

  it('loads the whole tree, so the check below cannot pass vacuously', () => {
    const withConflicts = leaves.filter((leaf) =>
      leaf.options.some((o) => (o.conflictsWith ?? []).length > 0)
    );
    const withGroups = leaves.filter((leaf) => getOneOfGroups(leaf).length > 0);
    expect(leaves.length).toBeGreaterThan(250);
    expect(withConflicts.length).toBeGreaterThan(90);
    expect(withGroups.length).toBeGreaterThan(90);
  });

  it('declares conflicts that never contradict its option requirements', () => {
    const found = leaves.flatMap((leaf) =>
      conflictViolations(leaf).map(
        (v) => `${fullName(leaf)}: [${v.rule}] ${v.message}`
      )
    );
    expect({ found, howToFix: found.length ? HOW_TO_FIX : undefined }).toEqual({
      found: [],
      howToFix: undefined,
    });
  });
});
