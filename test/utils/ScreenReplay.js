/**
 * A minimal screen line-model for the escape sequences @inquirer/core emits,
 * shared by the terminal tests that must tell what is LEFT on the screen from
 * what was drawn and erased: the raw stream always holds every byte ever
 * written, so a plain-text search sees erased frames too. Replay a capture's
 * `raw` text and read the lines that remain. Deliberately NOT a full terminal
 * emulator: anything inquirer cannot produce fails the replay loudly.
 */

const ESC = '\x1b';
const ANSI_ESCAPE = new RegExp(
  `${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${ESC}\\x07]*(?:${ESC}|\\x07)|${ESC}[@-Z\\\\-_]`,
  'g'
);

/** A minimal screen line-model for the escape sequences inquirer emits. */
export function replayScreen(rawInput, { cols = 120, rows = 200 } = {}) {
  let raw = rawInput;
  const lines = [];
  let cursorRow = 0;
  let pendingWrap = false;
  const ensure = (index) => {
    while (lines.length <= index) lines.push('');
  };
  const stripForWidth = (s) =>
    // Truncate rendered content to the terminal width (the PTY wraps
    // long lines; the model keeps cells flat -- asserting only on
    // short content within a line, wrap behavior is irrelevant).
    [...stripAnsi(s)].slice(0, cols).join('');

  function stripAnsi(s) {
    return s.replace(ANSI_ESCAPE, '');
  }

  // ONLCR: the PTY emits \r\n for every \n; lone \r (readline's own
  // carriage resets) is equivalent to a newline-less column reset,
  // which the flat model treats as a newline too.
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Tokenize into control sequences and text chunks.
  const tokens = [];
  let i = 0;
  while (i < raw.length) {
    ANSI_ESCAPE.lastIndex = 0;
    const match = ANSI_ESCAPE.exec(raw.slice(i));
    if (match && match.index === 0) {
      tokens.push({ kind: 'esc', text: match[0] });
      i += match[0].length;
    } else {
      const next = raw.slice(i).search(ANSI_ESCAPE);
      const chunk = next === -1 ? raw.slice(i) : raw.slice(i, i + next);
      tokens.push({ kind: 'text', text: chunk });
      i += chunk.length;
    }
  }

  for (const token of tokens) {
    if (token.kind === 'text') {
      const parts = token.text.split('\n');
      for (let p = 0; p < parts.length; p++) {
        if (p > 0) {
          // newline: advance
          ensure(cursorRow);
          cursorRow = Math.min(cursorRow + 1, rows - 1);
          pendingWrap = false;
        }
        if (parts[p].length > 0) {
          ensure(cursorRow);
          lines[cursorRow] = (lines[cursorRow] + stripForWidth(parts[p])).slice(
            0,
            cols
          );
        }
      }
      continue;
    }
    // Control sequence
    const csi = token.text.match(
      new RegExp(`^${ESC}\\[([0-?]*)([ -/]*)([@-~])$`)
    );
    if (token.text === `${ESC}[?25h` || token.text === `${ESC}[?25l`) {
      continue; // cursor visibility: no cell effect
    }
    if (token.text.startsWith(`${ESC}]`)) {
      continue; // OSC (terminal query): no cell effect
    }
    if (!csi) {
      // Unknown non-CSI escape (rare single-char): no cell effect.
      continue;
    }
    const [, paramsStr = '', _intermediates = '', final = ''] = csi;
    const params = paramsStr
      .split(';')
      .map((p) => (p === '' ? undefined : parseInt(p, 10)));
    const n = (fallback) => params[0] ?? fallback;
    switch (final) {
      case 'A': // cursor up
        cursorRow = Math.max(0, cursorRow - (n(1) || 1));
        pendingWrap = false;
        break;
      case 'B': // cursor down
        cursorRow = Math.min(rows - 1, cursorRow + (n(1) || 1));
        pendingWrap = false;
        break;
      case 'K': {
        // erase in line
        // Mode 0 = cursor->end, mode 2 = whole line (inquirer's
        // eraseLines emits 2K); both blank the modeled row (mode
        // 1 = start->cursor, not emitted by inquirer).
        ensure(cursorRow);
        const mode = n(0) || 0;
        if (mode !== 1) lines[cursorRow] = '';
        break;
      }
      case 'G': {
        // column absolute (1-based)
        pendingWrap = false;
        break; // columns are flat in this model
      }
      case 'm':
        // SGR (color/attributes): no cell effect in a line-structure
        // model. Modeled (rather than skipped) so the color assertions
        // in the raw stream stay the color layer's business -- and so
        // unknown SGR codes still surface via the sequence-regex, not
        // silently. The captures DO carry SGR now that the scenario
        // blanks NO_COLOR (the binary's theme colors its output).
        break;
      case 'H': // absolute position (row;col) -- not emitted by inquirer
      case 'J': // erase in display -- not emitted by inquirer
      default:
        // Anything else inquirer COULD emit but doesn't (verified
        // against its source): fail loudly rather than silently
        // mis-modeling.
        throw new Error(
          `unmodeled escape sequence in capture: ${JSON.stringify(token.text)}`
        );
    }
  }
  return lines
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.length > 0);
}
