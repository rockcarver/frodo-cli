/**
 * Positional-argument read/write helpers, split from
 * ResolveInteractiveInputs.ts into a zero-import module (the
 * CommandPreview/ActiveActionCommandState pattern): pure commander, no
 * frodo-lib, so both the resolver and the unit tests (which cannot import
 * the resolver's frodo-lib-heavy graph under this Jest setup -- see
 * src/app.commandWiring.test.ts's header comment) and the post-auth realm
 * picker's write-back share one implementation.
 */

import type { Command } from 'commander';

/**
 * Index of the default positional argument of that name on this command
 * (commands omit default args via the FrodoCommand omits list, so the
 * index differs per command), or -1 when the command doesn't declare it.
 */
export function positionalIndex(command: Command, name: string): number {
  return command.registeredArguments.findIndex(
    (argument) => argument.name() === name
  );
}

export function positionalValue(
  command: Command,
  name: string
): string | undefined {
  const index = positionalIndex(command, name);
  if (index === -1) return undefined;
  const value = command.processedArgs?.[index];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Writes `value` into BOTH surfaces the CLI reads for a positional:
 *
 * - `processedArgs` is what the action handler's positional parameters
 *   are sliced from (commander's action() wrapper slices
 *   this.processedArgs).
 * - `args` (raw, options-removed user args) is what
 *   handleDefaultArgsAndOpts iterates to copy default arguments into
 *   frodo-lib state INSIDE the action body -- it does NOT read
 *   processedArgs, so a processedArgs-only injection would be
 *   overwritten with `undefined` the moment the action starts.
 * Verified against commander's _processArguments (fills processedArgs
 * from args, never writes back) and this repo's
 * handleDefaultArgsAndOpts (iterates command.args).
 *
 * `args` holds only user-supplied positional values; a gap-fill by
 * definition fills a position the user left empty, so extending/padding
 * with the injected value is safe. Pad with nulls for any inner
 * positions the user skipped (rare: inner default args are optional),
 * since args is positional.
 */
export function setPositionalValue(
  command: Command,
  name: string,
  value: string
): void {
  const index = positionalIndex(command, name);
  if (index === -1) return;
  if (command.processedArgs) {
    command.processedArgs[index] = value;
  }
  if (Array.isArray(command.args)) {
    while (command.args.length < index) {
      command.args.push(null);
    }
    if (index === command.args.length) {
      command.args.push(value);
    } else if (command.args[index] == null) {
      command.args[index] = value;
    }
  }
}

/**
 * Writes `value` into a positional that may already hold one, on BOTH surfaces
 * (see `setPositionalValue`). `setPositionalValue` fills a gap and keeps what
 * the user typed in `args`; this replaces it, for the connection page, whose
 * rows the user edits after the resolver filled them (a host chosen in the
 * profile picker and then changed, a password typed again).
 * @param command the command
 * @param name the positional, e.g. `host`
 * @param value the new value
 */
export function replacePositionalValue(
  command: Command,
  name: string,
  value: string
): void {
  const index = positionalIndex(command, name);
  if (index === -1) return;
  if (command.processedArgs) {
    command.processedArgs[index] = value;
  }
  if (Array.isArray(command.args)) {
    while (command.args.length < index) {
      command.args.push(null);
    }
    command.args[index] = value;
  }
}

/**
 * The realm a command runs with, read when the operation starts: the value of
 * the realm positional NOW, so a realm that the post-auth realm picker wrote
 * is seen. The picker runs inside `getTokens()`, after the action has bound
 * its `realm` parameter, so the parameter alone is stale for a realm that was
 * picked. A command that passes its realm to an operation after login passes
 * `realmOfRun(command, realm)`.
 *
 * With no pick this is the value the parameter already has: the realm the user
 * typed, or frodo-lib's sentinel default.
 * @param command the command that is running
 * @param bound the value of the action's `realm` parameter
 * @returns the realm positional of the command, else `bound`
 */
export function realmOfRun(
  command: Command,
  bound: string | undefined
): string | undefined {
  return positionalValue(command, 'realm') ?? bound;
}
