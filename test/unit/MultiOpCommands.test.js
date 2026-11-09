import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  ALLOW_FAILURES_HELP,
  ALLOW_FAILURES_OPTION,
} from '../../src/utils/OperationRun.ts';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';
import {
  CONTINUES_BUT_EXITS_ZERO,
  CONTINUES_BUT_NAMES_NO_FAILED_ITEM,
  LEGACY_MULTI_OP_COMMANDS_WITHOUT_ALLOW_FAILURES,
  NAMES_THE_FAILURES_BUT_HAS_NO_SUMMARY,
  NOT_MULTI_OP_BULK_CANDIDATES,
  STOPS_AT_THE_FIRST_ERROR,
  SWALLOWS_THE_FAILURE,
} from './MultiOpCommandExceptions.js';

/**
 * Decision record 0040: a command that performs several operations (the items
 * of a bulk, the steps of an "all" command, a loop over the items of a kind)
 * runs every independent one, prints one summary of what failed, exits 1 if any
 * failed, and accepts `--allow-failures` to keep the exit code at 0.
 *
 * This test checks the part of the rule that shows in the command tree: which
 * commands can perform several operations, and that each of them accepts
 * `--allow-failures`. The command tree is built the way src/app.ts builds it.
 * A command is a candidate when it has a bulk option (-a, -A, --all,
 * --all-separate) or sits under config-manager pull, push, delete or migrate
 * (those loop over the items of a kind without a bulk option).
 *
 * Every candidate is one of:
 * - a command that accepts `--allow-failures`;
 * - a multi-op command that does not yet, in
 *   LEGACY_MULTI_OP_COMMANDS_WITHOUT_ALLOW_FAILURES (MultiOpCommandExceptions.js).
 *   That list can only shrink: when a command accepts the option, the test
 *   fails until its line is removed;
 * - a command that performs one operation, in NOT_MULTI_OP_BULK_CANDIDATES.
 *
 * Some multi-op commands have neither a bulk option nor a config-manager
 * path (the admin helpers, ...). They are found only through the legacy list,
 * so the test also checks that every listed command exists.
 *
 * What this does not check: what a command does when an operation fails (the
 * others run, the failure is named, the exit code is 1, `--allow-failures`
 * gives 0). The shared option (`FrodoCommand.multiOp()`) and the summary
 * (`OperationRun`) are tested on their own (OperationRun.test.js), and the
 * scenario for each migrated command is a test of its own, such as the failing
 * steps in ConfigManagerAllRemoteProxies.test.js (tracked in frodo-cli#1099).
 */

const OPTION = ALLOW_FAILURES_OPTION;
const LEGACY_FILE = 'test/unit/MultiOpCommandExceptions.js';
const FAMILIES = [
  'frodo config-manager pull ',
  'frodo config-manager push ',
  'frodo config-manager delete ',
  'frodo config-manager migrate ',
];
const HOW_TO_FIX =
  'A command that performs several operations accepts --allow-failures (decision record 0040). ' +
  'Call .multiOp() on the command (it adds the shared option; do not declare your own) ' +
  'and run the operations through OperationRun (src/utils/OperationRun.ts). ' +
  `If this command performs ONE operation, add it to NOT_MULTI_OP_BULK_CANDIDATES in ${LEGACY_FILE}. ` +
  'Do not add it to the legacy lists: they only shrink.';

function hasBulkOption(leaf) {
  return leaf.options.some(
    (option) =>
      ['--all', '--all-separate'].includes(option.long) ||
      ['-a', '-A'].includes(option.short)
  );
}

function isCandidate(leaf) {
  const name = fullName(leaf);
  return (
    hasBulkOption(leaf) || FAMILIES.some((family) => name.startsWith(family))
  );
}

const declaresAllowFailures = (leaf) =>
  leaf.options.some((option) => option.long === OPTION);

/** The distinct ways `--allow-failures` is declared: flags and help text. */
function allowFailuresDeclarations(leaves) {
  return [
    ...new Set(
      leaves.flatMap((leaf) =>
        leaf.options
          .filter((option) => option.long === OPTION)
          .map((option) => `${option.flags} | ${option.description}`)
      )
    ),
  ];
}

const LEGACY = LEGACY_MULTI_OP_COMMANDS_WITHOUT_ALLOW_FAILURES;
const LISTS = {
  STOPS_AT_THE_FIRST_ERROR,
  SWALLOWS_THE_FAILURE,
  CONTINUES_BUT_NAMES_NO_FAILED_ITEM,
  CONTINUES_BUT_EXITS_ZERO,
  NAMES_THE_FAILURES_BUT_HAS_NO_SUMMARY,
  NOT_MULTI_OP_BULK_CANDIDATES,
};

let leaves = [];
let byName = new Map();

beforeAll(async () => {
  leaves = await loadLeafCommands();
  byName = new Map(leaves.map((leaf) => [fullName(leaf), leaf]));
});

