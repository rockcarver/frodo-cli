import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

// Every real `src/cli/**/*.ts` command file transitively imports
// `@rockcarver/frodo-lib`, and loading that under this project's Jest setup
// (ts-jest with `.ts` treated as ESM, run via `--experimental-vm-modules`)
// fails with `Dynamic require of "util" is not supported` -- a build/
// toolchain interaction between frodo-lib's bundled `dist/index.mjs` (a
// `typeof require !== 'undefined' ? require(...) : throw` shim some
// transitive CJS deps call at module scope) and Jest's real-ESM loader,
// reproducing identically for a static or a dynamic `import()` alike. That
// rules out actually importing and executing real command files here (see
// the `frodo-e2e-testing-overhaul-todo` memory for the full writeup) -- so
// this is a purely textual/structural check instead: it greps each file's
// own `new FrodoCommand(...)` and `.action(async (...) => ...)` source and
// verifies they agree with each other, without ever importing or running
// anything.
const DEFAULT_ARG_NAMES = ['host', 'realm', 'username', 'password'];

// Files whose `new FrodoCommand(...)` omits-argument is a non-literal
// expression (e.g. a `deploymentTypes` variable reference) rather than an
// inline array, so this file's regex-based extraction can't resolve what it
// actually evaluates to. Narrow and explicit on purpose: silently skipping
// on any parse failure would let a real file slip through uncovered without
// anyone noticing, so every exclusion has to be named and justified here.
// (Both of these look like they may be passing the wrong constructor
// argument entirely -- `deploymentTypes` is normally the *third*
// `FrodoCommand` argument, not the second/omits one -- worth a second look
// separately; not touched here since it's unrelated to the bug this test
// guards against.)
const UNRESOLVABLE_OMITS_EXPRESSION_FILES = new Set([
  'config-manager/config-manager-pull/config-manager-pull-oauth2-agents.ts',
  'config-manager/config-manager-pull/config-manager-pull-variables.ts',
]);

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

type CheckResult = { checkedCount: number; mismatches: string[] };

/**
 * Regression test for a real bug: `frodo log key list` (and 4 other
 * commands) crashed with "Cannot read properties of undefined (reading
 * 'handleDefaultArgsAndOpts')" as soon as they were invoked.
 *
 * Root cause: `new FrodoCommand(name, omits, ...)`'s `omits` array (e.g.
 * `['realm']`) tells the constructor which of the default
 * host/realm/username/password arguments to *leave out* of the command
 * (confirmed live in `FrodoCommand`'s constructor -- `commandOmits`/
 * `defaultArgs` loop). Commander's own `Command.prototype.action()` (see
 * `node_modules/commander/lib/command.js`) always calls the registered
 * callback with exactly `this.registeredArguments.length` positional
 * values, followed by the parsed options object, followed by the `Command`
 * instance itself -- never more, never fewer. The five broken commands
 * omitted `realm` but still declared an action callback shaped
 * `(host, realm, user, password, options, command)`: since Commander only
 * ever supplied 5 real values (no realm), every named parameter after
 * `host` silently bound to the *next* real value instead -- `command`
 * (whichever real value, if any, ended up in that 6th slot) had nothing
 * left to bind to and came through as `undefined`, so the very first line
 * of every one of these commands (`command.handleDefaultArgsAndOpts(...)`)
 * crashed unconditionally.
 *
 * Rather than special-case the five commands that happened to be broken
 * today, this walks every `.ts` file under `src/cli` and checks each one's
 * declared action-callback arity against what its own `new FrodoCommand`
 * registration actually implies -- catching this whole bug *class* (any
 * future command that omits a default argument, or adds a custom one via
 * `.argument()`/`.addArgument()`, without keeping its callback signature in
 * sync), not just these five instances.
 */
