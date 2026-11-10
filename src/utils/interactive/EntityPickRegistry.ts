/**
 * The registry of entity pickers by command family (decision record 0038).
 *
 * A family of commands (`frodo idm remote-proxy`) says once how to list its
 * entities. Every command of the family that has the option inherits the
 * picker: the command file declares nothing and calls nothing, and the
 * framework runs the pick after login (`getTokens`, through
 * `resolveFamilyEntityPicks`).
 *
 * This module only holds the table and matches it; the entries are in
 * EntityPickFamilies.ts, so that this module does not need the library and
 * stays loadable in tests that replace it.
 */

import type { Command } from 'commander';
import type { EntityPickSpec } from './EntityPickers';

export type EntityPickFamily = {
  /** Path of the family's command group without the program name, e.g. `idm remote-proxy`. */
  family: string;
  /**
   * Names this entry when a family has more than one (for example one for the
   * entities of the family and one for the connection profiles a command
   * takes), because `except` and `include` apply to all picks of an entry.
   * Defaults to the family.
   */
  name?: string;
  /**
   * Commands of the family (their path after the family) that do not get the
   * picks, besides the ones whose verb names a new entity or one in a file
   * (see `NEW_ENTITY_VERBS`).
   */
  except?: string[];
  /**
   * Commands of the family (their path after the family, and also listed in
   * `except`) whose option is an optional filter: without it they cover every
   * entity, so the command line is complete and the pick never opens by
   * itself (record 0030). The user can still ask for it on the options page
   * ("choose after connecting"), and then the pick runs after login.
   */
  onRequest?: string[];
  /**
   * Commands of the family whose verb is one of `NEW_ENTITY_VERBS` but whose
   * option still refers to an existing entity (for example a `create` that
   * adds a version to an existing secret), so they do get the picks.
   */
  include?: string[];
  /** The picks; each applies to the commands of the family that have the option of that name. */
  picks: EntityPickSpec[];
};

/**
 * The verbs of commands whose `-i` or `-n` names an entity that does not exist
 * yet (`create`) or one that is in a file (`import`). A picker over the live
 * system has nothing to offer there, so these commands never inherit a pick
 * unless the family lists them in `include`.
 */
export const NEW_ENTITY_VERBS = ['create', 'import'];

const families = new Map<string, EntityPickFamily>();

/**
 * Registers the picks of a family of commands. Registering an entry again
 * (the same name, or the same family when it has no name) replaces it.
 * @param {EntityPickFamily} entry the family
 */
export function registerEntityPickFamily(entry: EntityPickFamily): void {
  families.set(entry.name ?? entry.family, entry);
}

/**
 * The path of a command without the program name, e.g. `idm remote-proxy
 * describe`: the names of the command and of its parents. The program name
 * is left out because a command tree built without the program (a test, a
 * group set up on its own) must match the same families as the real one.
 * @param {Command} command the command
 * @returns {string} the path
 */
export function commandPathOf(command: Command): string {
  const names: string[] = [];
  for (let current: Command | null = command; current;) {
    if (current.name()) names.unshift(current.name());
    current = current.parent;
  }
  return names.join(' ').replace(/^frodo( |$)/, '');
}

/**
 * The picks the user can ask for on a command that does not inherit them
 * because its option is an optional filter (the family lists it in
 * `onRequest`).
 * @param {Command} command the command
 * @returns {EntityPickSpec[]} the picks available on request
 */
export function requestablePicks(command: Command): EntityPickSpec[] {
  const path = commandPathOf(command);
  const picks: EntityPickSpec[] = [];
  for (const entry of families.values()) {
    if (!path.startsWith(`${entry.family} `)) continue;
    if (!entry.onRequest?.includes(path.slice(entry.family.length + 1))) {
      continue;
    }
    for (const pick of entry.picks) {
      if (
        command.options.some((option) => option.attributeName() === pick.name)
      ) {
        picks.push(pick);
      }
    }
  }
  return picks;
}

/**
 * The picks a command inherits from its family: those of the family's entry
 * whose option the command has, unless the command is one of the entry's
 * exceptions. Empty when the command belongs to no registered family.
 * @param {Command} command the command
 * @returns {EntityPickSpec[]} the inherited picks
 */
export function familyEntityPicks(command: Command): EntityPickSpec[] {
  const path = commandPathOf(command);
  const picks: EntityPickSpec[] = [];
  for (const entry of families.values()) {
    if (!path.startsWith(`${entry.family} `)) continue;
    const rest = path.slice(entry.family.length + 1);
    const verb = rest.split(' ').pop() ?? '';
    if (
      !entry.include?.includes(rest) &&
      (entry.except?.includes(rest) || NEW_ENTITY_VERBS.includes(verb))
    ) {
      continue;
    }
    for (const pick of entry.picks) {
      if (
        command.options.some((option) => option.attributeName() === pick.name)
      ) {
        picks.push(pick);
      }
    }
  }
  return picks;
}