describe('multi-op commands accept --allow-failures', () => {
  it('finds the candidates of the command tree', () => {
    const candidates = leaves.filter(isCandidate).map(fullName);
    expect(candidates.length).toBeGreaterThan(150);
    // anchors: bulk options, a config-manager loop, one that is not a candidate
    expect(candidates).toContain('frodo journey export');
    expect(candidates).toContain('frodo config-manager pull all-static');
    expect(candidates).toContain('frodo config-manager migrate applications');
    expect(candidates).toContain('frodo esv secret delete');
    expect(candidates).not.toContain('frodo journey list');
    expect(candidates).not.toContain('frodo idm remote-proxy test');
  });

  it('classifies every candidate: it accepts the option, or it is listed', () => {
    const listed = new Set([...LEGACY, ...NOT_MULTI_OP_BULK_CANDIDATES]);
    const unclassified = leaves
      .filter(isCandidate)
      .filter((leaf) => !declaresAllowFailures(leaf))
      .map(fullName)
      .filter((name) => !listed.has(name));
    if (unclassified.length > 0) {
      throw new Error(
        `These commands can perform several operations and do not accept ${OPTION}:\n` +
          unclassified.map((name) => `  ${name}`).join('\n') +
          `\n\n${HOW_TO_FIX}`
      );
    }
  });

  it('lists only commands that exist', () => {
    const missing = [...LEGACY, ...NOT_MULTI_OP_BULK_CANDIDATES].filter(
      (name) => !byName.has(name)
    );
    if (missing.length > 0) {
      throw new Error(
        `These listed commands do not exist (renamed or removed). Remove them from ${LEGACY_FILE}:\n` +
          missing.map((name) => `  ${name}`).join('\n')
      );
    }
  });

  it('keeps the legacy lists to commands that still lack the option, so they can only shrink', () => {
    const done = LEGACY.filter(
      (name) => byName.has(name) && declaresAllowFailures(byName.get(name))
    );
    if (done.length > 0) {
      throw new Error(
        `These commands accept ${OPTION} now. Remove them from ${LEGACY_FILE}:\n` +
          done.map((name) => `  ${name}`).join('\n')
      );
    }
  });

  it('keeps the single-operation list to candidates that do not accept the option', () => {
    const candidates = new Set(leaves.filter(isCandidate).map(fullName));
    const stale = NOT_MULTI_OP_BULK_CANDIDATES.filter(
      (name) =>
        byName.has(name) &&
        (declaresAllowFailures(byName.get(name)) || !candidates.has(name))
    );
    if (stale.length > 0) {
      throw new Error(
        `These commands accept ${OPTION} (so they perform several operations) or are not candidates any more. Remove them from NOT_MULTI_OP_BULK_CANDIDATES in ${LEGACY_FILE}:\n` +
          stale.map((name) => `  ${name}`).join('\n')
      );
    }
  });

  it('lists no command twice, and none in both the legacy lists and the single-operation list', () => {
    const all = [...LEGACY, ...NOT_MULTI_OP_BULK_CANDIDATES];
    expect(all.filter((name, i) => all.indexOf(name) !== i)).toEqual([]);
  });

  it('keeps every list sorted, one command per line', () => {
    for (const [name, list] of Object.entries(LISTS)) {
      expect({ [name]: list }).toEqual({ [name]: [...list].sort() });
    }
  });

  it('declares the option the shared way on every command that has it: one flag, one help text', () => {
    const declared = allowFailuresDeclarations(leaves);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toEqual([`${OPTION} | ${ALLOW_FAILURES_HELP}`]);
  });
});

describe('commands that call .multiOp()', () => {
  const cliDir = path.resolve(import.meta.dirname, '../../src/cli');
  const files = fs
    .readdirSync(cliDir, { recursive: true })
    .filter((file) => String(file).endsWith('.ts'))
    .map((file) => path.join(cliDir, String(file)));

  it('are found', () => {
    const callers = files.filter((file) =>
      fs.readFileSync(file, 'utf8').includes('.multiOp()')
    );
    expect(callers.length).toBeGreaterThan(5);
  });

  it('pass options.allowFailures on to their ops function, because the option does nothing otherwise', () => {
    const missing = files
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return (
          source.includes('.multiOp()') &&
          !source.includes('options.allowFailures')
        );
      })
      .map((file) => path.relative(cliDir, file));
    expect(missing).toEqual([]);
  });
});

describe('hasBulkOption()', () => {
  const withOption = (option) => ({ options: [option] });

  it.each([
    [{ long: '--all' }],
    [{ long: '--all-separate' }],
    [{ short: '-a', long: '--alias' }],
    [{ short: '-A' }],
  ])('is true for %j', (option) => {
    expect(hasBulkOption(withOption(option))).toBe(true);
  });

  it.each([
    [{ short: '-i', long: '--journey-id' }],
    [{ long: '--all-realms-here' }],
    [{ short: '-f', long: '--file' }],
  ])('is false for %j', (option) => {
    expect(hasBulkOption(withOption(option))).toBe(false);
  });

  it('is false for a command without options', () => {
    expect(hasBulkOption({ options: [] })).toBe(false);
  });
});

describe('allowFailuresDeclarations()', () => {
  const leaf = (flags, description) => ({
    options: [{ long: OPTION, flags, description }],
  });

  it('is empty when no command declares the option', () => {
    expect(allowFailuresDeclarations([{ options: [] }])).toEqual([]);
  });

  it('counts one declaration for commands that declare it identically', () => {
    expect(
      allowFailuresDeclarations([
        leaf(OPTION, 'Report failures but exit 0.'),
        leaf(OPTION, 'Report failures but exit 0.'),
      ])
    ).toHaveLength(1);
  });

  it('counts two when a command words the help differently', () => {
    expect(
      allowFailuresDeclarations([
        leaf(OPTION, 'Report failures but exit 0.'),
        leaf(OPTION, 'Do not fail.'),
      ])
    ).toHaveLength(2);
  });
});
