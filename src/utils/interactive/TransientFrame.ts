/**
 * A frame that stays on the screen while the CLI works and no prompt is open
 * (decision record 0046: the connection page says "Logging in..." in its own
 * frame while the login runs).
 *
 * A prompt cannot be open then. The login may ask for a second factor, which
 * reads the terminal synchronously, so no prompt may hold the terminal; the
 * page closes, the login runs, and the page opens again with the outcome. In
 * between, the frame is plain text written here, and anything that writes to the
 * terminal first calls `clearTransientFrame()`, which takes the frame away
 * (`printMessage`, the synchronous `question`, the start of any prompt), so a
 * message or a prompt of the login lands on a clean screen and nothing is
 * erased by line count afterwards.
 *
 * Zero-import, because the modules that call `clearTransientFrame` are
 * loaded by tests that mock frodo-lib wholesale. The escape sequences are the
 * ones @inquirer/core emits to erase a frame, so a terminal test replays
 * them with test/utils/ScreenReplay.js.
 */

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const ERASE_LINE = '\x1b[2K';
const CURSOR_UP = '\x1b[1A';
const CURSOR_LEFT = '\x1b[G';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;

/** The rows of the screen the frame occupies, 0 when none is shown. */
let shownRows = 0;

/**
 * How many terminal rows a text takes: one per line, more for a line wider than
 * the terminal (the terminal wraps it).
 * @param text the text, possibly colored
 * @param columns the width of the terminal
 * @returns the number of rows
 */
export function rowsOf(text: string, columns: number): number {
  const width = Math.max(1, columns);
  return text
    .replace(ANSI, '')
    .split('\n')
    .reduce(
      (rows, line) => rows + Math.max(1, Math.ceil([...line].length / width)),
      0
    );
}

/**
 * Draws a frame and leaves it on the screen, the cursor at the end of its last
 * row. Replaces a frame that is shown already.
 * @param text the frame, lines joined by line breaks
 */
export function showTransientFrame(text: string): void {
  clearTransientFrame();
  shownRows = rowsOf(text, process.stdout.columns || 120);
  process.stdout.write(`${HIDE_CURSOR}${text}`);
}

/**
 * Shows a frame while some work runs, and takes it away when the work is over,
 * whether it succeeded or threw. Whatever the work prints or asks has taken the
 * frame away already (see the module doc), so this only clears what is left.
 * @param frame the frame, lines joined by line breaks
 * @param work what runs while the frame is shown
 * @returns what the work returns
 */
export async function whileShowing<T>(
  frame: string,
  work: () => Promise<T>
): Promise<T> {
  showTransientFrame(frame);
  try {
    return await work();
  } finally {
    clearTransientFrame();
  }
}

/** Whether a frame is on the screen. */
export function transientFrameShown(): boolean {
  return shownRows > 0;
}

/**
 * Takes the frame off the screen and puts the cursor where it started. Does
 * nothing when no frame is shown, so every writer can call it first.
 */
export function clearTransientFrame(): void {
  if (shownRows === 0) return;
  const rows = shownRows;
  shownRows = 0;
  let erase = '';
  for (let row = 0; row < rows; row += 1) {
    erase += ERASE_LINE + (row < rows - 1 ? CURSOR_UP : '');
  }
  process.stdout.write(`${erase}${CURSOR_LEFT}${SHOW_CURSOR}`);
}
