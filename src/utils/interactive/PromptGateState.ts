/**
 * The prompt gate's pure state, split from PromptGate.ts so it stays
 * importable from unit tests: PromptGate pulls in @inquirer/core and the
 * frodo-lib-importing ColorTheme, and this CLI's Jest setup cannot load
 * frodo-lib (see src/app.commandWiring.test.ts's header comment).
 *
 * Prompts fire only when EVERY one of these holds --
 *
 * - `FRODO_NO_PROMPT` is unset (the explicit user opt-out, honored no
 *   matter how interactive the session looks; also settable per command
 *   via --no-prompt, see FrodoCommand);
 * - `FRODO_TEST !== '1'` (the e2e harness tools/with-frodo-bin.mjs spawns
 *   with stdio: 'inherit', so local test runs DO have a TTY -- an
 *   isTTY-only gate would hang them);
 * - both stdin and stdout are TTYs (piped/redirected sessions, the MCP
 *   server's stdio protocol channel, and CI all fail this naturally);
 * - and setNeverPrompt() has not been called for this process (belt and
 *   braces for surfaces whose stdio is a protocol channel by
 *   construction, e.g. `frodo mcp server start --transport stdio`).
 *
 * Outside the gate, behavior is byte-identical to before the interactive
 * layer existed: same errors, same exit codes.
 */

/** Module-scoped hard kill switch for protocol-channel surfaces. */
let neverPrompt = false;

/**
 * Prompts actually rendered this process (incremented by the prompt
 * modules as they open). The resolution pass consults this to tell an
 * interactive-assisted run (at least one prompt concluded) from a fully
 * specified TTY run where the pass found nothing to do -- the command
 * preview's final print belongs to the former (its payoff is the
 * prompts' concluding <enter>), not the latter. Counter, not flag: a
 * connection page + picker session must not lose the fact because the
 * FIRST prompt of the session renders before the print gate could read a
 * boolean.
 */
let promptSessionCount = 0;

/**
 * Records that an interactive prompt is being shown. Called by the
 * prompt modules (textPrompt, escapableSelect, escapableMultiSelect,
 * connectionPage) at open time.
 */
export function notePromptRendered(): void {
  promptSessionCount += 1;
}

/** How many prompts have rendered this process. */
export function promptsRendered(): number {
  return promptSessionCount;
}

/**
 * Permanently disables prompting for the remainder of this process. Used
 * by surfaces whose stdin/stdout are a protocol channel by construction
 * (e.g. the MCP server's stdio transport) as belt-and-braces alongside
 * the natural isTTY check.
 */
export function setNeverPrompt(): void {
  neverPrompt = true;
}

/**
 * Test-only escape hatch: clears the kill switch so a test can exercise
 * the other gate conditions in any order. Not part of the product
 * surface.
 */
export function resetNeverPromptForTests(): void {
  neverPrompt = false;
}

/**
 * Whether prompts may fire in this process right now. Pure (no I/O) and
 * cheap, so it can be consulted per prompt.
 */
export function canPrompt(): boolean {
  if (neverPrompt) return false;
  if (process.env.FRODO_NO_PROMPT) return false;
  if (process.env.FRODO_TEST === '1') return false;
  return !!process.stdin.isTTY && !!process.stdout.isTTY;
}
