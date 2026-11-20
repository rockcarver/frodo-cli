import readline from 'node:readline';
import { PassThrough, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import fuzzysort from 'fuzzysort';
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
} {
  let hooks: SearchHooks | undefined;
  let installed = false;

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
    // entries the user most likely wants first. Keyed search carries each
    // entry's position through, so duplicate entries match individually.
    // fuzzysort can throw on pathological targets; empty results then.
    try {
      const results = fuzzysort.go(
        query,
        history.map((entry, idx) => ({ line: entry.text, idx })),
        { key: 'line', limit: 50 }
      );
      matches = results.map((r) => r.obj.idx);
    } catch {
      matches = [];
    }
    matchCursor = Math.min(matchCursor, Math.max(matches.length - 1, 0));
  }

  /**
   * How many candidate rows the list shows at once. The list is redrawn
   * in place (cursor up, clear to end), so a fixed height keeps the
   * erasure arithmetic simple and the UI stable.
   */
  const LIST_ROWS = 8;

  /**
   * One line of the candidate list: the command, trimmed to the terminal
   * width, with the selected row highlighted. Long commands truncate to
   * the width available; the status line above the list already carries
   * the query and the counter.
   */
  function listRowText(entry: HistoryEntry, selected: boolean): string {
    const width = process.stdout.columns ?? 80;
    const max = Math.max(width - 6, 16);
    let text = entry.text.split('\n')[0];
    if (entry.text.includes('\n')) {
      text = text.length > max - 1 ? `${text.slice(0, max - 2)}…` : `${text} …`;
      // max for multiline: leave room for the ellipsis marker
    }
    if (text.length > max) text = `${text.slice(0, max - 1)}…`;
    const body = `  ${text}`;
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
    hooks.setLine(selection?.text ?? query);
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
          // (already accounted for below) submit it.
          closeSearch(false);
          hooks?.setLine(selection.text);
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
          hooks?.setLine(selection.text);
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
      try {
        // The overlay (object explorer) has first claim on the input while
        // it is open.
        if (overlay?.wantsInput()) {
          overlay.handle(chunk);
          callback(null, undefined);
          return;
        }
        if (active) {
          const rest = interpretActive(chunk);
          callback(null, rest.length > 0 ? rest : undefined);
          return;
        }
        const open = chunk.indexOf(CTRL_R);
        const openExplore = chunk.indexOf(CTRL_O);
        if (open === -1 && openExplore === -1) {
          callback(null, chunk);
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
          callback(
            null,
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
          callback(null, before.length > 0 ? before : undefined);
        } else {
          // No overlay registered: let the byte through untouched.
          callback(null, chunk);
        }
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      // In case the stream ends mid-search (process teardown).
      if (active) closeSearch(false);
      callback();
    },
  });

  return {
    input: new PassThrough(),
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
      }
      stdin.resume();
      stdin.pipe(filter);
      filter.pipe(this.input);
    },
    close() {
      closeSearch(false);
      if (installed) {
        process.stdin.unpipe(filter);
        filter.unpipe(this.input);
        installed = false;
      }
    },
  };
}
