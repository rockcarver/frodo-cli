/**
 * Option conflicts during interactive resolution (cli record 0032, issue
 * #967).
 *
 * Commander enforces `.conflicts()` once, while it parses the command line.
 * Everything the interactive resolver writes afterwards (a picked one-of
 * member, a value typed in the invocation editor, a saved default, an entity
 * pick) arrives after that check, so without a second check the resolver can
 * assemble a command line that the CLI itself rejects, and the command
 * preview would then show a command that fails when typed again (record
 * 0019).
 *
 * This module is the one place that knows about conflicts at resolution
 * time. Every option the resolver sets goes through `commitOption`, which
 * refuses a value that conflicts with something the user typed. It may
 * replace a conflicting value that the resolver itself set earlier (a saved
 * default, a previous pick): the user's newer choice wins. It never drops an
 * option from the command line or the environment.
 *
 * Pure commander logic: no ops, no frodo-lib, no prompts.
 */

import type { Command, Option } from 'commander';

/** The option names (attribute names) the resolver itself has set, per command. */
const resolverSet = new WeakMap<Command, Set<string>>();

/** The code commander uses for a parse-time conflict; the safety net keeps it. */
export const CONFLICTING_OPTION_CODE = 'commander.conflictingOption';

export type CommitResult =
  | {
      status: 'committed';
      /** Options whose earlier value this commit replaced or consumed. */
      cleared: Option[];
    }
  | {
      status: 'blocked';
      /** The option the user gave that stands in the way. */
      blockedBy: Option;
    };

export type CommitOptions = {
  /**
   * Replace a conflicting value that the resolver set itself (default true).
   * False for saved defaults: they fill gaps, they never override anything.
   */
  replace?: boolean;
  /**
   * Attribute names of options the value was derived from, such as the
   * `-c` that scoped an entity picker. They do not block the commit and are
   * cleared by it, because the picked value replaces what they selected.
   */
  consume?: string[];
};

/**
 * The attribute names `.conflicts()` registered on an option. Commander
 * keeps them in `conflictsWith` but its type declarations leave the
 * property out; this is the one place that says so.
 */
function declaredConflicts(option: Option): string[] {
  return (option as Option & { conflictsWith: string[] }).conflictsWith;
}

/** The option with this attribute name (the first one, when a negatable pair shares it). */
function optionOf(command: Command, attribute: string): Option | undefined {
  return command.options.find((option) => option.attributeName() === attribute);
}

/**
 * Whether the option holds a value that commander counts for conflicts: one
 * that is defined and did not come from the default (command line, env, or a
 * value the resolver committed). Mirrors Command#_checkForConflictingLocalOptions.
 */
export function isActive(command: Command, attribute: string): boolean {
  return (
    command.getOptionValue(attribute) !== undefined &&
    command.getOptionValueSource(attribute) !== 'default'
  );
}

/**
 * The options that conflict with `attribute`, from either side's
 * declaration (record 0032 asks for both, but a conflict declared on one
 * side still fires in commander).
 */
export function conflictsOf(command: Command, attribute: string): Option[] {
  const own = optionOf(command, attribute);
  const found = new Map<string, Option>();
  for (const option of command.options) {
    const name = option.attributeName();
    if (name === attribute || found.has(name)) continue;
    if (
      declaredConflicts(option).includes(attribute) ||
      (own !== undefined && declaredConflicts(own).includes(name))
    ) {
      found.set(name, option);
    }
  }
  return [...found.values()];
}

/** The conflicting options that currently hold a value. */
export function activeConflicts(command: Command, attribute: string): Option[] {
  return conflictsOf(command, attribute).filter((option) =>
    isActive(command, option.attributeName())
  );
}

/**
 * The conflicting options that stand in the way for good: active, and typed
 * by the user (command line or environment) rather than set by the resolver.
 */
export function blockersOf(
  command: Command,
  attribute: string,
  ignore: string[] = []
): Option[] {
  const set = resolverSet.get(command);
  return activeConflicts(command, attribute).filter(
    (option) =>
      !ignore.includes(option.attributeName()) &&
      !set?.has(option.attributeName())
  );
}

