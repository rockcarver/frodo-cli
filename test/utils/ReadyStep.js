/**
 * Terminal-test steps for the Ready step (decision records 0043 and 0044).
 *
 * An interactive run that asked for anything ends in "Ready to run?" and only
 * the Run row starts the command, so a scenario that drives a flow to the end
 * answers it. Put `answerReady()` where the last prompt of the resolution pass
 * is concluded and the next thing is the command itself: its login (when the
 * pass made none) or its output. The Ready step is the LAST prompt: the
 * pickers that need a login (the realm picker, the entity pickers) run in the
 * pass before it, after the login the pass makes for them, and nothing prompts
 * after Run except the command's own prompts.
 *
 * `wait_plain` scans all the output so far, so a scenario that reaches the step
 * twice (Edit options) must `clear_output` before it waits for the second one.
 */

/** The question the step asks, as a `wait_plain` regular expression. */
export const READY_QUESTION = 'Ready to run\\?';

/**
 * Waits for the Ready step, lets it settle, and chooses Run (the highlighted
 * row). With `clear`, the output so far is dropped just before Run, so a later
 * assertion about what the run printed does not read the step's own frame,
 * whose footer is the command on a line of its own.
 */
export function answerReady({
  settleMs = 400,
  timeoutMs = 30000,
  clear = false,
} = {}) {
  return [
    { type: 'wait_plain', regex: READY_QUESTION, timeoutMs },
    { type: 'sleep', ms: settleMs },
    ...(clear ? [{ type: 'clear_output' }] : []),
    { type: 'key', name: 'enter' },
  ];
}
