import readline from 'node:readline';
import { PassThrough, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { HistoryEntry } from './ShellHistoryOps';

/**
 * fzf-style fuzzy reverse search for the frodo shell (`frodo shell`),
 * bound to Ctrl+R.
 *
 * Node's readline owns Ctrl+R for its built-in incremental reverse search
 * and offers no way to unbind it, so the console does not feed process.stdin
 * to the REPL directly. This module provides the input stream for
 * `repl.start({ input })` and sits between process.stdin and the REPL:
 *
 * - While the search is closed, every byte passes through untouched, except
 *   Ctrl+R (0x12), which opens the search instead of readline's built-in
 *   search.
 * - While the search is open, every byte is swallowed and interpreted here
 *   (typing refines the query, Ctrl+R or Tab cycles matches, Enter runs the
 *   selection, right-arrow drops it on the line for editing, Esc and Ctrl+C
 *   cancel), so readline never sees the search interaction and the two
 *   cannot fight over the line buffer.
 *
 * The rendered state is a status line above the prompt plus the REPL's own
 * line buffer, which is set to the current selection and redrawn.
 */

const CTRL_C = 0x03;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const ESC = 0x1b;
const BACKSPACE = 0x7f;
const CTRL_R = 0x12;
const CTRL_O = 0x0f;

/**
 * Read a query once and return the function that scores history lines
 * against it: the score and the matched positions of a line, or null when it
 * does not match. A space in the query separates words: every word must
 * match the line, in any order and also where the words overlap, and the
 * score is the sum of the scores of the words (a word that is repeated counts
 * each time, and is looked for once). A query without a word matches every
 * line with the score 0, so that the history keeps its order (the newest
 * entry first).
 *
 * One word matches when it is an exact substring of the line (any case), or
 * when its characters appear in the line in order (a subsequence), each at
 * its earliest place. An exact match scores 1000, plus 6 for each character
 * of the word, minus the length of the line (at most 999 of it): the shorter
 * line is the better one, and an exact match beats every subsequence. A
 * subsequence scores 6 for each hit right after the one before, 1 for any
 * other hit, minus the characters skipped before each hit and after the last
 * one. Letters are matched as typed: `cafe` does not match `café`. The
 * indexes are the positions (UTF-16 units) of the hits, in ascending order
 * and each once, for highlighting; they are worked out only when the
 * second argument is true (listing the best lines does not need them, and
 * leaving them out takes about half the time).
 *
 * The search for an exact word is `indexOf`, unless the word has more than 300
 * characters and its length times the length of the line is above 100,000:
 * then it is a search that takes the length of the line plus the length of
 * the word. `indexOf` of the engine takes the word times the line for some
 * inputs, but only for long words (a second or more for a word of 2000
 * characters in a line of a million), and for a short word it is much faster
 * than a search written here.
 *
 * The web console's page ranks its history search with this very function:
 * the page carries its source (`Function.prototype.toString` in
 * ShellWebPage.ts), so it must use nothing outside itself and stay valid
 * JavaScript once the types are removed.
 * @param query what the user typed
 * @returns the function that scores one history line (higher is better), and
 *   gives its matched positions if asked to
 */
export function createHistoryScorer(
  query: string
): (
  line: string,
  withIndexes?: boolean
) => { score: number; indexes: number[] } | null {
  const counts = new Map<string, number>();
  for (const word of query.toLowerCase().split(/\s+/)) {
    if (word.length > 0) counts.set(word, (counts.get(word) || 0) + 1);
  }
  const words = Array.from(counts, ([word, count]) => ({
    word,
    count,
    // for the search that is linear: made when it is first needed
    table: null as number[] | null,
  }));
  // table[i]: the length of the longest start of the word that also ends at
  // its position i (what a search that never goes back needs).
  const tableOf = (word: string): number[] => {
    const table = [0];
    for (let i = 1, k = 0; i < word.length; i++) {
      while (k > 0 && word[i] !== word[k]) k = table[k - 1];
      if (word[i] === word[k]) k++;
      table.push(k);
    }
    return table;
  };
  const linearIndexOf = (t: string, word: string, table: number[]): number => {
    for (let i = 0, k = 0; i < t.length; i++) {
      while (k > 0 && t[i] !== word[k]) k = table[k - 1];
      if (t[i] === word[k]) k++;
      if (k === word.length) return i - k + 1;
    }
    return -1;
  };
  return (line, withIndexes) => {
    const t = line.toLowerCase();
    const marked = withIndexes ? new Set<number>() : null;
    let score = 0;
    for (const entry of words) {
      const q = entry.word;
      if (q.length > t.length) return null;
      let direct: number;
      if (q.length <= 300 || q.length * t.length <= 100000) {
        direct = t.indexOf(q);
      } else {
        entry.table = entry.table || tableOf(q);
        direct = linearIndexOf(t, q, entry.table);
      }
      let part = 0;
      if (direct !== -1) {
        if (marked) for (let k = 0; k < q.length; k++) marked.add(direct + k);
        part = 1000 + 6 * q.length - Math.min(line.length, 999);
      } else {
        let pos = 0;
        let last = -2;
        for (let i = 0; i < q.length; i++) {
          const at = t.indexOf(q[i], pos);
          if (at === -1) return null;
          if (marked) marked.add(at);
          part += at === last + 1 ? 6 : 1;
          part -= Math.max(0, at - pos);
          last = at;
          pos = at + 1;
        }
        part -= Math.max(0, line.length - pos);
      }
      score += entry.count * part;
    }
    return {
      score,
      indexes: marked ? Array.from(marked).sort((a, b) => a - b) : [],
    };
  };
}

const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export type HistorySearchHandle = {
  /** Stop filtering and detach (called when the console exits). */
  close(): void;
};

/** Hooks the search needs into the running REPL, attached after start. */
export type SearchHooks = {
  getLine(): string;
  setLine(line: string): void;
  refresh(): void;
  /**
   * Draw the pasted script on the output as the terminal would have:
   * the filter swallows the paste bytes (they must not reach readline),
   * so without this the screen shows nothing until the result appears.
   */
  echo(text: string): void;
  /**
   * A transient status line above the prompt (the paste's "Enter to
   * run" notice). Empty string clears it.
   */
  hint(text: string): void;
  /**
   * Recovery path: forward an escape byte to readline. Used when a Ctrl+R
   * raced past the filter and readline's built-in reverse search activated
   * anyway (rare, load-dependent): the guard cancels readline's search and
   * hands control back to this module.
   */
  sendEscape(): void;
  /** Subscribe to decoded keypresses on the REPL's input. */
  onKeypress(listener: (key: { ctrl?: boolean; name?: string }) => void): void;
};

/**
 * An overlay UI (the object explorer) that can claim the input stream:
 * while `wantsInput` returns true, every byte goes to the overlay instead
 * of the REPL or the search.
 */
export type InputOverlay = {
  /** Whether the overlay currently owns the input stream. */
  wantsInput(): boolean;
  /** Feed one input chunk to the overlay. */
  handle(chunk: Buffer): void;
  /** Ctrl+O was typed while no overlay was open: open on the last result. */
  openLast?(): void;
};

/**
 * Create the console's input stream with Ctrl+R fuzzy history search.
 *
 * @param getHistory newest-first history entries to search; read live on
 *   every keystroke, so entries added during the session are found too
 */
export type ConsoleInputState = {
  /**
   * A paste is in flight: the filter is holding the pasted lines and
   * the REPL's eval must collect rather than run, so the paste runs as
   * one script when it completes (the web console's behavior), not
   * line by line with an error per fragment.
   */
  pasteInFlight(): boolean;
};

export function createConsoleInput(
  getHistory: () => HistoryEntry[],
  overlay?: InputOverlay
): {
  /** Pass to repl.start({ input }). */
  input: PassThrough;
  /** Attach the REPL hooks (available only after repl.start). */
  attachHooks(hooks: SearchHooks): void;
  /** Begin piping process.stdin into the input (sets raw mode). */
  install(): void;
  /** Detach everything (called on console exit). */
  close(): void;
  /** The paste state, for the eval to cooperate with. */
  pasteState: ConsoleInputState;
} {
  let hooks: SearchHooks | undefined;
  let installed = false;

  // --- paste capture -------------------------------------------------------
  // The console enables bracketed paste mode (the terminal's standard):
  // the terminal then wraps every paste in ESC[200~ ... ESC[201~. Only
  // marker-wrapped input is held as a paste. A paste FILLS, not runs:
  // at the end marker the script is stashed, the line buffer shows its
  // first line, and a hint names the rest. The user's next Enter
  // submits the stash as one input (one 'line' event, one eval, one
  // history entry); Esc discards it. Unmarked multi-Enter input (fast
  // typing, a driver's send_line) is typed input as far as anything can
  // tell, and flows through line by line.
  const PASTE_START = '\x1b[200~';
  const PASTE_END = '\x1b[201~';
  let pasteBuffer: string[] = [];
  let pasteSeen = false;
  // The script a completed paste left behind, waiting for the Enter
  // that submits it ('\r'-joined: readline reverses a line buffer
  // holding LF, but carries CR through verbatim; JavaScript reads CR
  // as a line terminator, so the eval parses it, and the shell's line
  // handler normalizes CR back to LF for history). Null when nothing
  // waits.
  let pasteStash: string | null = null;
  // The line the buffer held before the paste loaded its placeholder;
  // what a discard puts back (an empty prompt, or the draft the user
  // was editing when they pasted).
  let pasteDraft = '';

  const pasteState: ConsoleInputState = {
    pasteInFlight: () => pasteSeen,
  };

  function endPaste(): void {
    if (!pasteSeen) return;
    pasteSeen = false;
    const lines = pasteBuffer;
    pasteBuffer = [];
    const text = lines
      .join('\n')
      .replace(/^\n+|\n+$/g, '')
      .trim();
    if (text.length === 0) return;
    pasteStash = text.replace(/\n/g, '\r');
    pasteDraft = hooks?.getLine() ?? '';
    if (hooks) {
      // The paste bytes never reached readline, so nothing was echoed:
      // draw the script once, as pasted, then load its first line as a
      // placeholder for what waits. No readline redraw here (called
      // from inside the input filter's callback, where a refresh
      // double-paints the prompt row); the setLine shows with the
      // next repaint.
      hooks.echo(`${text}\n`);
      hooks.setLine(text.split('\n')[0]);
      hooks.hint(
        `script pasted (${text.split('\n').length} lines): Enter to run, Esc to discard`
      );
    }
  }

  /** Drop the waiting stash and restore the line the buffer held
   * before the paste (an empty prompt, or the draft the user was
   * editing). No readline redraw: called from inside the input
   * filter's callback, where a refresh double-paints the prompt row;
   * the bytes this chunk carries land on the restored buffer and
   * readline repaints on its own. */
  function discardStash(): void {
    const had = pasteStash !== null;
    pasteStash = null;
    if (had && hooks) {
      // The placeholder line goes with the stash, or incoming typing
      // would land glued to the script's first line.
      hooks.setLine(pasteDraft);
      hooks.hint('');
    }
    pasteDraft = '';
  }

  // --- search state -------------------------------------------------------
  let active = false;
  let query = '';
  let matches: number[] = [];
  let matchCursor = 0;
  // The REPL line when the search opened; restored on cancel.
  let savedDraft = '';
  // Rows of the candidate list currently on screen (status line excluded).
  // Tracked so each redraw can erase the previous frame exactly.
  let drawnRows = 0;
  // Persists across chunks while active so a multi-byte UTF-8 character
  // split over two reads still decodes as one character.
  const decoder = new StringDecoder('utf8');

  function currentSelection(): HistoryEntry | null {
    const history = getHistory();
    const index = matches[matchCursor];
    return matches.length > 0 && index < history.length ? history[index] : null;
  }

  function recomputeMatches(): void {
    if (query.length === 0) {
      // An empty query is not "no results": the window opens on the most
      // recent entries, recency order, so Ctrl+R alone shows the history
      // (the same behavior as the web console's popup).
      matches = getHistory()
        .slice(0, 50)
        .map((_entry, idx) => idx);
      matchCursor = Math.min(matchCursor, Math.max(matches.length - 1, 0));
      return;
    }
    const history = getHistory();
    // Search newest-first (the history entries are newest-first): the
    // entries the user most likely wants first. Each entry is scored on its
    // own, so duplicate entries match individually.
    const scoreLine = createHistoryScorer(query);
    const scored: { idx: number; score: number }[] = [];
    history.forEach((entry, idx) => {
      const match = scoreLine(entry.text);
      if (match) scored.push({ idx, score: match.score });
    });
    // Best score first; equal scores stay newest first (the sort is stable).
    scored.sort((a, b) => b.score - a.score);
    matches = scored.slice(0, 50).map((r) => r.idx);
    matchCursor = Math.min(matchCursor, Math.max(matches.length - 1, 0));
  }

  /**
   * How many candidate rows the list shows at once. The list is redrawn
   * in place (cursor up, clear to end), so a fixed height keeps the
   * erasure arithmetic simple and the UI stable.
   */
  const LIST_ROWS = 8;

  /**
   * One line of the candidate list: the entry's id (a stable counter,
   * dim, so the eye can tell entries apart at a glance), then the
   * command, trimmed to the terminal width, with the selected row
   * highlighted. A multi-line entry shows its breaks as a dim ¶ (one
   * command, several lines; the marks say where the lines inside it
   * sit) and truncates after the first of them; the status line above
   * the list already carries the query and the counter. Entries from
   * files written before ids existed show without one.
   */
  function listRowText(entry: HistoryEntry, selected: boolean): string {
    const width = process.stdout.columns ?? 80;
    const max = Math.max(width - 6, 16);
    // One dim ¶ per line break, the text-editor convention: the entry's
    // own shape stays readable and where it ends is where a line lacks one.
    const marked = entry.text.replace(/\n/g, `${DIM}¶${RESET}`);
    let text = marked;
    if (entry.text.includes('\n')) {
      text = `${marked} ${DIM}…${RESET}`;
    }
    // The trim reads the marked text: an escape around ¶ counts toward the
    // length, and one extra row of room covers the marks of short entries.
    if (text.length > max + marked.length - entry.text.length) {
      text = `${marked.slice(0, max + marked.length - entry.text.length - 1)}…`;
    }
    const id =
      entry.id !== undefined ? `${DIM}${entry.id}${RESET}${' '.repeat(Math.max(1, 5 - String(entry.id).length))}` : '';
    const body = `  ${id}${text}`;
    return selected ? `${CYAN}${body}${RESET}` : `${DIM}${body}${RESET}`;
  }

  function render(): void {
    if (!active || !hooks) return;
    recomputeMatches();
    const total = matches.length;
    const counter = total > 0 ? ` ${matchCursor + 1}/${total}` : '';
    let statusLine: string;
    if (total === 0 && query.length > 0) {
      statusLine = `${DIM}(fuzzy-search) ${BOLD}no matches${RESET}`;
    } else {
      statusLine = `${DIM}(fuzzy-search)${RESET} ${CYAN}${query}${RESET}${DIM}${counter}${RESET}`;
    }
    // Erase the previous frame (list + status line + annotation). The
    // cursor is on the prompt row, below the annotation: move up over
    // every drawn row plus the status line, then clear down through all
    // of it, then draw the new frame top-down.
    readline.cursorTo(process.stdout, 0);
    if (drawnRows > 0) {
      readline.moveCursor(process.stdout, 0, -(drawnRows + 1));
      readline.clearScreenDown(process.stdout);
    } else {
      readline.clearLine(process.stdout, 0);
    }
    drawnRows = 0;
    const selection = currentSelection();
    // The list: with a query, the fuzzy matches; with none, the most
    // recent entries (recency order), so Ctrl+R alone shows the history
    // and Up/Down pick from it, like the web console's popup.
    if (matches.length > 0) {
      const visible = Math.min(LIST_ROWS, matches.length);
      // A window slides with the cursor so the selection stays in view.
      const start = Math.max(
        0,
        Math.min(matchCursor - visible + 1, matches.length - visible)
      );
      const end = Math.min(start + visible, matches.length);
      const history = getHistory();
      for (let i = start; i < end; i++) {
        const entry = history[matches[i]];
        process.stdout.write(`${listRowText(entry, i === matchCursor)}\n`);
        drawnRows++;
      }
    }
    process.stdout.write(`${statusLine}\n`);
    // The selection's age and environment, under the list (or under the
    // status line when it is hidden). One row, dim.
    if (selection && (selection.ts !== undefined || selection.host)) {
      const parts: string[] = [];
      if (typeof selection.ts === 'number') {
        const secs = Math.max(0, (Date.now() - selection.ts) / 1000);
        parts.push(
          secs < 90
            ? 'just now'
            : secs < 3600
              ? `${Math.round(secs / 60)}m ago`
              : secs < 86400
                ? `${Math.round(secs / 3600)}h ago`
                : `${Math.round(secs / 86400)}d ago`
        );
      }
      if (selection.host) parts.push(selection.host);
      if (parts.length > 0) {
        process.stdout.write(`${DIM}${parts.join(' · ')}${RESET}\n`);
        drawnRows++;
      }
    }
    // The selection rides the readline line while the list is open, so
    // the eye sees what Enter would run. A multi-line entry set whole
    // wraps the prompt block over several physical rows, and the frame
    // erase (which counts rows) then lands wrong: every scroll step left
    // the previous frame's top rows on screen. The buffer shows the
    // entry's first line only; the whole text goes onto the line where
    // it is used (Enter and Tab below, after the frame is gone).
    const shown = selection ? selection.text.split('\n')[0] : query;
    hooks.setLine(shown);
    hooks.refresh();
  }

  function openSearch(): void {
    active = true;
    query = '';
    matches = [];
    matchCursor = 0;
    decoder.end();
    savedDraft = hooks?.getLine() ?? '';
    render();
  }

  /** Transition back to pass-through; restore the draft when asked. */
  function closeSearch(restoreDraft: boolean): void {
    if (!active) return;
    active = false;
    decoder.end();
    // Erase the whole frame: the list, the annotation, and the status
    // line. The cursor is on the prompt row below the annotation.
    if (drawnRows > 0) {
      readline.cursorTo(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, -(drawnRows + 1));
      readline.clearScreenDown(process.stdout);
    } else {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
    }
    drawnRows = 0;
    if (restoreDraft && hooks) {
      hooks.setLine(savedDraft);
      hooks.refresh();
    }
  }

  /**
   * Interpret one chunk of input while the search is active. Everything is
   * swallowed; bytes after the search closes (the Enter that accepts, and
   * anything the user typed in the same chunk) are returned for
   * pass-through.
   */
  function interpretActive(chunk: Buffer): Buffer {
    const passthrough: number[] = [];
    let i = 0;
    while (i < chunk.length) {
      if (!active) {
        // Closed mid-chunk (Enter): the rest belongs to the REPL again —
        // except another Ctrl+R, which opens a fresh search instead of
        // reaching readline (whose native reverse search would then fight
        // this module's guard for every later keypress).
        if (chunk[i] === CTRL_R) {
          openSearch();
          i++;
          continue;
        }
        for (let j = i; j < chunk.length; j++) passthrough.push(chunk[j]);
        break;
      }
      const byte = chunk[i];
      if (byte === CR || byte === LF) {
        const selection = currentSelection();
        if (selection !== null) {
          // Accept: put the selection on the line and let the Enter
          // (already accounted for below) submit it. CR-joined, not
          // LF: readline reverses a line buffer holding LF, so the
          // submitted line event would run the entry inside-out (a
          // stored multi-line entry then re-runs backwards and errors
          // on its own redeclarations).
          closeSearch(false);
          hooks?.setLine(selection.text.replace(/\n/g, '\r'));
          hooks?.refresh();
          passthrough.push(CR);
        } else {
          // Nothing selected: cancel and restore the draft, no execution.
          closeSearch(true);
        }
      } else if (byte === TAB) {
        // Tab accepts the selection onto the line WITHOUT running it, so
        // it can be edited first (the web popup's paste-for-editing). The
        // selection closes the search; readline redraws the line.
        const selection = currentSelection();
        if (selection !== null) {
          closeSearch(false);
          hooks?.setLine(selection.text.replace(/\n/g, '\r'));
          hooks?.refresh();
        } else {
          closeSearch(true);
        }
      } else if (byte === ESC) {
        // An arrow key arrives as ESC [ A/B: what the user means is
        // navigation, not "cancel". Peek at the next bytes: a known
        // arrow sequence moves the selection instead of closing.
        const next = chunk[i + 1];
        const after = chunk[i + 2];
        if (next === 0x5b && (after === 0x41 || after === 0x42)) {
          // Up (0x41) or Down (0x42): move through the list. The consumed
          // arrow is 3 bytes; the loop's i++ then needs a +2 hop.
          const previous = matchCursor;
          matchCursor =
            after === 0x41
              ? Math.max(0, matchCursor - 1)
              : Math.min(matches.length - 1, matchCursor + 1);
          if (matchCursor !== previous) render();
          i += 2;
        } else {
          closeSearch(true);
        }
      } else if (byte === CTRL_C) {
        // Cancel without passing the interrupt byte to readline.
        closeSearch(true);
      } else if (byte === BACKSPACE) {
        query = query.slice(0, -1);
        render();
      } else if (byte >= 0x20 && byte < 0x7f) {
        query += String.fromCharCode(byte);
        render();
      } else if (byte >= 0x80) {
        // UTF-8: decode everything from here through the persistent decoder
        // (split multi-byte sequences survive chunk boundaries).
        const decoded = decoder.write(chunk.subarray(i));
        for (const ch of decoded) {
          if (ch >= ' ') query += ch;
        }
        render();
        break;
      }
      // Remaining control bytes (ctrl-d, ctrl-u, ...) are ignored while the
      // search is open.
      i++;
    }
    return Buffer.from(passthrough);
  }

  const filter = new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: (err?: Error | null, data?: Buffer) => void
    ) {
      const push = (data?: Buffer) => callback(null, data);
      try {
        // The overlay (object explorer) has first claim on the input while
        // it is open.
        if (overlay?.wantsInput()) {
          overlay.handle(chunk);
          push(undefined);
          return;
        }
        if (active) {
          const rest = interpretActive(chunk);
          push(rest.length > 0 ? rest : undefined);
          return;
        }
        // A paste waits on the stash (see the capture note): the next
        // Enter submits the whole script. A chunk that opens with Enter
        // is that submit. Anything else first (an edit, a recall, Esc)
        // leaves the buffer disagreeing with the first line the stash
        // was keyed to: the stash is dropped and the chunk flows
        // through as plain typing. One shot: paste, then Enter runs it.
        if (pasteStash !== null && !pasteSeen) {
          if (chunk[0] === CR) {
            // The Enter byte flows through the pipe unchanged; the
            // script is already on the line buffer, so readline's
            // normal Enter path submits it as one line event. (An
            // injected Enter written straight into readline's input
            // from inside this transform wedges readline: bytes stop
            // being read. The real byte through the pipe never does.)
            hooks.setLine(pasteStash);
            pasteStash = null;
            pasteDraft = '';
            push(chunk);
            return;
          }
          discardStash();
          // Fall through: plain typed input from here on.
        }
        // A bracketed paste: the terminal wrapped it (see the capture
        // note). Everything from the start marker to the end marker is
        // one script: hold the lines, drop the markers, and stash the
        // whole at the end marker. Bytes around the markers flow as
        // typed input.
        const text = chunk.toString('utf8');
        const startIndex = text.indexOf(PASTE_START);
        const endIndex = text.indexOf(PASTE_END);
        if (pasteSeen) {
          if (endIndex !== -1) {
            const body = text.slice(0, endIndex);
            for (const line of body.split(/[\r\n]+/)) {
              if (line.length > 0) pasteBuffer.push(line);
            }
            endPaste();
            const rest = text.slice(endIndex + PASTE_END.length);
            push(rest.length > 0 ? Buffer.from(rest, 'utf8') : undefined);
            return;
          }
          for (const line of text.split(/[\r\n]+/)) {
            if (line.length > 0) pasteBuffer.push(line);
          }
          push(undefined);
          return;
        }
        if (startIndex !== -1) {
          pasteSeen = true;
          const afterStart = text.slice(startIndex + PASTE_START.length);
          if (endIndex > startIndex) {
            const body = text.slice(
              startIndex + PASTE_START.length,
              endIndex
            );
            for (const line of body.split(/[\r\n]+/)) {
              if (line.length > 0) pasteBuffer.push(line);
            }
            endPaste();
            const rest = text.slice(endIndex + PASTE_END.length);
            push(rest.length > 0 ? Buffer.from(rest, 'utf8') : undefined);
            return;
          }
          for (const line of afterStart.split(/[\r\n]+/)) {
            if (line.length > 0) pasteBuffer.push(line);
          }
          push(undefined);
          return;
        }
        const open = chunk.indexOf(CTRL_R);
        const openExplore = chunk.indexOf(CTRL_O);
        if (open === -1 && openExplore === -1) {
          push(chunk);
          return;
        }
        // The earliest trigger byte in the chunk wins; bytes before it pass
        // through, and the rest belongs to whichever UI just opened.
        const trigger =
          open === -1
            ? openExplore
            : openExplore === -1
              ? open
              : Math.min(open, openExplore);
        const before = chunk.subarray(0, trigger);
        const after = chunk.subarray(trigger + 1);
        if (trigger === open) {
          openSearch();
          const rest = interpretActive(after);
          push(
            before.length > 0
              ? Buffer.concat([before, rest])
              : rest.length > 0
                ? rest
                : undefined
          );
        } else if (overlay?.openLast) {
          overlay.openLast();
          // The viewer claims the stream from here; interpret the remainder
          // as viewer input.
          if (after.length > 0) overlay.handle(after);
          push(before.length > 0 ? before : undefined);
        } else {
          // No overlay registered: let the byte through untouched.
          push(chunk);
        }
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      // In case the stream ends mid-search (process teardown) or
      // mid-paste (the paste end timer never fired): run what was held.
      if (active) closeSearch(false);
      if (pasteBuffer.length > 0) {
        endPaste();
      }
      callback();
    },
  });

  return {
    input: new PassThrough(),
    pasteState,
    attachHooks(attached: SearchHooks) {
      hooks = attached;
      // Defense-in-depth: if a Ctrl+R ever races past the filter (seen once
      // under heavy machine load) readline's built-in reverse search
      // activates instead. This guard detects that keypress reaching
      // readline while the module's own search is closed, cancels
      // readline's search with an escape byte, and opens the module's
      // search in its place.
      attached.onKeypress((key) => {
        if (active) return;
        if (key.ctrl && key.name === 'r') {
          attached.sendEscape();
          openSearch();
        }
      });
    },
    install() {
      if (installed) return;
      installed = true;
      const stdin = process.stdin;
      if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(true);
        // Bracketed paste: the terminal wraps every paste in
        // ESC[200~ ... ESC[201~, which is how the filter tells a paste
        // from typed input (see the capture note). Terminals that do
        // not support it simply never send the markers, and everything
        // flows as before.
        process.stdout.write('\x1b[?2004h');
      }
      stdin.resume();
      stdin.pipe(filter);
      filter.pipe(this.input);
    },
    close() {
      closeSearch(false);
      endPaste();
      discardStash();
      if (installed) {
        if (process.stdin.isTTY) {
          process.stdout.write('\x1b[?2004l');
        }
        process.stdin.unpipe(filter);
        filter.unpipe(this.input);
        installed = false;
      }
    },
  };
}
