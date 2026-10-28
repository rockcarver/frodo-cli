/**
 * Collects the values of secret options that were used bare (or, for a
 * mandatory one, left out), as the last required input of the resolution pass
 * (docs/INTERACTIVE-COMMANDS.md). Two ways in:
 *
 * - on a terminal that may be prompted, each one is asked for in declaration
 *   order with the input hidden;
 * - everywhere else the value comes from stdin when input is piped. Stdin can
 *   supply one value, read whole, minus one trailing line break; a terminal
 *   stdin is never read when prompting is off, and anything that cannot be
 *   answered ends the command with a commander-shaped error.
 *
 * The prompt and the stdin reader are passed in, so the rules can be tested
 * without a terminal and without frodo-lib. Every value is written with
 * `commitOption`, so the conflict rules of record 0032 apply to it too.
 */

import type { Command, Option } from 'commander';
import { commitOption, failWithConflict } from './OptionConflicts';
import {
  pendingSecretOptions,
  SECRET_VALUE_MISSING_CODE,
  secretDeclinedMessage,
  secretNeedsValueMessage,
  secretsShareStdinMessage,
  secretStdinEmptyMessage,
  stripTrailingNewline,
} from './SecretOptions';

/** Ends the command like commander does for an option without its value. */
function fail(command: Command, message: string): never {
  command.error(message, { code: SECRET_VALUE_MISSING_CODE });
}

/** Writes a collected value, or ends the command on a conflict. */
function commitSecret(command: Command, option: Option, value: string): void {
  const result = commitOption(command, option.attributeName(), value);
  if (result.status === 'blocked') {
    failWithConflict(command, option, result.blockedBy);
  }
}

/**
 * Asks for each pending secret. `ask` resolves with the typed value, `''`
 * when the user declined (Escape or an empty answer), or `undefined` when the
 * gate refused to prompt. Returns false as soon as one is declined; the
 * caller then ends the command with the error for what is still missing.
 */
export async function collectSecretsByPrompt(
  command: Command,
  mandatoryViolations: string[],
  ask: (message: string) => Promise<string | undefined>
): Promise<boolean> {
  for (const option of pendingSecretOptions(command, mandatoryViolations)) {
    const answer = await ask(
      `Enter a value for ${option.flags} (input is hidden):`
    );
    if (!answer) return false;
    commitSecret(command, option, answer);
  }
  return true;
}

/** What stdin looks like to the collector. */
export type StdinSource = {
  /** Whether stdin is a terminal. */
  isTTY: boolean;
  /** Reads stdin to its end (StdinSync, record 0003). */
  read: () => string;
};

/**
 * The non-interactive way: the value of the one pending secret comes from
 * stdin. Fails, before reading anything, when there is more than one pending
 * secret or when stdin is a terminal. Fails after reading when nothing was
 * piped. Does nothing when no secret is pending.
 */
export function collectSecretsFromStdin(
  command: Command,
  stdin: StdinSource
): void {
  const pending = pendingSecretOptions(command);
  if (pending.length === 0) return;
  if (pending.length > 1) fail(command, secretsShareStdinMessage(pending));
  const [option] = pending;
  if (stdin.isTTY) fail(command, secretNeedsValueMessage(option));
  const value = stripTrailingNewline(stdin.read());
  if (value.length === 0) fail(command, secretStdinEmptyMessage(option));
  commitSecret(command, option, value);
}

/**
 * Ends the command when a secret option still holds its marker, so that the
 * marker can never reach frodo-lib as a password. Used after the pass, and
 * wherever the pass gives up before it has asked.
 */
export function assertNoPendingSecrets(command: Command): void {
  const [option] = pendingSecretOptions(command);
  if (option) fail(command, secretNeedsValueMessage(option));
}

/**
 * Ends the command for the first secret that is still missing after the user
 * declined a prompt (or gave up an earlier one): a mandatory one that was left
 * out gets commander's own message, a bare one the "without a value" error.
 */
export function failFirstPendingSecret(
  command: Command,
  mandatoryViolations: string[],
  missingMandatory: (flags: string) => never
): void {
  const [option] = pendingSecretOptions(command, mandatoryViolations);
  if (!option) return;
  if (command.getOptionValue(option.attributeName()) === undefined) {
    missingMandatory(option.flags);
  }
  fail(command, secretDeclinedMessage(option));
}
