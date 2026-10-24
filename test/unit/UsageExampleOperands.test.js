import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Command } from 'commander';
import { deferOneOfGroups } from '../../src/cli/ResolveInteractiveInputs.ts';
import { deferEntityPicks } from '../../src/utils/interactive/EntityPickers.ts';
import {
  exampleViolations,
  extractExamples,
  fullName,
  hasUnbalancedQuote,
  loadCommandTree,
  looksLikeRealm,
  parseExample,
  renderFullHelp,
  resolveCommand,
  splitSegments,
  staleEntries,
  tokenize,
  unlistedViolations,
} from '../utils/CommandExamples.js';
import { LEGACY_EXAMPLE_VIOLATIONS } from './UsageExampleOperandsLegacyExceptions.js';

/**
 * A usage example must run as written and must not open an interactive mode:
 * someone copies it into a script or a terminal and expects it to do what the
 * sentence above it says, without a picker asking questions first. The rules
 * (see exampleViolations in test/utils/CommandExamples.js):
 *
 * - the command exists and every flag is one of its options;
 * - the second operand of a command with `[host] [realm] [username]
 *   [password]` is the realm: with host, user and password alone the CLI
 *   reads the user name as the realm and the password as the user name, so
 *   the example logs in as nobody (a host or profile alone is not judged here:
 *   an omitted realm uses the deployment default if no other required input
 *   prompts for completion);
 * - an entity picker or a requireOneOf / requireAllOf group is satisfied by an
 *   option, so no picker or options editor opens;
 * - no quote is left open.
 *
 * Examples that break a rule today are listed in
 * UsageExampleOperandsLegacyExceptions.js, which can only shrink.
 */

const LEGACY_FILE = 'test/unit/UsageExampleOperandsLegacyExceptions.js';
const HOW_TO_FIX =
  'Fix the example (src/cli/...): it must run as written and open no picker. ' +
  "Operands are positional, so with a user name the realm comes second: `<amBaseUrl> <realm> <username> '<password>'` " +
  '(sample values in src/help/SampleData.ts); name the target (`-i`, `-a`, ...) of every command that picks an entity; ' +
  'only flags the command defines. See .github/instructions/cli-commands.instructions.md.';

const originalArgv = process.argv;
let found = [];
let exampleCount = 0;

/** Checks one example line of `leaf`'s help against every rule. */
function check(groups, line) {
  const problems = [];
  if (hasUnbalancedQuote(line)) {
    problems.push({
      command: 'frodo',
      rule: 'unbalanced-quote',
      message: 'has a quote that is never closed.',
    });
    return problems;
  }
  for (const segment of splitSegments(tokenize(line))) {
    const target = resolveCommand(groups, segment);
    if (!target) {
      problems.push({
        command: 'frodo',
        rule: 'unknown-command',
        message: `"${segment.slice(0, 3).join(' ')}" does not lead to a command.`,
      });
      continue;
    }
    exampleViolations(target.command, target.args).forEach((violation) =>
      problems.push({ command: fullName(target.command), ...violation })
    );
  }
  return problems;
}

beforeAll(async () => {
  // The examples are only rendered for -hhh (see FrodoCommand.addHelpText).
  process.argv = [...originalArgv, '--help-all'];
  const { groups, leaves } = await loadCommandTree();
  found = [];
  exampleCount = 0;
  for (const leaf of leaves) {
    for (const line of extractExamples(renderFullHelp(leaf))) {
      exampleCount++;
      check(groups, line).forEach((problem) =>
        found.push({ example: line, ...problem })
      );
    }
  }
});

afterAll(() => {
  process.argv = originalArgv;
});

