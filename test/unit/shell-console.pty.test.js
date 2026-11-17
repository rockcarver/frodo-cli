import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell PTY (console mode)', () => {
  test('evaluates expressions with top-level await, lodash, and the $ facade', async () => {
    const homeDir = createShellTestHome();
    try {
      const result = runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          // wait_prompt matches '>\s$' which the REPL's one-time
          // "Expression assignment to _ now disabled" notice breaks
          // (it prints after the first prompt); match 'frodo>' instead.
          { type: 'wait_plain', regex: 'frodo>' },
          { type: 'clear_output' },
          { type: 'send_line', text: '1 + 1' },
          { type: 'wait_plain', regex: '\\b2\\b' },
          { type: 'clear_output' },
          { type: 'send_line', text: 'var x = 40' },
          { type: 'send_line', text: 'x + 2' },
          { type: 'wait_plain', regex: '\\b42\\b' },
          { type: 'clear_output' },
          { type: 'send_line', text: 'typeof _' },
          { type: 'wait_plain', regex: "'function'" },
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
          { type: 'wait_plain', regex: "'marker-AAA'" },
          { type: 'clear_output' },
          // ctrl-r, then a fuzzy query, then Enter to re-run
          { type: 'key', name: 'ctrl_r' },
          { type: 'send', text: 'markerAA' },
          { type: 'wait_plain', regex: '\\(fuzzy-search\\).*1/1' },
          { type: 'capture', label: 'search' },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: "'marker-AAA'" },
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
});
