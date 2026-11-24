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
          // the initial prompt can appear before the input hooks are installed.
          { type: 'wait_plain', regex: "\\n'marker-AAA'\\n[\\s\\S]*frodo>\\s*$" },
          { type: 'clear_output' },
          // ctrl-r, then a fuzzy query, then Enter to re-run
          { type: 'key', name: 'ctrl_r' },
          { type: 'send', text: 'markerAA' },
          { type: 'wait_plain', regex: '\\(fuzzy-search\\) markerAA 1/1' },
          { type: 'capture', label: 'search' },
          { type: 'clear_output' },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: "\\n'marker-AAA'\\n[\\s\\S]*frodo>\\s*$" },
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
          { type: 'send', text: "const aMulti=1;\rconst bMulti=2;\rconst cMulti=3;\r" },
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
});
