import fs from 'node:fs';
import path from 'node:path';
import { replayScreen } from '../utils/ScreenReplay.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell PTY (console mode)', () => {
  test('evaluates expressions with top-level await, the last result in _, and the $ facade', async () => {
    const homeDir = createShellTestHome();
    try {
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          { type: 'send_line', text: '1 + 1' },
          { type: 'wait_plain', regex: '\\b2\\b' },
          { type: 'clear_output' },
          { type: 'send_line', text: 'var x = 40' },
          { type: 'send_line', text: 'x + 2' },
          { type: 'wait_plain', regex: '\\b42\\b' },
          { type: 'clear_output' },
          // `_` is the REPL's own last result, not a name Frodo binds.
          { type: 'send_line', text: '_ + 1' },
          { type: 'wait_plain', regex: '\\b43\\b' },
          { type: 'clear_output' },
          { type: 'send_line', text: 'typeof $' },
          { type: 'wait_plain', regex: "'object'" },
          { type: 'clear_output' },
          {
            type: 'send_line',
            text: '(await Promise.resolve(7)) + 1',
          },
          { type: 'wait_plain', regex: '\\b8\\b' },
          { type: 'clear_output' },
          {
            type: 'send_line',
            text: 'await $.get("/openidm/managed/alpha_user").then(() => "ok", e => e.message)',
          },
          { type: 'wait_plain', regex: 'Not connected' },
          { type: 'capture', label: 'restError' },
        ],
      });

      expect(result.captures.restError.plain).toMatch(/Not connected/);
    } finally {
      removeShellTestHome(homeDir);
    }
  });

  test('nested results print collapsed with a hint, and Ctrl+O / .explore open the tree', async () => {
    for (const open of [
      { type: 'send', text: '\x0f' },
      { type: 'send_line', text: '.explore' },
    ]) {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          args: ['shell'],
          homeDir,
          actions: [
            { type: 'wait_plain', regex: 'frodo>' },
            { type: 'clear_output' },
            {
              type: 'send_line',
              text: '({users: [{name: "alice", roles: ["admin"]}], meta: {a: {b: {c: 1}}}})',
            },
            { type: 'wait_plain', regex: 'Ctrl\\+O' },
            { type: 'capture', label: 'printed' },
            { type: 'clear_output' },
            open,
            { type: 'sleep', ms: 400 },
            { type: 'send', text: '\x1b[B' },
            { type: 'send', text: '\x1b[C' },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'tree' },
            { type: 'send', text: 'q' },
            { type: 'sleep', ms: 300 },
            { type: 'send_line', text: '"BACK"' },
            { type: 'wait_plain', regex: "'BACK'" },
          ],
        });

        // Collapsed to one line: nested containers are summarized, not
        // expanded, and the hint says how to open them.
        expect(result.captures.printed.plain).toMatch(
          /\{users: Array\(1\), meta: \{…\}\}/
        );
        // The result line quotes strings with single quotes; the echoed input
        // line (double quotes) also appears in the capture, so assert on
        // the result's form rather than on the absence of a word.
        expect(result.captures.printed.plain).not.toMatch(/name: 'alice'/);
        // The tree opened and the selected node expanded.
        expect(result.captures.tree.plain).toMatch(/frodo explore/);
        expect(result.captures.tree.plain).toMatch(/▾ users/);
      } finally {
        removeShellTestHome(homeDir);
      }
    }
  });

  test('Ctrl+R fuzzy-searches history and Enter re-runs the selection', async () => {
    const homeDir = createShellTestHome();
    try {
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'wait_plain', regex: 'frodo>' },
          { type: 'clear_output' },
          { type: 'send_line', text: "'marker-AAA'" },
          // Wait for the result and the next prompt, not the echoed input:
          // the initial prompt can appear before the input hooks are installed
          // (the terminal is already raw, so what is typed then waits in the
          // terminal's queue until the console reads it).
          { type: 'wait_plain', regex: "\\n'marker-AAA'\\n[\\s\\S]*frodo>\\s*$" },
          { type: 'clear_output' },
          // ctrl-r, then a fuzzy query, then Enter to re-run
          { type: 'key', name: 'ctrl_r' },
          { type: 'send', text: 'markerAA' },
          { type: 'wait_plain', regex: '\\(fuzzy-search\\) markerAA 1/1' },
          { type: 'capture', label: 'search' },
          { type: 'clear_output' },
          { type: 'key', name: 'enter' },
          {
            type: 'wait_plain',
            regex: "\\n'marker-AAA'\\n[\\s\\S]*frodo>\\s*$",
          },
          { type: 'clear_output' },
          // Esc cancels and restores the empty draft
          { type: 'key', name: 'ctrl_r' },
          { type: 'send', text: 'zzznomatch' },
          { type: 'wait_plain', regex: 'no matches' },
          { type: 'key', name: 'escape' },
          { type: 'sleep', ms: 200 },
          { type: 'capture', label: 'cancelled' },
        ],
      });

      expect(result.captures.search.plain).toMatch(/var.*marker|'marker-AAA'/);
      // After cancel, no phantom execution: the output ends at a clean
      // prompt with no new result.
      expect(result.captures.cancelled.plain).not.toMatch(/'zzznomatch'/);
    } finally {
      removeShellTestHome(homeDir);
    }
  });

  test('the search buffer shows a multi-line entry as its first line only', async () => {
    const homeDir = createShellTestHome();
    try {
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          // A multi-line entry (as a paste records it): the readline
          // buffer must not carry its breaks while the list is open, or
          // the prompt block wraps over several rows and every scroll
          // step lands the frame erase wrong, leaving the previous
          // frame's rows on screen.
          {
            type: 'send',
            text: 'const aMulti=1;\rconst bMulti=2;\rconst cMulti=3;\r',
          },
          { type: 'sleep', ms: 300 },
          { type: 'wait_plain', regex: 'cMulti' },
          { type: 'clear_output' },
          { type: 'key', name: 'ctrl_r' },
          // The query narrows the list to the multi-line entry: it is
          // the selection, so the buffer carries it while the list is
          // open.
          { type: 'send', text: 'aMulti' },
          { type: 'wait_plain', regex: '1/1' },
          { type: 'sleep', ms: 200 },
          { type: 'capture', label: 'selected' },
          { type: 'key', name: 'escape' },
        ],
      });
      const selected = result.captures.selected.raw;
      // The whole selection is what Enter runs, but the line buffer
      // holds the first line only while the list is open. Read the
      // prompt redraws from the raw stream: every segment from 'frodo> '
      // to the next cursor-home/erase carries only the prompt and the
      // first line; a wrapped prompt block (the interior lines riding
      // the buffer) is what broke the frame erase on every scroll. The
      // list rows keep the whole entry (with the ¶ marks), so bMulti
      // appears there and only there.
      const redraws = selected.split(/frodo> /).slice(1);
      expect(redraws.length).toBeGreaterThan(0);
      for (const segment of redraws) {
        const linePart = segment.split('\x1b[1G')[0];
        expect(linePart).not.toContain('bMulti');
      }
      expect(selected).toContain('bMulti');
    } finally {
      removeShellTestHome(homeDir);
    }
  });

  test('a bracketed paste fills the buffer and runs as one unit on Enter', async () => {
    const homeDir = createShellTestHome();
    try {
      const script = [
        'let psum = 0;',
        'const pnums = [1, 2, 3];',
        'for (const n of pnums) {',
        '  psum += n;',
        '}',
        '`pasted: ${psum}`',
      ].join('\r');
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          // The terminal wraps a paste in ESC[200~ ... ESC[201~; the
          // driver sends the same bytes.
          { type: 'send', text: '\x1b[200~' + script + '\r\x1b[201~' },
          // A paste fills, not runs: the echo and the waiting hint
          // appear, and nothing evaluates until the user's Enter.
          { type: 'wait_plain', regex: 'script pasted \\(6 lines\\)' },
          { type: 'sleep', ms: 200 },
          { type: 'capture', label: 'filled' },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: 'pasted: 6' },
          { type: 'sleep', ms: 200 },
          { type: 'capture', label: 'screen' },
          { type: 'send_line', text: '.exit' },
        ],
      });
      // While the stash waits, nothing has run: the result is absent.
      expect(result.captures.filled.plain).not.toContain('pasted: 6');
      // One run, one result: the fragments must not have been eval'd
      // separately (their errors would litter the screen and there
      // would be no 'pasted: 6' at all).
      const screen = result.captures.screen.plain;
      expect(screen).toContain('pasted: 6');
      // The pasted script is echoed to the screen (the filter swallows
      // the paste bytes, so the echo is the console's own), each line
      // once, with no per-fragment errors.
      expect(screen).toContain('let psum = 0;');
      expect(screen).toContain('for (const n of pnums) {');
      expect(screen).not.toMatch(/SyntaxError|Unexpected token/);
      // One history entry, the script whole and in order. LF was the
      // wrong join: readline reverses a line buffer holding LF and the
      // entry arrived inside-out (the bug this test pins). The entry
      // stores in the rich #h: form, with ts/host/id.
      const file = path.join(
        homeDir,
        '.frodo',
        'shell-history',
        'shared-v2.txt'
      );
      const stored = fs.readFileSync(file, 'utf-8');
      const entries = stored
        .split('\n')
        .filter((l) => l.startsWith('#h:'))
        .map((l) => JSON.parse(l.slice(l.startsWith('#h:') ? 3 : 4)))
        .map((e) => (typeof e === 'string' ? { text: e } : e));
      // The paste is one entry (the fragments did not store
      // separately), whole and in order, with metadata.
      const paste = entries.find((e) => e.text.startsWith('let psum = 0;'));
      expect(paste).toBeDefined();
      expect(paste.text).toBe(
        'let psum = 0;\nconst pnums = [1, 2, 3];\nfor (const n of pnums) {\n  psum += n;\n}\n`pasted: ${psum}`'
      );
      expect(typeof paste.id).toBe('number');
      expect(typeof paste.ts).toBe('number');
    } finally {
      removeShellTestHome(homeDir);
    }
  });

  test('typing after a paste drops the stash and does not glue the placeholder', async () => {
    const homeDir = createShellTestHome();
    try {
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          {
            type: 'send',
            text: '\x1b[200~const a1 = 1;\rconst a2 = 2;\r\x1b[201~',
          },
          { type: 'wait_plain', regex: 'script pasted \\(2 lines\\)' },
          { type: 'sleep', ms: 200 },
          // The user ignores the paste and types a command: the stash
          // and its placeholder drop, the command runs alone.
          { type: 'send_line', text: 'lonely = 9' },
          { type: 'wait_plain', regex: '9' },
          { type: 'sleep', ms: 200 },
          { type: 'capture', label: 'screen' },
          { type: 'send_line', text: '.exit' },
        ],
      });
      const screen = result.captures.screen.plain;
      // The typed command ran by itself.
      expect(screen).toContain('9');
      // The placeholder's first line did not ride along on the input.
      expect(screen).toContain('lonely = 9');
      expect(screen).not.toMatch(/const a1 = 1;lonely|lonely.*const a1 = 1;/);
      // Nothing of the paste entered history: it was never submitted.
      const file = path.join(
        homeDir,
        '.frodo',
        'shell-history',
        'shared-v2.txt'
      );
      const stored = fs.readFileSync(file, 'utf-8');
      expect(stored).not.toContain('const a1');
    } finally {
      removeShellTestHome(homeDir);
    }
  });
  test('navigation leaves no residue with long single-line entries', async () => {
    const homeDir = createShellTestHome();
    try {
      // A long single-line command (~100 chars): with the wide prompt
      // it wraps the prompt row, which used to break the erase math
      // and leave the previous frame's rows on screen.
      const longCmd =
        "await $.get('/openidm/repo/link?_queryFilter=true&_pageSize=10&_fields=_NAME,_LINK,_FIRSTLINKTYPE')";
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          { type: 'send_line', text: longCmd },
          { type: 'wait_plain', regex: 'Not connected' },
          { type: 'sleep', ms: 300 },
          { type: 'send_line', text: 'shortOne' },
          { type: 'wait_plain', regex: 'shortOne' },
          { type: 'sleep', ms: 300 },
          { type: 'clear_output' },
          { type: 'key', name: 'ctrl_r' },
          { type: 'sleep', ms: 200 },
          { type: 'key', name: 'down' },
          { type: 'sleep', ms: 150 },
          { type: 'key', name: 'down' },
          { type: 'sleep', ms: 150 },
          { type: 'key', name: 'up' },
          { type: 'sleep', ms: 150 },
          { type: 'capture', label: 'mid' },
          { type: 'key', name: 'escape' },
          { type: 'sleep', ms: 200 },
          { type: 'capture', label: 'closed' },
          { type: 'send_line', text: '.exit' },
        ],
      });
      // While the frame is open: exactly one status line and one copy
      // of each entry row (no accumulation from the navigation steps).
      const midScreen = replayScreen(result.captures.mid.raw);
      const statusCount = midScreen.filter((l) =>
        l.includes('(fuzzy-search)')
      ).length;
      expect(statusCount).toBe(1);
      // List rows lead with the id column; the prompt row (which
      // previews the selection) is not a duplicate.
      const shortRows = midScreen.filter((l) =>
        /^  \d\s+.*shortOne/.test(l)
      ).length;
      expect(shortRows).toBe(1);
      // After Esc: no frame rows left at all.
      const closedScreen = replayScreen(result.captures.closed.raw);
      expect(closedScreen.some((l) => l.includes('fuzzy-search'))).toBe(false);
    } finally {
      removeShellTestHome(homeDir);
    }
  }, 60000);

  test('a multi-line entry renders as one row with marks, no wrapping', async () => {
    const homeDir = createShellTestHome();
    try {
      const script = ['const ml1 = 1;', 'const ml2 = 2;', 'ml1 + ml2'].join(
        '\r'
      );
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          { type: 'send', text: '\x1b[200~' + script + '\r\x1b[201~' },
          { type: 'wait_plain', regex: 'script pasted' },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: '3' },
          { type: 'sleep', ms: 300 },
          { type: 'send_line', text: 'plainTwo' },
          { type: 'wait_plain', regex: 'plainTwo' },
          { type: 'sleep', ms: 300 },
          { type: 'clear_output' },
          { type: 'key', name: 'ctrl_r' },
          { type: 'sleep', ms: 200 },
          { type: 'key', name: 'down' },
          { type: 'sleep', ms: 150 },
          { type: 'capture', label: 'mid' },
          { type: 'key', name: 'escape' },
          { type: 'send_line', text: '.exit' },
        ],
      });
      const screen = replayScreen(result.captures.mid.raw);
      // One status line; the multi-line entry occupies ONE screen row
      // (its lines separated by the ¶ marks, never painted across).
      expect(screen.filter((l) => l.includes('(fuzzy-search)'))).toHaveLength(
        1
      );
      const mlRows = screen.filter(
        (l) => /^  \d\s+/.test(l) && l.includes('ml1')
      );
      expect(mlRows).toHaveLength(1);
      expect(mlRows[0]).toContain('¶');
      // The single entry is on its own row.
      expect(screen.filter((l) => l.includes('plainTwo'))).toHaveLength(1);
    } finally {
      removeShellTestHome(homeDir);
    }
  }, 60000);
});
