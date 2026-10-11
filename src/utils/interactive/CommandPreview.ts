/**
 * The Phase 5 command preview (INTERACTIVE-COMMANDS-PLAN.md): the
 * command being authored, rendered live inside the interactive prompts
 * as a footer line -- red + cursive while mandatory input is missing,
 * green/white upright when validated and ready. On the final `<enter>`
 * the resolver prints the full command once more, not cleaned away, so
 * it stays scrollable/copyable: the authoring-tool moment.
 *
 * Zero-import module (EditableOptions pattern): pure commander
 * serialization, importable from any prompt module without dragging
 * frodo-lib graphs into tests that mock frodo-lib wholesale. The
 * resolver computes the readiness input (it owns the mandatory/one-of
 * registries); this module only renders.
 */

import type { Command, Option } from 'commander';
import c from '../ColorTheme';

/** Options that are machinery, not configuration -- never serialized. */
const NON_SERIALIZABLE_OPTIONS = new Set([
  'help',
  'help-more',
  'help-all',
  'version',
  'prompt',
  'edit',
]);

/**
 * What the resolver knows about the command's completeness: labels of
 * mandatory options still without values, whether any registered one-of
 * group is unsatisfied, and whether the connection level is resolved
 * (env/profile/interactive all count -- the connection positionals can
 * legitimately stay empty while the connection is fully resolved, so the
 * resolver owns this truth; see isCommandReady).
 */
export type CommandReadiness = {
  missingMandatoryOptionLabels: string[];
  oneOfUnsatisfied: boolean;
  /**
   * Connection-level resolution per the resolver. Optional so ad-hoc
   * callers (tests, the final print) can omit it: omitted means "the
   * caller isn't tracking connection state" -- ready.
   */
  connectionResolved?: boolean;
};

/**
 * Serializes the command as it would be typed on the command line today
 * -- every valued option as its flag (value placeholder included),
 * valued positional arguments in order. Secrets (the password
 * positional) are masked; values are shell-safe by inspection but NOT
 * shell-quoted -- this is a preview, not an eval string.
 */
export function serializeCommand(command: Command): string {
  const parts: string[] = [commandPath(command)];

  const args: string[] = [];
  command.registeredArguments.forEach((argument, index) => {
    const value = command.processedArgs?.[index];
    if (typeof value !== 'string' || value.length === 0) return;
    args.push(argument.name() === 'password' ? '********' : value);
  });
  // Positionals come after the command word, before options -- but
  // commander's own usage puts them at the end of the token stream as
  // typed; keep argv order: positionals first (as typed), then options.
  parts.push(...args);

  for (const option of command.options as Option[]) {
    if (NON_SERIALIZABLE_OPTIONS.has(option.name())) continue;
    const value = command.getOptionValue(option.attributeName());
    // A `false` value means "unset" for a plain option -- but for a
    // negatable one (--no-cache) it's the user's authored negative form
    // and serializes as the flag itself.
    if (
      value === undefined ||
      value === '' ||
      (!option.negate && value === false)
    )
      continue;
    // Only what the USER provided this invocation: commander defaults
    // (--retry nothing, --no-cache...) are runtime detail, not authored
    // input -- the preview is a copy-paste source, so it shows exactly
    // the tokens a user would type.
    if (command.getOptionValueSource(option.attributeName()) === 'default')
      continue;
    if (value === true || option.negate) {
      // Boolean flags, and the user-typed negative form (--no-cache,
      // value false), serialize as the flag alone -- "--no-cache false"
      // is not a re-typable token.
      parts.push(option.flags.split(/[, ]+/)[0]);
    } else if (Array.isArray(value)) {
      // ListOption families collect repeats into an array -- copy-paste
      // fidelity needs the repeated-flag form, not String() joining
      // (--env a=1,b=2 is not a valid re-type).
      const longFlag = option.flags
        .split(/[, ]+/)
        .find((token) => token.startsWith('--'));
      for (const entry of value) {
        parts.push(`${longFlag ?? option.flags} ${String(entry)}`);
      }
    } else {
      const longFlag = option.flags
        .split(/[, ]+/)
        .find((token) => token.startsWith('--'));
      parts.push(`${longFlag ?? option.flags} ${String(value)}`);
    }
  }
  return parts.join(' ');
}

/**
 * The `frodo x y z` path of the command (root name + ancestors + this).
 */
function commandPath(command: Command): string {
  const names: string[] = [];
  for (
    let cursor: Command | undefined = command;
    cursor;
    cursor = cursor.parent
  ) {
    names.unshift(cursor.name());
  }
  return names.join(' ');
}

/**
 * Whether the command still has mandatory input to collect (red+cursive
 * in the preview) or is validated and ready (green/white): a deferred
 * mandatory option, an unsatisfied one-of group, or -- per the resolver's
 * readiness input -- an unresolved connection. Positional values are NOT
 * sniffed here: host/username/password can legitimately resolve from
 * env/profile without ever landing in the command object (the resolver's
 * own fallbacks), so only the resolver can say whether the connection
 * level is satisfied.
 */
export function isCommandReady(
  _command: Command,
  readiness: CommandReadiness
): boolean {
  if (readiness.missingMandatoryOptionLabels.length > 0) return false;
  if (readiness.oneOfUnsatisfied) return false;
  return readiness.connectionResolved !== false;
}

/**
 * The preview footer line for the prompts: colored per readiness state
 * (red + cursive = still missing mandatory input; green/white = ready).
 */
export function renderCommandPreview(
  command: Command,
  readiness: CommandReadiness
): string {
  const serialized = serializeCommand(command);
  if (isCommandReady(command, readiness)) {
    return c.positive(serialized);
  }
  return c.italic(c.negative(serialized));
}
