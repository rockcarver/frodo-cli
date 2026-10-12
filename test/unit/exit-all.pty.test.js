import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * The double-ESC "exit all the way out" gesture (docs/INTERACTIVE-
 * COMMANDS.md key language): a single ESC backs out one level, two
 * consecutive ESCs within the window (400ms) leave the interactive
 * session entirely -- from any nesting depth. The driver's `escape`
 * key action writes ONE escape byte per action, so two `key: escape`
 * actions separated by a sub-window sleep exercise the double-press,
 * and one separated by a sleep LONGER than the window exercises the
 * single-press back-out.
 */
describe('double-ESC exit-all', () => {
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
    'double-ESC from the invocation editor leaves the session entirely',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete', '-k'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            // Into the invocation editor (one level down).
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 400 },
            // ESC once: the editor resolves (cancelled) and the one-of
            // picker re-opens. THEN the second ESC -- the driver's
            // back-to-back writes would pre-buffer both bytes before
            // the editor processes the first (a human watches the
            // editor close, then presses again). 300ms covers the
            // prompt teardown+reboot and still sits inside the 400ms
            // double-press window (the pairing clock runs on the
            // EDITOR's dismissal, so the picker's ESC completes it).
            { type: 'key', name: 'escape' },
            // GATE on the picker's re-render: wait_plain matches
            // ACCUMULATED output, so clear first, then wait for the
            // picker's NEW render (editor dismissed, picker booted and
            // LISTENING) before the second ESC -- sending blind races
            // the boot; the pairing clock (seeded at re-prompt time)
            // tolerates the boot time.
            { type: 'clear_output' },
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 200 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'afterDoubleEsc' },
          ],
        });

        const after = result.captures.afterDoubleEsc.plain;
        // Exit-all unwinds BOTH levels: the editor cancelled, the
        // re-opened picker cancelled within the pairing window, and the
        // resolver left the interactive pass -- a leaf command's "top"
        // is the commander missing-input error (the same place a single
        // ESC at the picker lands today, reached in half the presses).
        // No prompt re-opens after the second cancel; the error + usage
        // close the run.
        expect(after).toMatch(/\(cancelled\)/);
        expect(after).toMatch(
          /error: one of '-i, --secret-id <secret-id> | -a, --all' is required/
        );
        expect(after).toMatch(/Usage: frodo esv secret delete/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'single ESC from the invocation editor backs out ONE level (picker returns)',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete', '-k'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 400 },
            // ONE escape: back to the one-of picker, still interactive.
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 800 },
            // A SECOND escape OUTSIDE the window (>400ms after the
            // first): backs out of the picker too -- NOT exit-all mid-
            // window semantics, just sequential single escapes.
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'afterTwoSlowEsc' },
          ],
        });

        const after = result.captures.afterTwoSlowEsc.plain;
        // Both levels backed out of via TWO single escapes (the second
        // ESC landed outside the window): the same missing-input end
        // state, reached without the pairing. This pins the WINDOW
        // boundary: a slow second ESC must NOT be needed to pair (any
        // two escapes reach this state), but must also not break
        // anything -- the discrimination matters at pickers that STAY
        // open (see the root-picker tree climb), not here.
        expect(after).toMatch(
          /error: one of '-i, --secret-id <secret-id> | -a, --all' is required/
        );
        expect(after).toMatch(/Usage: frodo esv secret delete/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'ESC in a nested sub-command picker climbs ONE tree level (config-manager -> root)',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: [],
          env: ENV,
          actions: [
            // Root picker.
            {
              type: 'wait_plain',
              regex: "Choose a sub-command for 'frodo'",
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'send', text: 'config' },
            { type: 'wait_plain', regex: 'query: config', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'key', name: 'down' },
            { type: 'sleep', ms: 300 },
            { type: 'key', name: 'enter' },
            // config-manager's picker.
            {
              type: 'wait_plain',
              regex: "Choose a sub-command for 'config-manager'",
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'key', name: 'escape' },
            // THE CLIMB: the ROOT picker re-opens (not a help-exit).
            {
              type: 'wait_plain',
              regex: "Choose a sub-command for 'frodo'",
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'backAtRoot' },
          ],
        });

        const back = result.captures.backAtRoot.plain.slice(
          result.captures.backAtRoot.plain.lastIndexOf(
            "Choose a sub-command for 'frodo'"
          )
        );
        // The root picker re-offered its commands: the climb worked.
        expect(back).toMatch(/config-manager/);
        // No help-exit text (the old single-ESC behavior would have
        // ended the session with the usage dump).
        expect(back).not.toMatch(/Usage: frodo \[options\]/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