/**
 * Splits one-of / all-of group members into the ones the user can still
 * pick and the ones hidden by an option already given.
 */
export function selectableMembers(
  command: Command,
  members: string[]
): {
  selectable: string[];
  hidden: { option: Option; blockedBy: Option }[];
} {
  const selectable: string[] = [];
  const hidden: { option: Option; blockedBy: Option }[] = [];
  for (const name of members) {
    const option = optionOf(command, name);
    const [blockedBy] = blockersOf(command, name);
    if (option && blockedBy) hidden.push({ option, blockedBy });
    else selectable.push(name);
  }
  return { selectable, hidden };
}

/**
 * The only way the resolver sets an option. Returns what happened instead
 * of throwing, so the caller can word the refusal for its own prompt.
 */
export function commitOption(
  command: Command,
  attribute: string,
  value: unknown,
  { replace = true, consume = [] }: CommitOptions = {}
): CommitResult {
  const set = resolverSet.get(command) ?? new Set<string>();
  const active = activeConflicts(command, attribute);
  const blocking = active.filter((option) => {
    const name = option.attributeName();
    if (consume.includes(name)) return false;
    return !replace || !set.has(name);
  });
  if (blocking.length > 0) return { status: 'blocked', blockedBy: blocking[0] };

  for (const option of active) {
    const name = option.attributeName();
    const fallback = Array.isArray(option.defaultValue)
      ? [...option.defaultValue]
      : option.defaultValue;
    command.setOptionValueWithSource(name, fallback, 'default');
    set.delete(name);
  }
  command.setOptionValueWithSource(attribute, value, 'cli');
  set.add(attribute);
  resolverSet.set(command, set);
  return { status: 'committed', cleared: active };
}

/** How commander words one side of a conflict (see Command#_conflictingOption). */
function describeSide(command: Command, option: Option): string {
  const attribute = option.attributeName();
  const value = command.getOptionValue(attribute);
  const negated = command.options.find(
    (candidate) => candidate.negate && candidate.attributeName() === attribute
  );
  const best =
    negated && value === false
      ? negated
      : (command.options.find(
          (candidate) =>
            !candidate.negate && candidate.attributeName() === attribute
        ) ?? option);
  return command.getOptionValueSource(attribute) === 'env' && best.envVar
    ? `environment variable '${best.envVar}'`
    : `option '${best.flags}'`;
}

/** Commander's own text for a conflict, so the refusal reads like the parse-time one. */
export function conflictMessage(
  command: Command,
  option: Option,
  other: Option
): string {
  return `error: ${describeSide(command, option)} cannot be used with ${describeSide(command, other)}`;
}

/** Ends the command the way commander does for a conflict. */
export function failWithConflict(
  command: Command,
  option: Option,
  other: Option
): never {
  command.error(conflictMessage(command, option, other), {
    code: CONFLICTING_OPTION_CODE,
  });
}

/**
 * The safety net, run once the resolver is done: whatever happened on the
 * way, no two active options may conflict. Throws commander's error for the
 * first pair it finds.
 */
export function assertNoConflicts(command: Command): void {
  for (const option of command.options) {
    const attribute = option.attributeName();
    if (!isActive(command, attribute)) continue;
    const [other] = activeConflicts(command, attribute);
    if (other) failWithConflict(command, option, other);
  }
}

/** Forgets which options the resolver set, so a test can reuse one command object. */
export function forgetResolverChoices(command: Command): void {
  resolverSet.delete(command);
}

/** One line for a picker or the editor: what it leaves out, and why. */
export function hiddenNote(
  hidden: { option: Option; blockedBy: Option }[]
): string {
  return `Not offered, because it cannot be combined with an option already given: ${hidden
    .map(({ option, blockedBy }) => `${option.flags} (with ${blockedBy.flags})`)
    .join(', ')}.`;
}
