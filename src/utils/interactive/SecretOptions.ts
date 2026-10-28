/**
 * Options whose value is a secret (a password, a client secret) and that may
 * be given without a value, so that frodo asks for it instead of the command
 * line carrying it (issue about `frodo conn set --password`, cli record 0034).
 *
 * Commander gives an optional-value option (`--password [password]`) the value
 * `true` when it is used bare, and the command then used `true` as the secret.
 * A real value of a secret option is always a string, so on a marked option
 * `true` can only mean "used bare": the resolver replaces it with what the
 * user types (or what arrives on stdin) before the action runs, and it never
 * reaches frodo-lib. The mark also drives everything else that must treat a
 * secret differently: it is masked in the command preview, never saved as a
 * default, and asked for without echo in the editor.
 *
 * Zero-import (commander types only), like EditableOptions and
 * PositionalArgs: the resolver, the preview and the defaults store all read it
 * without pulling in frodo-lib. The class that commands declare is
 * `SecretOption` in FrodoCommand.ts.
 */

import type { Command, Option } from 'commander';

/** How a secret value is shown wherever the command is printed. */
export const SECRET_MASK = '********';

/** Appended to the description of every secret option, so all of them say the same. */
export const SECRET_OPTION_HELP =
  'Without a value, it is asked for (input hidden) or, when input is piped, read from stdin.';

/**
 * The marker lives under a symbol on the option itself, as an own enumerable
 * property: FrodoCommand clones shared options with `{ ...option }`, which
 * keeps own properties and would lose a class.
 */
const SECRET_KEY = Symbol.for('frodo.secretOption');

/** Marks an option as secret. Returns the same option. */
export function markSecret<T extends Option>(option: T): T {
  (option as unknown as Record<symbol, boolean>)[SECRET_KEY] = true;
  return option;
}

/** Whether the option was declared as a secret option. */
export function isSecretOption(option: Option): boolean {
  return (option as unknown as Record<symbol, boolean>)[SECRET_KEY] === true;
}

/** The long flag as typed (`--password`), or the whole flags string without one. */
function longFlagOf(option: Option): string {
  return (
    option.flags.split(/[, ]+/).find((token) => token.startsWith('--')) ??
    option.flags
  );
}

/**
 * The secret options still waiting for a value, in declaration order: the
 * ones used bare, plus the mandatory ones that were left out altogether
 * (`mandatoryViolations` holds the flags of the deferred mandatory options).
 */
export function pendingSecretOptions(
  command: Command,
  mandatoryViolations: string[] = []
): Option[] {
  return command.options.filter((option) => {
    if (!isSecretOption(option)) return false;
    const value = command.getOptionValue(option.attributeName());
    if (value === true) return true;
    return value === undefined && mandatoryViolations.includes(option.flags);
  });
}

/** Commander-shaped error for a secret that was given without a value and cannot be asked for. */
export function secretNeedsValueMessage(option: Option): string {
  return `error: option '${option.flags}' was given without a value, and there is no way to ask for it here. Pipe the value on stdin, or give it as ${longFlagOf(option)} <value>.`;
}

/** Commander-shaped error for a bare secret whose prompt was declined (Escape or an empty answer). */
export function secretDeclinedMessage(option: Option): string {
  return `error: option '${option.flags}' was given without a value.`;
}

/** Commander-shaped error for several bare secrets when stdin is the only source. */
export function secretsShareStdinMessage(options: Option[]): string {
  return `error: ${options.map((option) => `'${longFlagOf(option)}'`).join(' and ')} were given without a value, but stdin can supply only one. Give the others on the command line.`;
}

/** Commander-shaped error for a bare secret when stdin was piped but empty. */
export function secretStdinEmptyMessage(option: Option): string {
  return `error: option '${option.flags}' was given without a value, and nothing was piped on stdin.`;
}

/** Drops one trailing line break (`\n` or `\r\n`) from piped input, and nothing else: a secret may end in a space. */
export function stripTrailingNewline(text: string): string {
  return text.replace(/\r?\n$/, '');
}

/** The code of the errors above. */
export const SECRET_VALUE_MISSING_CODE = 'frodo.secretValueMissing';
