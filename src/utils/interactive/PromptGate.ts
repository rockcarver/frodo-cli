/**
 * Central gate deciding whether frodo may prompt interactively, plus the
 * terminal prompts built on `@inquirer/core` for gap-filling missing
 * command input (docs/INTERACTIVE-COMMANDS.md).
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
 *
 * ## The frame
 *
 * Like every picker, a text prompt is drawn as a frame (record 0018): the
 * Navigate menu on top, the question in a box, and underneath the footer
 * the caller passes as `preview` -- the command being authored, with the
 * text typed so far shadowed in (record 0019). A prompt without a footer
 * is still framed; a caller that has the command passes one.
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
import {
  descriptionPanelLines,
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  stripAnsi,
} from './NavigationMenu';
import { canPrompt, notePromptRendered } from './PromptGateState';
import { useTerminalWidth } from './TerminalWidth';

export {
  canPrompt,
  notePromptRendered,
  promptsRendered,
  setNeverPrompt,
} from './PromptGateState';

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
  /**
   * A sentence or two inside the box under the question: what to type, or
   * why it is asked again. Wrapped to the frame, so the question itself can
   * stay short.
   */
  hint?: string;
  /**
   * The footer under the frame: the command being authored (see
   * CommandPreview.ts). A function is called on every render with the text
   * typed so far, so the footer can show the command gaining the value
   * before <enter> commits. A hidden prompt (`promptPassword`) always gets
   * `''`: a secret never reaches a footer.
   */
  preview?: string | ((typed: string) => string);
};

/** What the text prompt component renders: the caller's config and whether the input is hidden. */
type TextPromptConfig = TextInputConfig & { suppress: boolean };

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
  notePromptRendered();
  try {
    // Erase-on-conclude, like every prompt (record 0018): the frame goes
    // away when the prompt settles, whatever way it settles.
    return await TextPrompt(
      { ...config, ...opts },
      { clearPromptOnDone: true }
    );
  } catch (error) {
    if (error instanceof ExitPromptError) return EMPTY_INPUT;
    throw error;
  }
}

const TextPrompt = createPrompt(
  (cfg: TextPromptConfig, done: (value: string) => void) => {
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
    const [status, setStatus] = useState<'idle' | 'done' | 'declined'>('idle');
    const prefix = usePrefix({
      status: status === 'declined' ? 'done' : status,
    });
    // The frame follows the terminal (re-drawn on resize). Declared after
    // every other useState so their hook order is unchanged.
    const width = useTerminalWidth();

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

    // A suppressed prompt shows one asterisk per typed character instead
    // of the text.
    const shown = cfg.suppress ? '*'.repeat(value.length) : value;

    if (status === 'declined') {
      return `${prefix} ${cfg.message} ${c.muted('(no input)')}`;
    }
    if (status === 'done') {
      return `${prefix} ${cfg.message} ${c.positive(shown)}`;
    }

    // Idle view: readline's native echo of the buffer is muted (see
    // create-prompt's output.mute()), so the typed characters would not
    // appear at all unless the view renders them. The frame is the same
    // three parts as every picker (record 0018): the Navigate menu, the
    // question in a box with the entry row (the cursor carries a glyph),
    // and the caller's footer.
    const entry = shown
      ? c.command(shown)
      : cfg.default !== undefined && !cfg.suppress
        ? c.muted(`(${cfg.default})`)
        : '';
    const menu = renderNavigationMenu(
      navigationMenuItems({
        move: false,
        type: cfg.suppress ? 'the value (hidden)' : 'a value',
        enter: 'commit',
        escape: 'back out',
      }),
      width
    );
    const panel = renderFramedBox({
      title: { text: `${prefix} ${cfg.message}`, plain: `? ${cfg.message}` },
      lines: [
        ...(cfg.hint
          ? [...descriptionPanelLines(cfg.hint, width), { text: '', plain: '' }]
          : []),
        { text: `› ${entry}`, plain: `› ${stripAnsi(entry)}` },
      ],
      width,
    });
    // Live footer: a function form is re-invoked on EVERY render with the
    // typed text, so the footer shows the command gaining the value before
    // <enter> commits. Never the text of a hidden prompt.
    const footer =
      typeof cfg.preview === 'function'
        ? cfg.preview(cfg.suppress ? '' : value)
        : cfg.preview;
    return [menu, panel, footer].filter(Boolean).join('\n');
  }
);
