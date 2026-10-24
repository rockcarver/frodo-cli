import fs from 'fs';
import { fileURLToPath } from 'url';
import { getOneOfGroups } from '../../src/cli/ResolveInteractiveInputs.ts';
import * as samples from '../../src/help/SampleData.ts';
import { getEntityPicks } from '../../src/utils/interactive/EntityPickers.ts';

/**
 * The real command tree and the usage examples it renders, for the tests that
 * check the examples (UsageExamples.test.js: every command has them;
 * UsageExampleOperands.test.js: every example is right and non-interactive).
 *
 * The tree is built the way src/app.ts builds it: the command groups are read
 * from app.ts's own imports, so a newly registered group is covered without
 * touching the tests that use this file.
 */

const appSource = fs.readFileSync(
  fileURLToPath(new URL('../../src/app.ts', import.meta.url)),
  'utf8'
);

/** Module paths (relative to src/cli) of the command groups app.ts imports. */
export const groupModules = [
  ...appSource.matchAll(/^import \w+ from '\.\/cli\/([\w-]+\/[\w-]+)';$/gm),
].map((match) => match[1]);

/** How many groups app.ts registers; equals groupModules.length unless an import form is missed. */
export const registeredGroupCount = [
  ...appSource.matchAll(/^\s*program\.addCommand\(/gm),
].length;

export function leafCommands(command, leaves = []) {
  const subcommands = command.commands.filter((c) => c.name() !== 'help');
  if (subcommands.length === 0) leaves.push(command);
  else subcommands.forEach((c) => leafCommands(c, leaves));
  return leaves;
}

/** `frodo journey list` for the leaf command of that name. */
export function fullName(command) {
  const names = [];
  for (let c = command; c; c = c.parent) names.unshift(c.name());
  return `frodo ${names.join(' ')}`;
}

/** The -hhh help of a command (the usage examples are only rendered for it). */
export function renderFullHelp(command) {
  let text = '';
  command.configureOutput({
    writeOut: (chunk) => (text += chunk),
    writeErr: () => {},
  });
  command.outputHelp();
  return text;
}

/**
 * Builds every command group and returns the leaf commands. The examples are
 * only rendered when `--help-all` is in process.argv (see
 * FrodoCommand.addHelpText), so the caller sets it around this call and
 * restores it afterwards.
 */
export async function loadLeafCommands() {
  const { leaves } = await loadCommandTree();
  return leaves;
}

/** The top-level command groups (as app.ts registers them) and all their leaf commands. */
export async function loadCommandTree() {
  const groups = [];
  const leaves = [];
  for (const modulePath of groupModules) {
    const module = await import(`../../src/cli/${modulePath}.ts`);
    const group = module.default();
    groups.push(group);
    leafCommands(group, leaves);
  }
  return { groups, leaves };
}

// eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
const ANSI = /\x1b\[[0-9;]*m/g;

/** The example command lines (`frodo ...`, without the `$ `) in a command's -hhh help. */
export function extractExamples(helpText) {
  return helpText
    .replace(ANSI, '')
    .split('\n')
    .map((line) => /^\s+\$ (frodo\s.*)$/.exec(line))
    .filter(Boolean)
    .map((match) => match[1].trim());
}

/** Splits an example the way a POSIX shell would for quotes (single, double, backslash). */
export function tokenize(line) {
  const tokens = [];
  let current = '';
  let started = false;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < line.length)
        current += line[++i];
      else current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (ch === '\\' && i + 1 < line.length) {
      current += line[++i];
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (started) tokens.push(current);
  return tokens;
}

/**
 * Splits an example's arguments into operands and the options it sets, using
 * the command's own option definitions (so a value-taking option consumes its
 * value and a flag does not). Read-only: the command is not parsed, so no
 * option value leaks from one example into the next. Flags the command does
 * not define come back in `unknown`.
 */
export function parseExample(command, args) {
  const operands = [];
  const set = new Set();
  const unknown = [];
  const find = (flag) =>
    command.options.find((o) => o.short === flag || o.long === flag);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      operands.push(arg);
      continue;
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    // `-adR` is `-a -d -R`; the last flag of a cluster may take the value.
    const flags = /^-[A-Za-z]{2,}$/.test(flag)
      ? [...flag.slice(1)].map((letter) => `-${letter}`)
      : [flag];
    flags.forEach((single, index) => {
      const option = find(single);
      if (!option) {
        unknown.push(single);
        return;
      }
      set.add(option.attributeName());
      const takesValue = option.required || option.optional;
      if (takesValue && eq < 0 && index === flags.length - 1) {
        const next = args[i + 1];
        if (option.required || (next !== undefined && !next.startsWith('-')))
          i++;
      }
    });
  }
  return { operands, options: set, unknown };
}

/** Splits a tokenized example at shell separators (`a && b`, `a | b`, `a; b`). */
export function splitSegments(tokens) {
  const segments = [[]];
  for (const token of tokens) {
    if (['&&', '||', '|', ';'].includes(token)) segments.push([]);
    else segments[segments.length - 1].push(token);
  }
  return segments.filter((segment) => segment.length > 0);
}

const matches = (command, word) =>
  command.name() === word || command.aliases().includes(word);

/**
 * The command an example invokes (by name or alias, so `frodo
 * direct-config-session ...` finds `frodo dcc session ...`) and the arguments
 * that follow the command path. Undefined when the words do not lead to a
 * leaf command.
 */
export function resolveCommand(groups, tokens) {
  if (tokens[0] !== 'frodo') return undefined;
  let command = groups.find((group) => matches(group, tokens[1]));
  let used = 2;
  while (command && command.commands.length > 0) {
    const word = tokens[used];
    // Options straight after a command name belong to that command
    // (`frodo login --browser ...`).
    if (word === undefined || word.startsWith('-')) break;
    const next = command.commands.find((child) => matches(child, word));
    if (!next) return undefined;
    command = next;
    used++;
  }
  return command ? { command, args: tokens.slice(used) } : undefined;
}

/** Whether a quote in the example is never closed (a shell would wait for more input). */
export function hasUnbalancedQuote(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"') i++;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '\\') i++;
  }
  return quote !== null;
}

