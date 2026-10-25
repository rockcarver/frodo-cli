import { applyEscapeSequenceTimeout } from './EscapeSequenceTimeout';

// The double-ESC gesture needs a short escape-sequence horizon (see
// EscapeSequenceTimeout.ts) -- applied once, before any prompt mounts
// (no createInterface call happens while merely importing; the patch
// only needs to beat the first CALL). app.ts also calls this before
// parseAsync; this module-load call is idempotent defense in depth for
// entry points that never see app.ts.
applyEscapeSequenceTimeout();

/**
 * The "exit all the way out" affordance (user feedback 2026-10-12:
 * backing out of a nested position one ESC per level costs too many
 * presses; a fast double-ESC -- the mouse double-click gesture -- should
 * unwind everything at once). Single ESC keeps its per-surface meaning
 * (back one level, or exit at the top); two ESCs within the window
 * resolve the prompt with the EXIT_ALL sentinel, which callers unwind
 * to the very top with.
 *
 * Zero-import (one sibling module: EscapeSequenceTimeout, itself
 * dependency-free): every prompt module and the resolver use this, so
 * it must not drag any graph in.
 *
 * MECHANISM (user design 2026-10-13, replacing the cross-prompt wall-
 * clock tried first): the first ESC does NOT resolve the prompt -- it
 * opens a GRACE WINDOW (setTimeout). A second ESC inside the window
 * resolves EXIT_ALL immediately; when the timer fires with no second
 * press, the single-ESC action resolves (back one level). Both presses
 * are therefore processed by the SAME prompt instance -- the gesture
 * can never fall into the gap between a closing prompt and whatever
 * re-opens next. That gap is exactly what broke the previous design:
 * every ESC resolves and closes its prompt, so the second press always
 * landed in a fresh instance (picker boot + human reaction measured
 * 1.3s in the field -- far outside any sane pairing window), and no
 * cross-prompt clock could bridge it reliably without also pairing
 * deliberate level-by-level back-outs.
 *
 * The cost is 400ms of added latency on every single-ESC action --
 * imperceptible next to the picker it closes. A status hint renders
 * during the grace so the gesture is discoverable ("esc again to exit
 * all").
 */

/** Milliseconds the first ESC waits before acting on its own. */
export const EXIT_ALL_WINDOW_MS = 400;

/**
 * The sentinel every escapable prompt resolves with when the user
 * double-pressed ESC. Distinct from the per-surface escape symbols
 * (ESCAPE / MULTISEL_ESCAPE / the value box's reject):
 * those mean "back one level", this means "leave everything".
 */
export const EXIT_ALL = Symbol('interactive:exitAll');

/**
 * The unwind signal consumers of EXIT_ALL THROW (never return): exit-all
 * means "leave the session entirely -- straight back to the shell" (docs/
 * INTERACTIVE-COMMANDS.md), from any nesting depth. A thrown symbol
 * traverses commander's async action/hooks and every intermediate loop
 * untouched -- the per-surface STEP_BACK catches already let
 * non-STEP_BACK errors propagate -- until app.ts's top-level handler
 * converts it into a clean exit. Throwing (rather than threading a
 * return value through every loop) is what makes the unwind work from
 * pickers called INSIDE nested loops (realm/entity pickers inside the
 * action body, editors inside routing loops): each of those would
 * otherwise need its own EXIT_ALL branch.
 */
export const EXIT_ALL_SIGNAL = Symbol('interactive:exitAllSignal');

/**
 * Starts the grace window for the first ESC of a possible double-press
 * and arms the second-press handler. `onSecondEscape` runs immediately
 * when a second ESC arrives inside the window (the prompt then resolves
 * EXIT_ALL); `onGraceExpire` runs when the window closes with no second
 * press (the prompt then resolves its per-surface single-ESC action).
 * `onOtherKey` cancels the grace and resolves the single-ESC action
 * immediately -- the presses must be CONSECUTIVE (the double-click
 * analogy); any other key ends the gesture.
 *
 * Returns a disposer that clears the timer without resolving anything
 * (for prompt teardown).
 */
export function armEscapeGrace({
  windowMs = EXIT_ALL_WINDOW_MS,
  onSecondEscape,
  onGraceExpire,
}: {
  windowMs?: number;
  onSecondEscape: () => void;
  onGraceExpire: () => void;
}): { secondEscape: () => void; otherKey: () => void; dispose: () => void } {
  let concluded = false;
  const timer = setTimeout(() => {
    if (concluded) return;
    concluded = true;
    onGraceExpire();
  }, windowMs);
  // Never hold the process open for the grace window: the prompt is
  // about to resolve one way or the other, and an unref'd timer that
  // fires after teardown is a no-op (concluded stays false only while
  // the prompt lives).
  timer.unref?.();
  return {
    secondEscape() {
      if (concluded) return;
      concluded = true;
      clearTimeout(timer);
      onSecondEscape();
    },
    otherKey() {
      if (concluded) return;
      concluded = true;
      clearTimeout(timer);
      onGraceExpire();
    },
    dispose() {
      clearTimeout(timer);
      concluded = true;
    },
  };
}
