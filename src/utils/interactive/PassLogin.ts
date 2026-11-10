/**
 * The login the resolution pass makes for its pickers (decision record 0044),
 * as state and decisions, split into a zero-import module the same way
 * AuthoringPrintState and ReadyStep are: the getTokens wrapper in
 * ops/AuthenticateOps and the pass in cli/ResolveInteractiveInputs both read
 * it, and neither may drag the other's graph along (tests that mock frodo-lib
 * wholesale load AuthenticateOps).
 *
 * The realm picker and the entity pickers need a login for their loaders. The
 * pass makes it when, and only when, one of them is going to open, so the
 * Ready step can be the last prompt. This module remembers what that login
 * used, so the command's own `getTokens()` call does not make a second one,
 * and which pickers ran, so none runs twice.
 */

import { createHash } from 'node:crypto';
import type { Command } from 'commander';
import { editableOptionGroupOf } from './EditableOptions';
import { positionalValue } from './PositionalArgs';

/** What the login of the pass used, and who it was for. */
export type PassLoginSession = {
  /** The effective `forceLoginAsUser` of the login (the global override included). */
  forceLoginAsUser: boolean;
  /** Whether the login keeps its tokens fresh. */
  autoRefresh: boolean;
};

/** `connectionFingerprint` of the command when the pass wrote its connection into frodo-lib's state, if it did. */
let appliedFingerprint: string | undefined;
/** The login of the pass, until the command's own `getTokens()` takes it. */
let session: PassLoginSession | undefined;
/** Whether the realm picker was handled in the pass (it ran, or did not apply). */
let realmPickDone = false;
/** The entity picks the pass has run, by option name. */
const attemptedPicks = new Set<string>();

/** Starts a pass: nothing is remembered from an earlier command of the process (the shell runs many). */
export function resetPassLogin(): void {
  appliedFingerprint = undefined;
  session = undefined;
  realmPickDone = false;
  attemptedPicks.clear();
}

/**
 * Records that the pass wrote the connection of the command into the library's
 * state, and what the connection was.
 * @param command the command that is being resolved
 */
export function notePassStateApplied(command: Command): void {
  appliedFingerprint = connectionFingerprint(command);
}

/**
 * Whether the pass wrote the connection into the library's state already. The
 * action must then not write it again (it would put back what the login has
 * replaced: an alias for the host, the sentinel for the realm).
 */
export function passStateApplied(): boolean {
  return appliedFingerprint !== undefined;
}

/** Records the login the pass made. */
export function recordPassLogin(login: PassLoginSession): void {
  session = login;
}

/** The login of the pass that no `getTokens()` call has taken yet. */
export function passLoginSession(): PassLoginSession | undefined {
  return session;
}

/**
 * Whether the first `getTokens()` call of the command can use the login of the
 * pass: it asks for the same `forceLoginAsUser` and `autoRefresh`. The login
 * is taken either way, so a later call (a command that changes host and logs
 * in again) logs in normally.
 * @param forceLoginAsUser the effective `forceLoginAsUser` of the call
 * @param autoRefresh the `autoRefresh` of the call
 * @returns true when the pass made a login with the same arguments
 */
export function takePassLogin(
  forceLoginAsUser: boolean,
  autoRefresh: boolean
): boolean {
  const held = session;
  session = undefined;
  return (
    held !== undefined &&
    held.forceLoginAsUser === forceLoginAsUser &&
    held.autoRefresh === autoRefresh
  );
}

/**
 * Forgets what the pass did, because the connection changed: the next picker
 * writes the connection into the state and logs in again, and the realm is
 * asked again. The values already chosen stay.
 */
export function forgetPassLogin(): void {
  resetPassLogin();
}

/** Records that the realm picker was handled in the pass. */
export function notePassRealmPickDone(): void {
  realmPickDone = true;
}

/** Whether the realm picker was handled in the pass, so the wrapper must not offer it again. */
export function passRealmPickDone(): boolean {
  return realmPickDone;
}

/** Records that the pass ran the entity pick for this option. */
export function notePassEntityPickAttempted(optionName: string): void {
  attemptedPicks.add(optionName);
}

/** Whether the pass ran the entity pick for this option, so nothing may run it again. */
export function passEntityPickAttempted(optionName: string): boolean {
  return attemptedPicks.has(optionName);
}

/**
 * Whether the pass must log in now: a picker is going to open that needs the
 * login, and the pass has not made it yet. With no such picker the pass does
 * not log in, and the command logs in itself after the Ready step.
 * @param facts.loggedIn the pass has logged in already
 * @param facts.realmPickerApplies the realm picker can open (record 0001)
 * @param facts.entityPicksNeedingLogin entity picks that will open and whose loader needs tokens
 * @returns true when the pass logs in
 */
export function loginNeededForPickers(facts: {
  loggedIn: boolean;
  realmPickerApplies: boolean;
  entityPicksNeedingLogin: number;
}): boolean {
  if (facts.loggedIn) return false;
  return facts.realmPickerApplies || facts.entityPicksNeedingLogin > 0;
}

/**
 * The message of the library's refusal of a deployment type that a command
 * does not support, so the reused login of the pass fails the same way a login
 * made by the command would.
 * @param types the deployment types the command supports
 * @param deploymentType the deployment type of the target system
 * @returns the message, undefined when the type is supported or not known
 */
export function unsupportedDeploymentTypeMessage(
  types: string[],
  deploymentType: string | undefined
): string | undefined {
  return deploymentType && !types.includes(deploymentType)
    ? `Unsupported deployment type '${deploymentType}'`
    : undefined;
}

/** The help groups whose options decide who logs in to what. */
const CONNECTION_GROUPS = /^(Authentication|Connection)\b/;

/**
 * What the login of a command depends on: the host and the credentials it was
 * given, and the options of the Authentication and Connection groups. What
 * the pass did (the login, the realm pick) is kept while this is the same, and
 * forgotten when the invocation editor changed it. Nothing else counts: an
 * output option or a choice of the command leaves it alone. A one-way hash,
 * kept in memory only.
 * @param command the command that is being resolved
 * @returns the fingerprint
 */
export function connectionFingerprint(command: Command): string {
  const values: Record<string, unknown> = {
    host: positionalValue(command, 'host'),
    username: positionalValue(command, 'username'),
    password: positionalValue(command, 'password'),
  };
  for (const option of command.options) {
    const group = editableOptionGroupOf(option);
    if (group !== undefined && CONNECTION_GROUPS.test(group)) {
      values[option.attributeName()] = command.getOptionValue(
        option.attributeName()
      );
    }
  }
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/**
 * Whether the connection of the command changed since the pass wrote it into
 * the library's state (the invocation editor can change the options that decide
 * who logs in to what).
 * @param command the command that is being resolved
 * @returns true when the pass wrote the connection and the command no longer matches it
 */
export function connectionChangedSinceApply(command: Command): boolean {
  return (
    appliedFingerprint !== undefined &&
    appliedFingerprint !== connectionFingerprint(command)
  );
}