const REALM = /^(\/|\/?[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*)$/;

/** Whether an operand can be a realm (`/alpha`, `bravo`, `/parent/child`), not a user name or a password. */
export function looksLikeRealm(value) {
  return (
    REALM.test(value) &&
    value !== samples.username &&
    value !== samples.password
  );
}

/**
 * What is wrong with one usage example (an empty list when it is right). An
 * example must run as written without opening an interactive mode:
 * - `unknown-option`: a flag the command does not define.
 * - `realm-misplaced`: for a command with `[host] [realm] [username]
 *   [password]` the second operand is the realm. With only host, user and
 *   password the user name is read as the realm and the password as the user
 *   name, so the example logs in as nobody. An example with a host or profile
 *   alone is not judged here (whether it should name a realm is a separate
 *   question); examples without a host operand do not talk to a tenant.
 * - `target-missing`: the command has entity pickers and the example sets
 *   neither a picked option nor a member of its `requireOneOf` groups, so the
 *   entity picker opens.
 * - `one-of-missing` / `all-of-missing`: a `requireOneOf` / `requireAllOf`
 *   group of the command is not satisfied, so the options editor opens.
 *
 * @param command the command the example invokes (see resolveCommand)
 * @param args the arguments after the command path
 */
export function exampleViolations(command, args) {
  const found = [];
  const { operands, options, unknown } = parseExample(command, args);
  unknown.forEach((flag) =>
    found.push({
      rule: 'unknown-option',
      message: `${flag} is not an option of ${fullName(command)}.`,
    })
  );
  const names = command.registeredArguments.map((a) => a.name());
  const realmIndex = names.indexOf('realm');
  if (
    names[0] === 'host' &&
    realmIndex > 0 &&
    operands.length > realmIndex &&
    !looksLikeRealm(operands[realmIndex])
  ) {
    found.push({
      rule: 'realm-misplaced',
      message:
        `has "${operands[realmIndex]}" where the realm goes (usage: ${names.map((n) => `[${n}]`).join(' ')}). ` +
        `Put the realm right after the host: <host> <realm> <username> '<password>'.`,
    });
  }

  const groups = getOneOfGroups(command);
  const oneOf = groups.filter((group) => !group.all);
  const picks = getEntityPicks(command);
  const oneOfOptions = oneOf.flatMap((group) => group.options);
  if (
    picks.length > 0 &&
    !picks.some((pick) => options.has(pick.name)) &&
    !oneOfOptions.some((name) => options.has(name))
  ) {
    found.push({
      rule: 'target-missing',
      message:
        `sets none of ${[...new Set([...picks.map((p) => p.name), ...oneOfOptions])].join(', ')}: ` +
        `the entity picker opens. Name the entity (or --all).`,
    });
  }
  groups.forEach((group) => {
    const wanted = group.options;
    if (group.all) {
      const missing = wanted.filter((name) => !options.has(name));
      if (missing.length > 0)
        found.push({
          rule: 'all-of-missing',
          message: `needs all of ${wanted.join(', ')}; missing ${missing.join(', ')}.`,
        });
    } else if (!wanted.some((name) => options.has(name))) {
      found.push({
        rule: 'one-of-missing',
        message: `needs one of ${wanted.join(', ')}.`,
      });
    }
  });
  return found;
}