function checkCommandWiring(): CheckResult {
  const cliDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli');
  const files = walkTsFiles(cliDir).filter(
    (file) => !file.endsWith(path.join('cli', 'FrodoCommand.ts'))
  );

  const mismatches: string[] = [];
  let checkedCount = 0;

  for (const file of files) {
    const relativePath = path.relative(cliDir, file);
    const text = fs.readFileSync(file, 'utf8');

    const ctorMatch = text.match(
      /new FrodoCommand\(\s*(?:'[^']*'|`[^`]*`)\s*(?:,\s*(\[[\s\S]*?\]|[A-Za-z_][A-Za-z0-9_.]*)\s*)?[,)]/
    );
    if (!ctorMatch) continue; // not a FrodoCommand-based leaf file (a group/stub command with no action of its own, etc.)

    if (UNRESOLVABLE_OMITS_EXPRESSION_FILES.has(relativePath)) continue;

    const omitsExpr = ctorMatch[1];
    const omittedNames =
      omitsExpr === undefined
        ? []
        : [...omitsExpr.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const omittedDefaultArgCount = omittedNames.filter((name) =>
      DEFAULT_ARG_NAMES.includes(name)
    ).length;
    const defaultPositionalArgs =
      DEFAULT_ARG_NAMES.length - omittedDefaultArgCount;

    // Custom positional arguments a leaf command registers of its own, on
    // top of (or instead of) the default set -- Commander's
    // `.argument(name, ...)` sugar and `.addArgument(argumentInstance)`
    // each register exactly one additional one.
    const customArgCount =
      (text.match(/\.argument\(/g) || []).length +
      (text.match(/\.addArgument\(/g) || []).length;

    const expectedArity = defaultPositionalArgs + customArgCount + 2; // + options + command

    const actionMatch = text.match(
      /\.action\(\s*(?:\/\/[^\n]*\n\s*)?async\s*\(([^)]*)\)\s*=>/
    );
    if (!actionMatch) continue; // group/stub command with no action() of its own

    const params = actionMatch[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    checkedCount++;

    if (params.length !== expectedArity) {
      mismatches.push(
        `${relativePath}: action() declares ${params.length} parameter(s) [${params.join(', ')}], but its 'new FrodoCommand(...)' registration (${defaultPositionalArgs} default argument(s) + ${customArgCount} custom argument(s)) implies Commander will call it with ${expectedArity}`
      );
    }
  }

  return { checkedCount, mismatches };
}

describe('CLI command wiring', () => {
  it("every command's action() callback arity matches its own new FrodoCommand(...) registration", () => {
    const { checkedCount, mismatches } = checkCommandWiring();
    // Sanity check we actually walked a real, close-to-complete tree and
    // didn't e.g. silently match nothing due to a regex typo.
    expect(checkedCount).toBeGreaterThan(300);
    expect(mismatches).toEqual([]);
  });

  it("every command that still strips an 'Unrecognized combination' else-branch carries a requireOneOf/requireAllOf declaration", () => {
    // Phase 2 conversion invariant: the `Unrecognized combination of
    // options or no options...` dead-ends were replaced by declarative
    // requireOneOf/requireAllOf rules on the command (see
    // INTERACTIVE-COMMANDS-PLAN.md). A file that still BOTH carries the
    // dead-end AND no rule is a half-finished conversion -- the action
    // body rejects option combinations the rule was supposed to catch
    // (or prompt for) before the action ever runs.
    const { filesWithDeadEndAndNoRule } = checkOneOfCoverage();
    expect(filesWithDeadEndAndNoRule).toEqual([]);
  });
});

/**
 * Cross-checks the Phase 2 conversion: any cli command file whose action
 * body still contains the `Unrecognized combination of options or no
 * options...` dead-end must also declare a requireOneOf/requireAllOf
 * rule -- otherwise the conversion is half-done (the rule should have
 * replaced the dead-end, or the dead-end is a legitimate auth-failure
 * handler and the message should read accordingly). Auth-failure-only
 * guards (config-manager style) legitimately keep the else but WITHOUT
 * the dead-end message, so requiring "dead-end present => rule present"
 * catches exactly the incomplete cases.
 */
function checkOneOfCoverage(): { filesWithDeadEndAndNoRule: string[] } {
  const cliDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli');
  const offenders: string[] = [];

  for (const file of walkTsFiles(cliDir)) {
    const relativePath = path.relative(cliDir, file);
    const text = fs.readFileSync(file, 'utf8');
    const hasDeadEnd = text.includes(
      'Unrecognized combination of options or no options...'
    );
    const hasRule =
      /\.requireOneOf\(/.test(text) || /\.requireAllOf\(/.test(text);
    if (hasDeadEnd && !hasRule) {
      offenders.push(relativePath);
    }
  }

  return { filesWithDeadEndAndNoRule: offenders };
}