describe('usage examples of the real commands', () => {
  it('checks the examples of the real command tree', () => {
    // Guards against the check silently running on nothing.
    expect(exampleCount).toBeGreaterThan(150);
  });

  it('runs every example as written, without opening an interactive mode', () => {
    const unexpected = unlistedViolations(found, LEGACY_EXAMPLE_VIOLATIONS);
    if (unexpected.length > 0) {
      throw new Error(
        `${unexpected.length} usage example(s) are wrong or would open an interactive mode:\n\n` +
          unexpected
            .map(
              (p) =>
                `  ${p.command}: ${p.example}\n    [${p.rule}] ${p.message}`
            )
            .join('\n') +
          `\n\n${HOW_TO_FIX}\nDo not add an example to ${LEGACY_FILE}: that list only shrinks.`
      );
    }
  });

  it('keeps the legacy list honest', () => {
    const fixed = staleEntries(found, LEGACY_EXAMPLE_VIOLATIONS);
    if (fixed.length > 0) {
      throw new Error(
        `These examples no longer break the rule they are listed for (fixed, changed or gone). Remove them from ${LEGACY_FILE}:\n` +
          fixed.map((e) => `  [${e.rule}] ${e.example}`).join('\n')
      );
    }
    const keys = LEGACY_EXAMPLE_VIOLATIONS.map(
      (e) => `${e.rule}\n${e.example}`
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(LEGACY_EXAMPLE_VIOLATIONS.every((e) => e.reason)).toBe(true);
  });
});

describe('the legacy list (a ratchet that works when the list is empty)', () => {
  const bad = { rule: 'unknown-option', example: 'frodo a -z' };
  const other = { rule: 'one-of-missing', example: 'frodo b' };

  it('lets the check pass when nothing is broken and nothing is listed', () => {
    expect(unlistedViolations([], [])).toEqual([]);
    expect(staleEntries([], [])).toEqual([]);
  });

  it('fails a broken example that is not listed, with an empty list too', () => {
    expect(unlistedViolations([bad], [])).toEqual([bad]);
    expect(unlistedViolations([bad, other], [bad])).toEqual([other]);
  });

  it('matches on the rule as well as the example', () => {
    expect(
      unlistedViolations([bad], [{ ...bad, rule: 'one-of-missing' }])
    ).toEqual([bad]);
  });

  it('fails a listed example that is fixed, changed or gone', () => {
    expect(staleEntries([], [bad])).toEqual([bad]);
    expect(staleEntries([other], [bad, other])).toEqual([bad]);
    expect(staleEntries([{ ...bad, example: 'frodo a -y' }], [bad])).toEqual([
      bad,
    ]);
  });

  it('accepts a listed example that is still broken', () => {
    expect(unlistedViolations([bad], [bad])).toEqual([]);
    expect(staleEntries([bad], [bad])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The rules themselves, on small commands, so each one is pinned on its own.
// ---------------------------------------------------------------------------

function thing(...names) {
  const command = new Command('list');
  new Command('thing').addCommand(command);
  names.forEach((name) => command.argument(`[${name}]`));
  command
    .option('-i, --thing-id <id>')
    .option('-a, --all')
    .option('-f, --file <file>')
    .option('-n, --no-deps')
    .option('-v, --verbose');
  return command;
}
const withRealm = () => thing('host', 'realm', 'username', 'password');
const rulesOf = (command, ...args) =>
  exampleViolations(command, args).map((v) => v.rule);

describe('realm operand', () => {
  it.each([
    [['matrix', '/alpha']],
    [['matrix', 'alpha']],
    [['matrix', '/']],
    [['matrix', '/parent/child']],
    [['https://am.example.com/am', '/alpha', 'user@example.com', 'secret']],
  ])('accepts the realm right after the host: %j', (operands) => {
    expect(rulesOf(withRealm(), ...operands)).toEqual([]);
  });

  it('does not judge a host or profile alone (whether it should name a realm is cli#885)', () => {
    expect(rulesOf(withRealm(), 'matrix')).toEqual([]);
    expect(rulesOf(withRealm(), '-a', 'matrix')).toEqual([]);
  });

  it('rejects host and user name: the user name is read as the realm', () => {
    expect(
      rulesOf(withRealm(), 'https://am.example.com/am', 'user@example.com')
    ).toEqual(['realm-misplaced']);
  });

  it('rejects host, user and password: the user name is read as the realm', () => {
    const found = exampleViolations(withRealm(), [
      'https://am.example.com/am',
      'user@example.com',
      'secret',
    ]);
    expect(found.map((v) => v.rule)).toEqual(['realm-misplaced']);
    expect(found[0].message).toContain('user@example.com');
    expect(found[0].message).toContain('[host] [realm] [username] [password]');
  });

  it('rejects the sample password where the realm goes', () => {
    expect(rulesOf(withRealm(), 'matrix', 'Blu3P!ll3d', 'secret')).toEqual([
      'realm-misplaced',
    ]);
  });

  it('exempts examples without a host operand (they do not talk to a tenant)', () => {
    expect(rulesOf(withRealm(), '-i', 'x', '-f', 'file.json')).toEqual([]);
  });

  it('does not apply to a command whose first argument is not a host', () => {
    const command = new Command('list');
    command.argument('[name]').argument('[realm]').option('-a, --all');
    expect(rulesOf(command, 'something', 'user@example.com')).toEqual([]);
  });

  it('does not apply to a command without a realm argument', () => {
    expect(
      rulesOf(thing('host', 'username', 'password'), 'matrix', 'user', 'pw')
    ).toEqual([]);
  });

  it('knows what a realm looks like', () => {
    ['/', '/alpha', 'alpha', 'bravo', '/parent/child'].forEach((realm) =>
      expect(looksLikeRealm(realm)).toBe(true)
    );
    ['user@example.com', 'Blu3P!ll3d', 'https://host/am', ''].forEach((value) =>
      expect(looksLikeRealm(value)).toBe(false)
    );
  });
});

describe('entity pickers and option groups', () => {
  function pickable() {
    const command = withRealm();
    deferEntityPicks(command, [
      {
        name: 'thingId',
        load: async () => [],
        label: (entity) => String(entity),
        kind: 'thing',
      },
    ]);
    deferOneOfGroups(command, [
      { options: ['all', 'thingId'], all: false, purpose: 'what to list' },
    ]);
    return command;
  }

  it('flags a tenant example that names no target: the entity picker opens', () => {
    expect(rulesOf(pickable(), 'matrix', '/alpha')).toEqual([
      'target-missing',
      'one-of-missing',
    ]);
  });

  it.each([[['-i', 'x', 'matrix', '/alpha']], [['-a', 'matrix', '/alpha']]])(
    'accepts an example that names the target: %j',
    (args) => {
      expect(rulesOf(pickable(), ...args)).toEqual([]);
    }
  );

  it('asks for the picked option when a picker has no option group', () => {
    const command = withRealm();
    deferEntityPicks(command, [
      {
        name: 'thingId',
        load: async () => [],
        label: (entity) => String(entity),
        kind: 'thing',
      },
    ]);
    expect(rulesOf(command, 'matrix', '/alpha')).toEqual(['target-missing']);
    expect(rulesOf(command, '-i', 'x', 'matrix', '/alpha')).toEqual([]);
  });

  it('asks for a member of a requireOneOf group even when no picker exists', () => {
    const command = withRealm();
    deferOneOfGroups(command, [
      { options: ['all', 'file'], all: false, purpose: 'what to read' },
    ]);
    expect(rulesOf(command, 'matrix', '/alpha')).toEqual(['one-of-missing']);
    expect(rulesOf(command, '-f', 'a.json', 'matrix', '/alpha')).toEqual([]);
  });

  it('asks for every member of a requireAllOf group', () => {
    const command = withRealm();
    deferOneOfGroups(command, [
      { options: ['thingId', 'file'], all: true, purpose: 'which file' },
    ]);
    expect(rulesOf(command, '-i', 'x', 'matrix', '/alpha')).toEqual([
      'all-of-missing',
    ]);
    expect(
      rulesOf(command, '-i', 'x', '-f', 'a.json', 'matrix', '/alpha')
    ).toEqual([]);
  });
});

describe('flags', () => {
  it('flags an option the command does not define', () => {
    const found = exampleViolations(withRealm(), ['-z', 'matrix', '/alpha']);
    expect(found.map((v) => v.rule)).toEqual(['unknown-option']);
    expect(found[0].message).toContain('-z');
  });

  it('lets a value-taking option consume its value (it is not an operand)', () => {
    const parsed = parseExample(withRealm(), ['-i', 'x', 'matrix', '/alpha']);
    expect(parsed.operands).toEqual(['matrix', '/alpha']);
    expect([...parsed.options]).toEqual(['thingId']);
    expect(parseExample(withRealm(), ['-a', 'matrix']).operands).toEqual([
      'matrix',
    ]);
  });

  it('reads a cluster of short flags, the last one taking the value', () => {
    const parsed = parseExample(withRealm(), ['-av', '-f', 'x', 'matrix']);
    expect([...parsed.options].sort()).toEqual(['all', 'file', 'verbose']);
    const cluster = parseExample(withRealm(), ['-avf', 'x.json', 'matrix']);
    expect([...cluster.options].sort()).toEqual(['all', 'file', 'verbose']);
    expect(cluster.operands).toEqual(['matrix']);
  });

  it('reads --name=value and a negated flag', () => {
    const parsed = parseExample(withRealm(), ['--file=x.json', '--no-deps']);
    expect([...parsed.options].sort()).toEqual(['deps', 'file']);
    expect(parsed.operands).toEqual([]);
  });

  it('does not change the command it reads (one example must not leak into the next)', () => {
    const command = withRealm();
    parseExample(command, ['-a', '-i', 'x', 'matrix']);
    expect(command.opts()).toEqual({});
  });
});

describe('reading an example line', () => {
  it('splits like a shell: quotes group, quote characters go', () => {
    expect(tokenize(`frodo a -x 'two words' "and \\"more\\"" plain`)).toEqual([
      'frodo',
      'a',
      '-x',
      'two words',
      'and "more"',
      'plain',
    ]);
    expect(tokenize(`frodo a '' b`)).toEqual(['frodo', 'a', '', 'b']);
  });

  it('notices a quote that is never closed', () => {
    expect(hasUnbalancedQuote(`frodo a 'ok' b`)).toBe(false);
    expect(hasUnbalancedQuote(`frodo a "it's" b`)).toBe(false);
    expect(hasUnbalancedQuote(`frodo a host' /alpha`)).toBe(true);
    expect(hasUnbalancedQuote(`frodo a "open`)).toBe(true);
  });

  it('splits a line at shell separators', () => {
    expect(
      splitSegments(tokenize('frodo a x && frodo b y | frodo c ; frodo d'))
    ).toEqual([
      ['frodo', 'a', 'x'],
      ['frodo', 'b', 'y'],
      ['frodo', 'c'],
      ['frodo', 'd'],
    ]);
  });

  it('finds the command by name or alias and rejects an unknown path', () => {
    const leaf = new Command('abort');
    const group = new Command('dcc').alias('direct-config');
    group.addCommand(new Command('session').addCommand(leaf));
    const resolved = resolveCommand(
      [group],
      ['frodo', 'direct-config', 'session', 'abort', 'matrix']
    );
    expect(resolved.command).toBe(leaf);
    expect(resolved.args).toEqual(['matrix']);
    expect(
      resolveCommand([group], ['frodo', 'direct-config-session', 'abort'])
    ).toBeUndefined();
    expect(
      resolveCommand([group], ['frodo', 'dcc', 'sesion', 'abort'])
    ).toBeUndefined();
  });

  it('lets options straight after a command name belong to that command', () => {
    const login = new Command('login');
    login.addCommand(new Command('somewhere'));
    expect(
      resolveCommand([login], ['frodo', 'login', '--browser', 'matrix']).command
    ).toBe(login);
  });

  it('extracts the example lines from rendered help, colours or not', () => {
    const help = [
      'Usage Examples:',
      '  Do the thing:',
      '  $ frodo thing list matrix /alpha',
      '  \u001b[36m$ frodo thing list --long matrix /alpha\u001b[39m',
      '  not an example $ frodo',
    ].join('\n');
    expect(extractExamples(help)).toEqual([
      'frodo thing list matrix /alpha',
      'frodo thing list --long matrix /alpha',
    ]);
  });
});
