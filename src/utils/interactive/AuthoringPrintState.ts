/**
 * The Phase 5 authoring print's deferred state, split from
 * ResolveInteractiveInputs.ts into a zero-import module (the
 * ActiveActionCommandState pattern) so the prompt-adjacent modules that
 * conclude the interactive flow (AuthenticateOps' getTokens wrapper, the
 * entity pickers) can flush the print without importing the resolver's
 * heavy graph (frodo-lib, commander trees).
 *
 * With erase-on-conclude prompts (clearPromptOnDone on every prompt), the
 * only trace of an interactive session is what frodo prints AFTER the last
 * prompt concluded. The eventual-command print is that trace, so it must
 * fire at the LAST moment the command can still change -- not at the end
 * of the resolution pass (pre-auth, pre-realm-pick, pre-entity-pick: three
 * later steps can still alter the command, and a print there can be stale).
 */

/**
 * Whether the resolution pass finished with interactive assistance and
 * wants the eventual-command print once everything interactive concludes.
 */
let authoringPrintPending = false;

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
 * Prints the eventual command once, if armed. Callers: the getTokens
 * wrapper (after the realm pick concludes -- auth commands' last
 * resolver-side interactive step) and resolveEntityPicks (after the last
 * entity pick concludes -- the action body's picks come after auth). The
 * print callback is injected by the resolver at arm time so this module
 * stays zero-import; the callback itself re-reads the command object
 * (a closure over it), so it always renders the CURRENT state -- a realm
 * pick or editor change between arming and flushing is reflected.
 */
let flushImpl: (() => void) | undefined;

export function setAuthoringPrintFlush(impl: () => void): void {
  flushImpl = impl;
}

export function flushAuthoringPrint(): void {
  if (!authoringPrintPending) return;
  authoringPrintPending = false;
  flushImpl?.();
}

/** Test hygiene. */
export function resetAuthoringPrintForTests(): void {
  authoringPrintPending = false;
  flushImpl = undefined;
}
