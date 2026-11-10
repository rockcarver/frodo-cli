/**
 * The option-requiredness rules of a command (`requireOneOf`, `requireAllOf`)
 * and what the resolver recorded about them, split into a zero-import module
 * the same way EditableOptions and OptionConflicts are: the resolver in
 * cli/ResolveInteractiveInputs and the entity pickers in this directory read
 * the same metadata, and the pickers must not import the resolver's graph.
 *
 * Pure commander logic, no frodo-lib.
 */

import type { Command } from 'commander';

/**
 * Option-requiredness rule registered on a command via `requireOneOf`
 * (at least one member present) or `requireAllOf` (every member present --
 * pairwise-required members, e.g. esv secret version activate's `-i` +
 * `-v`). Weaker than `makeOptionMandatory`: instead of "this one option
 * must always be present", it says "one of / all of these options must be
 * present" -- the shape of the `Unrecognized combination of options or no
 * options...` dead-ends that 113 command action bodies enforce only AFTER
 * authenticating. Evaluated in the resolution pass (ResolveInteractiveInputs),
 * where a violation becomes an interactive prompt on a prompt-capable session
 * and commander's own error otherwise.
 */
export type OptionRequirementSpec = {
  /** Long names (no dashes) of the group's member options. */
  options: string[];
  /**
   * Whether every member (true) or at least one member (false) must be
   * present. OPTIONAL -- set by the requireOneOf/requireAllOf wrappers
   * (requireOneOf defaults it to false, requireAllOf to true); callers
   * never pass it.
   */
  all?: boolean;
  /**
   * Human-readable purpose shown in prompts/errors, e.g. "what to
   * delete". Derived from the command description when omitted.
   */
  purpose?: string;
};

/**
 * Pre-requireAllOf spelling kept as an alias so the part-1/part-2 call
 * sites keep compiling while they migrate to the split methods.
 */
export type OneOfGroupSpec = OptionRequirementSpec;

const pendingOneOfGroups = new WeakMap<
  Command,
  (OptionRequirementSpec & { all: boolean })[]
>();

/**
 * Registers option-requiredness groups on a command for resolution-pass
 * evaluation. Called from FrodoCommand.requireOneOf/requireAllOf.
 */
export function deferOneOfGroups(
  command: Command,
  groups: (OptionRequirementSpec & { all: boolean })[]
): void {
  pendingOneOfGroups.set(command, [
    ...(pendingOneOfGroups.get(command) ?? []),
    ...groups,
  ]);
}

/**
 * The option-requiredness groups registered on a command (empty when
 * none). Read by FrodoStubHelp to render the rule in help output -- the
 * help annotation and the resolver consume the same metadata.
 */
export function getOneOfGroups(
  command: Command
): (OptionRequirementSpec & { all: boolean })[] {
  return pendingOneOfGroups.get(command) ?? [];
}

/**
 * Whether the option holds a value for the purpose of a requiredness rule:
 * anything but unset, `false` and the empty string. Values are read via
 * getOptionValue so injected gap-fills count.
 */
export function isOptionGiven(command: Command, name: string): boolean {
  const value = command.getOptionValue(name);
  return value !== undefined && value !== false && value !== '';
}

const deferredChoices = new WeakMap<Command, Set<string>>();

/**
 * Records that the user chose this member of a one-of group in the
 * resolution pass, but that its value comes later: the option is an entity
 * option with a picker, which runs after login. The choice is not in the
 * option yet, so without this record the picker of another member of the
 * group would be offered as well.
 */
export function noteDeferredChoice(command: Command, name: string): void {
  const set = deferredChoices.get(command) ?? new Set<string>();
  set.add(name);
  deferredChoices.set(command, set);
}

/** Takes back a choice made with `noteDeferredChoice`, for an option the user unmarked. */
export function forgetDeferredChoice(command: Command, name: string): void {
  deferredChoices.get(command)?.delete(name);
}

/** The options the user chose in the resolution pass whose value is still to come. */
export function deferredChoicesOf(command: Command): ReadonlySet<string> {
  return deferredChoices.get(command) ?? new Set<string>();
}

/**
 * The member of a one-of group that already answers it for the option: a
 * member other than this one that is given a value, or that the user chose
 * and whose picker has yet to run. Requirements where every member is needed
 * (`requireAllOf`) never answer for one another.
 * @param {Command} command the command
 * @param {string} name attribute name of the option to ask about
 * @returns {string | undefined} the attribute name of the member, if there is one
 */
export function oneOfMemberAnswering(
  command: Command,
  name: string
): string | undefined {
  const chosen = deferredChoicesOf(command);
  for (const group of getOneOfGroups(command)) {
    if (group.all || !group.options.includes(name)) continue;
    const member = group.options.find(
      (other) =>
        other !== name && (isOptionGiven(command, other) || chosen.has(other))
    );
    if (member) return member;
  }
  return undefined;
}
