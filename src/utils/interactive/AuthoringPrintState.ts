/**
 * The Phase 5 authoring print's deferred state, split from
 * ResolveInteractiveInputs.ts into a zero-import module (the
 * ActiveActionCommandState pattern) so FrodoCommand's postAction hook can
 * flush the print without importing the resolver's heavy graph
 * (frodo-lib, commander trees).
 *
 * With erase-on-conclude prompts (clearPromptOnDone on every prompt), the
 * only trace of an interactive session is what frodo prints AFTER the last
 * prompt concluded. The eventual-command print is that trace, so it must
 * fire at the LAST moment the command can still change -- not at the end
 * of the resolution pass (pre-auth, pre-realm-pick, pre-entity-pick: three
 * later steps can still alter the command, and a print there can be
 * stale). The single flush site is FrodoCommand's postAction hook: the
 * resolution pass ARMS (unconditionally -- registration is free; the
 * print gate is evaluated inside the flush closure at flush time), the
 * hook flushes after the action's output concludes, and flows that never
 * reach the action (cancelled pickers, unsatisfied one-of throws) skip
 * the hook, leaving nothing behind.
 */

/**
 * Whether the eventual-command print is armed and not yet flushed.
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
 * The print closure, injected by the resolution pass at arm time so this
 * module stays zero-import. The closure re-reads the command object (a
 * closure over it) AND evaluates the print gate (promptsRendered /
 * explicitlyInteractive) at flush time -- both must be late: the
 * post-auth realm picker renders after the pass ends, so both a
 * gate-at-arm-time and a snapshot-of-the-command would go stale.
 */
let flushImpl: (() => void) | undefined;

export function setAuthoringPrintFlush(impl: () => void): void {
  flushImpl = impl;
}

/**
 * Prints the eventual command once, if armed. Sole caller:
 * FrodoCommand's postAction hook. No-op when never armed (help/version
 * paths, stubs without the resolution pass).
 */
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
