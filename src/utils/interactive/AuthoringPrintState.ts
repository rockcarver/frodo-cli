/**
 * The deferred authoring print's state, split from
 * ResolveInteractiveInputs.ts into a zero-import module (the
 * ActiveActionCommandState pattern) so the flush sites (AuthenticateOps'
 * getTokens wrapper, EntityPickers, FrodoCommand's postAction hook) can
 * cooperate without importing the resolver's heavy graph (frodo-lib,
 * commander trees).
 *
 * With erase-on-conclude prompts (clearPromptOnDone on every prompt), the
 * only trace of an interactive session is what frodo prints around the
 * action's output. The eventual-command print is that trace, and it is a
 * HEADER for the results (user: it must appear BEFORE them, not after), so
 * the primary flush site is the getTokens wrapper, directly above the
 * action's output, with resolveEntityPicks covering the pick-after-auth
 * commands and the postAction hook as the fallback for flows with neither
 * auth nor picks.
 * The resolution pass arms (unconditionally -- registration is free; the
 * print gate is evaluated inside the flush closure at flush time); flows
 * that never reach a flush site (cancelled pickers, unsatisfied one-of
 * throws, failed auth) leave nothing behind.
 */

/**
 * Whether the eventual-command print is armed and not yet flushed.
 */
let authoringPrintPending = false;

/**
 * Whether auth has succeeded for this invocation. resolveEntityPicks
 * consults it before flushing: entity picks that run BEFORE auth
 * (the `(pick) && (await getTokens())` pattern) must not print -- if
 * auth then fails, the printed command never ran. Set by the getTokens
 * wrapper on its success path.
 */
let authSucceeded = false;

/**
 * Arms the deferred print. Called by the resolution pass instead of
 * printing eagerly. Idempotent (re-arming just refreshes intent); the
 * flush prints exactly once.
 */
export function armAuthoringPrint(): void {
  authoringPrintPending = true;
}

/**
 * Whether the deferred print is armed and not yet printed.
 */
export function authoringPrintPendingState(): boolean {
  return authoringPrintPending;
}

/**
 * Records that auth succeeded this invocation (getTokens success path).
 */
export function noteAuthSucceeded(): void {
  authSucceeded = true;
}

/**
 * Whether auth has succeeded (see the field doc for why it gates the
 * entity-pickers' flush).
 */
export function authSucceededForFlush(): boolean {
  return authSucceeded;
}

/**
 * The print closure, injected by the resolution pass at arm time so this
 * module stays zero-import. The closure re-reads the command object (a
 * closure over it) AND evaluates the print gate (promptsRendered /
 * explicitlyInteractive) at flush time -- both must be late: the
 * post-auth realm/entity pickers render after the pass ends, so both a
 * gate-at-arm-time and a snapshot-of-the-command would go stale.
 */
let flushImpl: (() => void) | undefined;

export function setAuthoringPrintFlush(impl: () => void): void {
  flushImpl = impl;
}

/**
 * Prints the eventual command once, if armed. Callers: the getTokens
 * wrapper (above the action's results), resolveEntityPicks (after its
 * picks conclude, when auth already succeeded), and FrodoCommand's
 * postAction hook (fallback). No-op when never armed (help/version
 * paths, stubs without the resolution pass).
 */
export function flushAuthoringPrint(): void {
  if (!authoringPrintPending) return;
  authoringPrintPending = false;
  flushImpl?.();
}

/**
 * Disarms the print without printing (the flush's silent sibling). Used
 * by the getTokens wrapper's failure path: auth failed, the command
 * never ran, and a print after the failure output would re-introduce
 * the "footer after the results" shape the header placement exists to
 * avoid.
 */
export function revokeAuthoringPrint(): void {
  authoringPrintPending = false;
}

/** Test hygiene. */
export function resetAuthoringPrintForTests(): void {
  authoringPrintPending = false;
  authSucceeded = false;
  flushImpl = undefined;
}
