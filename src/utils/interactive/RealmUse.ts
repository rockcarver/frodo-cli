/**
 * What a command declares about its realm positional, split out as a
 * zero-import module (pure commander types, like PositionalArgs and
 * CommandPreview) so the command declaration, the realm picker, the command
 * preview and the unit tests share one implementation.
 *
 * Most commands run in ONE realm: the realm positional (or the deployment's
 * default) names it, and the post-auth realm picker offers the realms of the
 * system with the default highlighted. The commands of `frodo config pull`,
 * `push`, `delete`, `migrate` and `promote` (the config-manager family) that use
 * their realm positional are different: no realm means EVERY realm, because
 * the operations read the sentinel default as "all". Such a command declares
 * itself with `FrodoCommand.usesRealm()`:
 *
 * - the realm picker offers an `All realms` row first, and makes it the
 *   default, because that is what leaving the realm out does;
 * - the command preview prints no realm token for the sentinel (it would
 *   otherwise print the deployment's default realm, which is not what runs);
 * - the command reads the realm after login (`realmOfRun`), because the picker
 *   runs inside `getTokens()`, after the action has bound its parameters.
 *
 * A command of that family that does NOT declare it ignores the realm
 * (cors, secrets, promote, ...): the picker would offer a choice that changes
 * nothing, so it does not open.
 *
 * A command whose realm matters only when an option is set (`frodo config
 * export`: the realm limits the export with `-r`, `--realm-only`, and changes
 * nothing without it) declares `FrodoCommand.realmPickerOnlyWith(option)`.
 * Its picker is the ordinary one (the realms only, the deployment's default
 * highlighted) and it still opens only where records 0001 and 0047 allow it,
 * for a command line that was incomplete; the declaration only closes it when
 * the option is not set.
 */

import type { Command } from 'commander';

/** What a command that uses its realm positional declares. */
export interface RealmUse {
  /**
   * The command also covers configuration that belongs to the tenant, not to a
   * realm (`pull all`): a realm limits the realm-specific part only. The
   * picker says so.
   */
  tenantWide: boolean;
}

const declaredRealmUse = new WeakMap<Command, RealmUse>();

/**
 * Records that the command uses its realm positional (see the module doc).
 * @param command the command
 * @param use what the command covers
 */
export function declareRealmUse(
  command: Command,
  use: RealmUse = { tenantWide: false }
): void {
  declaredRealmUse.set(command, use);
}

/**
 * What the command declared with `declareRealmUse`.
 * @param command the command
 * @returns the declaration, or undefined if the command did not declare one
 */
export function realmUseOf(command: Command): RealmUse | undefined {
  return declaredRealmUse.get(command);
}

/** The verbs of `frodo config` that work on a tree of files (`export` and `import` do not). */
const CONFIG_TREE_VERBS: readonly string[] = [
  'pull',
  'push',
  'delete',
  'migrate',
  'promote',
];

/**
 * Whether the command is one of the commands of `frodo config` that work on a
 * tree of files (`pull`, `push`, `delete`, `migrate` and `promote`, formerly
 * the `config-manager` group). `config export` and `config import` are not:
 * they share the group name, so the group name alone does not tell.
 * @param command the command
 * @returns true if the command sits below `config pull|push|delete|migrate|promote`, or carries such a full name
 */
export function isConfigManagerCommand(command: Command): boolean {
  let below: Command | undefined;
  for (
    let cursor: Command | null | undefined = command;
    cursor;
    below = cursor, cursor = cursor.parent
  ) {
    const name = cursor.name();
    // a leaf may carry its full `frodo config pull ...` name
    if (
      new RegExp(`^frodo config (${CONFIG_TREE_VERBS.join('|')})( |$)`).test(
        name
      )
    ) {
      return true;
    }
    // the group is named `config`; the word right below it names the verb
    if (
      name === 'config' &&
      below &&
      CONFIG_TREE_VERBS.includes(below.name())
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the realm picker must stay closed for the command: a
 * command of `config pull|push|delete|migrate|promote` that does not use its realm positional.
 * @param command the command
 * @returns true if the picker would offer a choice that changes nothing
 */
export function ignoresRealm(command: Command): boolean {
  return isConfigManagerCommand(command) && !realmUseOf(command);
}

const declaredRealmPickerOption = new WeakMap<Command, string>();

/**
 * Records that the command's realm picker is only worth opening when the
 * option is set (see the module doc). It never opens the picker: the other
 * conditions of `resolveRealmPick` still apply.
 * @param command the command
 * @param option the attribute name of the option (`realmOnly` for `-r, --realm-only`)
 */
export function declareRealmPickerOnlyWith(
  command: Command,
  option: string
): void {
  declaredRealmPickerOption.set(command, option);
}

/**
 * The option that the command's realm picker depends on.
 * @param command the command
 * @returns the attribute name of the option, or undefined if the command did not declare one
 */
export function realmPickerOptionOf(command: Command): string | undefined {
  return declaredRealmPickerOption.get(command);
}

/**
 * Whether the realm picker may open for the command as far as its options are
 * concerned: a command that declared `realmPickerOnlyWith` needs that option
 * set (typed, from the environment or chosen in the editor); any other command
 * has no such condition.
 * @param command the command
 * @returns false if the command declared an option and it is not set
 */
export function realmPickerWanted(command: Command): boolean {
  const option = declaredRealmPickerOption.get(command);
  return option === undefined || !!command.getOptionValue(option);
}
