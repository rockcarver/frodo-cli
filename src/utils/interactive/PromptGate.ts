/**
 * Central gate deciding whether frodo may prompt interactively, plus the
 * terminal prompts built on `@inquirer/core` for gap-filling missing
 * command input (INTERACTIVE-COMMANDS-PLAN.md, Phase 1).
 *
 * ## The gate
 *
 * Re-exported from `PromptGateState.ts` (which holds its full
 * documentation and stays importable from unit tests -- this file pulls
 * in the frodo-lib-importing ColorTheme, and this CLI's Jest setup cannot
 * load frodo-lib; see src/app.commandWiring.test.ts's header comment).
 *
 * ## The prompts
 *
 * Deliberately hand-built on `@inquirer/core` (same pattern as the
 * existing exemplars `EscapableSelectPrompt.ts`/`JourneyDebugPrompt.ts`)
 * rather than adding `@inquirer/input`/`@inquirer/password`: the packaged
 * prompts throw `ExitPromptError` on Escape and EOF, while the gap-fill
 * layer needs Escape to resolve to a sentinel so callers can fall through
 * to their pre-existing missing-input error paths -- which is exactly the
 * contract the existing hand-built prompts already established.
 */

import {
  createPrompt,
  ExitPromptError,
  isEnterKey,
  useKeypress,
  usePrefix,
  useState,
} from '@inquirer/core';
import c from '../ColorTheme';
import { canPrompt } from './PromptGateState';

export { canPrompt, setNeverPrompt } from './PromptGateState';

/**
 * The empty-string result of `promptInput`/`promptPassword`. The prompts
 * resolve with `''` in two cases that callers must tell apart, so this
 * sentinel is what they branch on: the user pressed Enter on an empty
 * line (meaning "I have nothing to type", e.g. no password), versus
 * `undefined`, which means prompting was disallowed by the gate and the
 * caller should simply fall through to its pre-existing missing-input
 * error path without printing anything prompt-related.
 *
 * Escape ALSO resolves with `''` -- for gap-fills, "never mind, I'll type
 * the flag myself" and "there is no password" have the same practical
 * outcome (no value supplied, command proceeds to its existing error), so
 * a separate escape sentinel would only add API surface. `promptInput`
 * renders `(no input)` after resolving so the transcript shows what
 * happened.
 */
export const EMPTY_INPUT = '';

export type TextInputConfig = {
  message: string;
  /**
   * Value applied when the user presses Enter on an empty line (shown as
   * a muted hint). When omitted, Enter-on-empty resolves `''` and the
   * caller decides what that means.
   */
  default?: string;
};

/**
 * A `promptInput`/`promptPassword` result: `undefined` (gate refused --
 * caller falls through silently to its existing missing-input path),
 * `''` (user aborted/declined -- caller treats as missing input with its
 * existing error), or a non-empty string.
 */
export type TextInputResult = string | undefined;

/**
 * Read a line of free-form text. Paste-safe and editable (the readline
 * buffer does the editing; the prompt only reads it), unlike accumulating
 * individual keypresses by hand.
 */
export async function promptInput(
  config: TextInputConfig
): Promise<TextInputResult> {
  if (!canPrompt()) return undefined;
  return runTextPrompt(config, { suppress: false });
}

/**
 * Read a line of text without echoing it (passwords, passphrases, and
 * similar secrets). Same result contract as `promptInput`.
 */
export async function promptPassword(
  config: TextInputConfig
): Promise<TextInputResult> {
  if (!canPrompt()) return undefined;
  return runTextPrompt(config, { suppress: true });
}

/**
 * Terminal conditions outside the user's in-prompt choices: stdin EOF
 * (Ctrl-D, e.g. the driver's shutdown write) and Ctrl-C both reject the
 * prompt with @inquirer/core's ExitPromptError. For gap-fills both mean
 * "no value supplied" and must degrade to the declined result (`''`) so
 * the caller falls through to its pre-existing missing-input error --
 * never a raw stack trace. (Escape is handled in-prompt, so it never
 * reaches this wrapper.)
 */
async function runTextPrompt(
  config: TextInputConfig,
  opts: { suppress: boolean }
): Promise<string> {
  try {
    return await textPrompt(config, opts);
  } catch (error) {
    if (error instanceof ExitPromptError) return EMPTY_INPUT;
    throw error;
  }
}

function textPrompt(
  config: TextInputConfig,
  { suppress }: { suppress: boolean }
): Promise<string> {
  const TextPrompt = createPrompt(
    (cfg: TextInputConfig, done: (value: string) => void) => {
      // The readline buffer (`rl.line`) is the source of truth for the
      // typed text -- editing (backspace, ctrl+u, paste) is readline's
      // job. It is mirrored into state on every keystroke because of an
      // ordering subtlety verified against the installed @inquirer/core:
      // when Enter arrives, readline has ALREADY consumed and cleared its
      // buffer, so reading `rl.line` inside the Enter branch sees `''`
      // (the typed text only ever visible on non-Enter keypresses). The
      // mirror is written by the keypress immediately before Enter in
      // stream order, so reading state there sees the completed line.
      const [value, setValue] = useState('');
      const [status, setStatus] = useState<'idle' | 'done' | 'declined'>(
        'idle'
      );
      const prefix = usePrefix({
        status: status === 'declined' ? 'done' : status,
      });

      useKeypress((key, rl) => {
        if (isEnterKey(key)) {
          // rl.line is already consumed at this point (see above); use the
          // mirror, falling back defensively for a bare first-keystroke
          // Enter.
          const line = value || rl.line || '';
          if (line.length === 0 && cfg.default !== undefined) {
            setValue(cfg.default);
            setStatus('done');
            done(cfg.default);
          } else if (line.length === 0) {
            // Enter on an empty line with no default: a deliberate "no
            // value". Same resolution as Escape (see EMPTY_INPUT), but
            // rendered distinctly so the transcript shows the user
            // actively declined rather than backed out.
            setStatus('declined');
            done('');
          } else {
            setValue(line);
            setStatus('done');
            done(line);
          }
        } else if (key.name === 'escape') {
          setStatus('declined');
          done('');
        } else {
          // Everything else (typing, backspace, ctrl+u, paste...) is
          // handled by the underlying readline instance itself. Mirroring
          // `rl.line` into state drives the redraw AND keeps the
          // completed line available to the Enter branch above.
          setValue(rl.line);
        }
      });

      const defaultHint =
        cfg.default !== undefined && !suppress
          ? ` ${c.muted(`(${cfg.default})`)}`
          : '';

      if (status === 'declined') {
        return `${prefix} ${config.message} ${c.muted('(no input)')}`;
      }
      if (status === 'done') {
        const shown = suppress ? '*'.repeat(value.length) : value;
        return `${prefix} ${config.message} ${c.positive(shown)}`;
      }

      // Idle view: readline's native echo of the buffer is muted (see
      // create-prompt's output.mute()), so the typed characters would not
      // appear at all unless the view renders them. A suppressed prompt
      // shows one asterisk per typed character instead of the text.
      const shown = suppress ? '*'.repeat(value.length) : value;
      return `${prefix} ${config.message}${defaultHint}${shown ? ` ${c.command(shown)}` : ''}`;
    }
  );
  return TextPrompt(config, { clearPromptOnDone: true });
}
