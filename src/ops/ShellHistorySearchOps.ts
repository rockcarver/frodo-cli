import readline from 'node:readline';
import { PassThrough, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import fuzzysort from 'fuzzysort';

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
 * @param getHistory newest-first history array to search; read live on every
 *   keystroke, so entries added during the session are found too
 */
export function createConsoleInput(
  getHistory: () => string[],
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
  // Persists across chunks while active so a multi-byte UTF-8 character
  // split over two reads still decodes as one character.
  const decoder = new StringDecoder('utf8');

  function currentSelection(): string | null {
    const history = getHistory();
    const index = matches[matchCursor];
    return matches.length > 0 && index < history.length ? history[index] : null;
  }

  function recomputeMatches(): void {
    if (query.length === 0) {
      matches = [];
      matchCursor = 0;
      return;
    }
    const history = getHistory();
    // Search newest-first (the REPL history array is newest-first): the
    // entries the user most likely wants first. Keyed search carries each
    // entry's position through, so duplicate entries match individually.
    // fuzzysort can throw on pathological targets; empty results then.
    try {
      const results = fuzzysort.go(
        query,
        history.map((line, idx) => ({ line, idx })),
        { key: 'line', limit: 50 }
      );
      matches = results.map((r) => r.obj.idx);
    } catch {
      matches = [];
    }
    matchCursor = Math.min(matchCursor, Math.max(matches.length - 1, 0));
  }

  function eraseStatusLine(): void {
    // Remove the status line row and let the redraw happen on it.
    readline.cursorTo(process.stdout, 0);
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
  }

  function render(): void {
    if (!active || !hooks) return;
    recomputeMatches();
    const total = matches.length;
    const counter = total > 0 ? ` ${matchCursor + 1}/${total}` : '';
    let statusLine: string;
    if (query.length === 0) {
      statusLine = `${DIM}(fuzzy-search) type to search history${RESET}`;
    } else if (total === 0) {
      statusLine = `${DIM}(fuzzy-search) ${BOLD}no matches${RESET}`;
    } else {
      statusLine = `${DIM}(fuzzy-search)${RESET} ${CYAN}${query}${RESET}${DIM}${counter}${RESET}`;
    }
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(`${statusLine}\n`);
    const selection = currentSelection();
    hooks.setLine(selection ?? query);
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
    eraseStatusLine();
    if (restoreDraft && hooks) {
      hooks.setLine(savedDraft);
      hooks.refresh();
    }
  }

  function nextMatch(): void {
    if (matches.length > 1) {
      matchCursor = (matchCursor + 1) % matches.length;
      render();
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
        // Closed mid-chunk (Enter): the rest belongs to the REPL again.
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
          hooks?.setLine(selection);
          hooks?.refresh();
          passthrough.push(CR);
        } else {
          // Nothing selected: cancel and restore the draft, no execution.
          closeSearch(true);
        }
      } else if (byte === CTRL_R || byte === TAB) {
        nextMatch();
      } else if (byte === ESC) {
        closeSearch(true);
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
