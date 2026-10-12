/**
 * The "exit all the way out" affordance (user feedback 2026-10-12:
 * backing out of a nested position one ESC per level costs too many
 * presses; a fast double-ESC -- the mouse double-click gesture -- should
 * unwind everything at once). Single ESC keeps its per-surface meaning
 * (back one level, or exit at the top); two ESCs within the window
 * resolve the prompt with the EXIT_ALL sentinel, which callers unwind
 * to the very top with.
 *
 * Zero-import: every prompt module and the resolver use this, so it
 * must not drag any graph in.
 */

/** Milliseconds between the two ESC presses that count as "double". */
export const EXIT_ALL_WINDOW_MS = 400;

/**
 * The sentinel every escapable prompt resolves with when the user
 * double-pressed ESC. Distinct from the per-surface escape symbols
 * (ESCAPE / MULTISEL_ESCAPE / PAGE_ESCAPE / the value box's reject):
 * those mean "back one level", this means "leave everything".
 */
export const EXIT_ALL = Symbol('interactive:exitAll');

/**
 * The double-ESC detector shared by every prompt: returns true when
 * `now` is within the window of the previous ESC at `lastEscapeAt`,
 * i.e. this press should exit all the way. Callers own the timestamp
 * (a useRef) and reset it to undefined whenever any OTHER key arrives
 * (the double-click analogy: the two presses must be consecutive).
 */
export function isDoubleEscape(
  lastEscapeAt: number | undefined,
  now: number,
  windowMs: number = EXIT_ALL_WINDOW_MS
): boolean {
  return lastEscapeAt !== undefined && now - lastEscapeAt <= windowMs;
}
