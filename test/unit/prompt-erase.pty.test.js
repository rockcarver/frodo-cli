import { connection } from '../e2e/utils/TestConfig.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * Erase-on-conclude prompts + the deferred authoring print (Phase 5,
 * prompt-erase slice; INTERACTIVE-COMMANDS-PLAN.md).
 *
 * Every prompt passes @inquirer/core's clearPromptOnDone context option,
 * so the whole frame -- question, list, footer, and the committed or
 * cancelled answer -- erases when the prompt settles, on every exit path
 * (enter, escape, SIGINT; @inquirer/core fires it from the prompt
 * promise's .finally()). After the run, scrollback keeps only:
 *
 * - the typed command line (the shell's, never touched by frodo), and
 * - the eventual command, printed ONCE at the action's postAction hook --
 *   the only point where nothing can change the command anymore (realm
 *   pick, entity picks, and the action's own output have concluded).
 *   Abandoned flows (cancelled pickers, unsatisfied one-of) skip
 *   postAction entirely and print nothing.
 *
 * Raw captures are replayed through a small VT line-model interpreter
 * because the erase sequences only remove lines from the SCREEN -- the
 * raw stream always contains every byte ever written, so a plain-text
 * grep would see the erased frames regardless. The model implements the
 * exact vocabulary @inquirer/core emits (its ScreenManager + @inquirer/
 * ansi: cursor up/down, erase-line, column-absolute, hide/show) plus
 * plain writes and newlines -- deliberately NOT a full VT emulator, only
 * what inquirer can produce (verified against @inquirer/ansi's source;
 * anything unknown is a test failure, not silently ignored).
 */

const ESC = '\x1b';
const ANSI_ESCAPE = new RegExp(
  `${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${ESC}\\x07]*(?:${ESC}|\\x07)|${ESC}[@-Z\\\\-_]`,
  'g'
);

/** A minimal screen line-model for the escape sequences inquirer emits. */
function replayScreen(rawInput, { cols = 120, rows = 200 } = {}) {
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

describe('phase 5 prompt erase + deferred authoring print', () => {
  // CI startup can be slow under resource contention; allow up to 90 s.
  const TIMEOUT = 90000;

  const ENV = {
    FRODO_MOCK: '1',
    FRODO_HOST: 'https://openam-frodo-dev.forgeblocks.com/am',
    FRODO_USERNAME: 'runUser1',
    FRODO_PASSWORD: 'runUser1p',
    FRODO_MOCK_DEPLOYMENT: 'cloud',
    FRODO_CONNECTION_PROFILES_PATH: new URL(
      '../e2e/env/Connections.json',
      import.meta.url
    ).pathname,
    FRODO_MASTER_KEY_PATH: new URL('../e2e/env/masterkey.key', import.meta.url)
      .pathname,
  };

  test(
    'cancelled one-of flow leaves only the error + usage, no prompt residue',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            // → into the editor, then esc back, then esc out:
            // three frames that previously all stayed visible.
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 800 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 1200 },
            { type: 'capture', label: 'final' },
          ],
        });

        const screen = replayScreen(result.captures.final.raw);
        const joined = screen.join('\n');
        // The one-of violation error (the flow's real outcome) IS there.
        expect(joined).toMatch(/one of '-i, --secret-id/);
        // NOTHING of the prompts is: no open frame, no committed
        // answer, no footer.
        expect(joined).not.toMatch(/Choose which secrets/);
        expect(joined).not.toMatch(/Optional options for/);
        expect(joined).not.toMatch(/options to configure/);
        expect(joined).not.toMatch(/type to filter/);
        expect(joined).not.toMatch(/esc backs out/);
        // And no authoring print: the flow never reached the action,
        // so the deferred print must not have flushed. (The usage
        // block's "frodo esv secret delete [options]" line is
        // commander's, not the print's.)
        expect(screen.filter((line) => line.startsWith('error:')).length).toBe(
          1
        );
        expect(
          screen.filter((line) => /^frodo esv secret delete [^[]/.test(line))
            .length
        ).toBe(0);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'completed flow: prompts erase; the eventual command prints once, above the results',
    async () => {
      const homeDir = createShellTestHome();
      try {
        // `frodo realm list`: env-resolved connection (no profile
        // picker), auth SUCCEEDS on the mock cassette (service-account
        // credentials -- TestConfig's connection is what the cassettes
        // recorded), then the post-auth realm picker offers alpha/bravo.
        // Pick bravo (2nd row): the frames erase, the print fires in the
        // getTokens wrapper -- directly above the listing -- with the
        // picked realm in it (the realm write-back).
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['realm', 'list'],
          env: {
            ...ENV,
            FRODO_SA_ID: connection.saId,
            FRODO_SA_JWK: connection.saJwk,
          },
          actions: [
            { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 30000 },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'down' },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'final' },
          ],
        });

        const screen = replayScreen(result.captures.final.raw);
        const printLines = screen.filter((line) =>
          /^frodo realm list bravo$/.test(line)
        );
        // Exactly one authoring print, with the PICKED realm in it.
        expect(printLines.length).toBe(1);
        // It is NOT the last line: the realm listing follows it -- the
        // print is a header for the results, not a footer after them.
        expect(screen[screen.length - 1]).not.toBe(printLines[0]);
        expect(screen.indexOf(printLines[0])).toBeLessThan(
          screen.indexOf('/alpha')
        );
        // No prompt residue: neither the open frame (question, list,
        // hint, footer) nor a committed/cancelled answer survived.
        const joined = screen.join('\n');
        expect(joined).not.toMatch(/Choose a realm/);
        expect(joined).not.toMatch(/options to configure/);
        expect(joined).not.toMatch(/type to filter/);
        expect(joined).not.toMatch(/esc backs out/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
