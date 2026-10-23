import { expect } from '@jest/globals';

/**
 * Frame-integrity assertions shared by every prompt's render tests (see
 * .github/instructions/interactive-layering.instructions.md): a prompt
 * frame must keep its silhouette at every terminal width, whatever text
 * the tenant sends.
 */

/** The terminal widths every prompt is rendered at: the 40-column floor up to a wide terminal. */
export const FRAME_WIDTHS = [40, 60, 80, 120, 156];

/**
 * Text that has broken frames, as raw strings from a log or a tenant.
 *
 * Known limitation, deliberately not listed: wide characters (CJK, emoji)
 * are measured by `.length` everywhere in the frames, so a line of them
 * is not guaranteed to line up visually.
 */
export const HOSTILE_TEXTS = {
  multiLine: 'first line\nsecond line\r\nthird line',
  tabbedStackTrace:
    'TypeError: boom (script#62)\n\tat java.base/java.util.concurrent.FutureTask.report(FutureTask.java:124)\n\tat org.forgerock.openam.scripting.ThreadPoolScriptEvaluator.evaluateScript(ThreadPoolScriptEvaluator.java:98)\n\nCaused by: x',
  veryLongWord: 'x'.repeat(300),
  longDottedNames:
    'org.forgerock.openam.scripting.ThreadPoolScriptEvaluator.evaluateScript '.repeat(
      8
    ),
  deepIndent: `${' '.repeat(120)}deeply indented`,
  longTitleText: 'a-journey-name-'.repeat(12),
};

const SGR = /\x1b\[[0-9;]*m/g; // eslint-disable-line no-control-regex

/** The drawn text of every line, ANSI removed. */
export function visibleLines(output) {
  return output.split('\n').map((line) => line.replace(SGR, ''));
}

/** Every line of the frame output is exactly `width` columns, between a left and a right wall, with no raw control character. */
export function assertFrame(output, width) {
  expect(output).not.toContain('Internal error');
  for (const line of visibleLines(output)) {
    expect(line.length).toBe(width);
    expect(line).toMatch(/^[┌│└].*[┐│┘]$/);
    expect(line).not.toMatch(/[\t\r]/);
  }
}
