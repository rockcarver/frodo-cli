import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * The double-ESC "exit all the way out" gesture (docs/INTERACTIVE-
 * COMMANDS.md key language): the FIRST Esc opens a 400ms grace window
 * inside the prompt (hint line renders), a SECOND Esc within it
 * resolves the exit-all sentinel, which THROWS the unwind signal --
 * the session ends (clean exit) from any nesting depth. Both presses
 * are processed by the SAME prompt instance (the grace holds the first
 * press), so the presses must arrive within one prompt's lifetime and
 * 400ms of each other. The driver's `escape` key action writes ONE
 * escape byte per action; a sub-400ms gap exercises the double-press,
 * a gap LONGER than the window exercises the single-press back-out.
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
    'double-ESC inside the invocation editor leaves the session entirely',
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
            // Capture-window discipline: output ACCUMULATES, so clear
            // here -- the assertions must judge only what happened from
            // the gesture onward (earlier renders would otherwise
            // match the not.toMatch patterns).
            { type: 'clear_output' },
            // Double-ESC INSIDE the editor: the first opens the grace
            // window (the second press must land in the SAME prompt
            // instance, so no wait between the presses -- a human
            // double-tap is ~80-150ms). The unwind signal then travels
            // through the editor, the resolver, the preAction hook chain
            // and the action body to the top-level handler: the session
            // ends. (The reads are EIO-safe: the child may exit while we
            // are still pumping.)
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 150 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'afterDoubleEsc' },
          ],
        });

        const after = result.captures.afterDoubleEsc.plain;
        // The grace hint rendered between the presses (discoverability),
        // and the unwind ended the session: the editor's frame erased
        // itself, the resolver's own error path never ran, and no prompt
        // re-opened. Exit is CLEAN (no missing-input error -- the signal
        // bypasses it entirely).
        expect(after).toMatch(/esc again to exit all/);
        expect(after).not.toMatch(
          /error: one of '-i, --secret-id <secret-id> | -a, --all' is required/
        );
        expect(after).not.toMatch(/Choose which secrets/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'double-ESC inside the one-of picker leaves the session entirely',
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
            // Capture-window discipline (see the editor test).
            { type: 'clear_output' },
            // Double-ESC in the picker itself (150ms gap, same prompt).
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 150 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'afterPickerDoubleEsc' },
          ],
        });

        const after = result.captures.afterPickerDoubleEsc.plain;
        expect(after).toMatch(/esc again to exit all/);
        expect(after).not.toMatch(/Optional options for/);
        expect(after).not.toMatch(
          /error: one of '-i, --secret-id <secret-id> | -a, --all' is required/
        );
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'a SINGLE ESC from the invocation editor backs out ONE level (picker returns, session alive)',
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
            // ONE escape: the grace window opens, expires with no second
            // press, and the single-Esc action runs -- back to the
            // one-of picker, still interactive. (Clear FIRST: wait_plain
            // matches accumulated output, and the earlier renders would
            // satisfy the picker regex long before the gesture ran --
            // the capture must judge only the post-ESC window, where
            // both the grace hint and the re-opened picker must appear.)
            { type: 'clear_output' },
            { type: 'key', name: 'escape' },
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 15000,
            },
            { type: 'capture', label: 'backAtPicker' },
          ],
        });

        const after = result.captures.backAtPicker.plain;
        // The grace hint rendered during the window, then the expiry
        // resolved the single-Esc action: the picker re-opened.
        expect(after).toMatch(/esc again to exit all/);
        expect(after).toMatch(/Choose which secrets/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'two SLOW escapes (>400ms apart) back out level by level -- no pairing across prompts',
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
            // First escape: grace expires (no second press inside the
            // window) -- back to the picker.
            { type: 'key', name: 'escape' },
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 15000,
            },
            // GATE on the picker being LISTENING before the second
            // escape, then wait out any grace the new prompt might open.
            { type: 'clear_output' },
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 500 },
            // Second escape, far outside the window: a NEW prompt, a NEW
            // grace -- it expires too and the picker's single-Esc action
            // ends the interactive pass (missing-input error). This pins
            // that slow presses never pair into exit-all.
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'afterTwoSlowEsc' },
          ],
        });

        const after = result.captures.afterTwoSlowEsc.plain;
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

  test(
    'double-ESC in a NESTED sub-command picker lands at the shell (not the parent picker)',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: [],
          env: ENV,
          actions: [
            // Root picker -> config-manager's picker.
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
            {
              type: 'wait_plain',
              regex: "Choose a sub-command for 'config-manager'",
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            // Capture-window discipline (see the editor test).
            { type: 'clear_output' },
            // Double-ESC one tree level DOWN: the unwind must reach the
            // shell, not re-open the parent's picker.
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 150 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'afterNestedDoubleEsc' },
          ],
        });

        const after = result.captures.afterNestedDoubleEsc.plain;
        expect(after).toMatch(/esc again to exit all/);
        // NOT the parent picker re-opening.
        expect(after).not.toMatch(/Choose a sub-command for 'frodo'/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
