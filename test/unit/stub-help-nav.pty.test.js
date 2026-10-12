import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * The stub help/navigation round (user decisions 2026-10-12):
 *
 * - Action-bearing stubs (conn, settings) show a Run row FIRST in their
 *   sub-command picker -- bare `frodo conn --prompt` browses the tree
 *   without losing access to the action.
 * - ESC from the action's picker climbs into that sub-command picker
 *   (navigation restored; pre-Run-row it exited the session).
 * - --no-prompt on a PURE stub restores the legacy help-exit instead of
 *   the sub-command picker.
 * - --no-prompt on an ACTION stub is gate-respecting: the bare action
 *   declines (no prompt).
 *
 * The PTY driver's `escape` action writes ONE escape byte per action.
 */
describe('stub help and navigation round', () => {
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
    'bare action stub with --prompt: sub-command picker with a Run row',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['conn', '--prompt'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: "Choose a sub-command for 'conn'",
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'picker' },
          ],
        });

        const picker = result.captures.picker.plain;
        // The Run row leads the list.
        expect(picker).toMatch(/› Run 'conn'/);
        // The action's own description (first line) rides along.
        expect(picker).toMatch(/Manage connection profiles/);
        // The sub-commands follow.
        expect(picker).toMatch(/save/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    "ESC from the credential picker climbs to conn's sub-command picker (Run row re-offered)",
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['conn'],
          env: ENV,
          actions: [
            // Bare conn: straight into the credential picker.
            {
              type: 'wait_plain',
              regex: 'Choose a connection profile',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'escape' },
            // THE CLIMB: conn's sub-command picker (not a session exit).
            { type: 'clear_output' },
            {
              type: 'wait_plain',
              regex: "Choose a sub-command for 'conn'",
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'climbed' },
          ],
        });

        const climbed = result.captures.climbed.plain;
        expect(climbed).toMatch(/› Run 'conn'/);
        expect(climbed).toMatch(/save/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    '--no-prompt on a pure stub: legacy help-exit (no sub-command picker)',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['journey', '--no-prompt'],
          env: ENV,
          actions: [
            // GATE on the help text itself (a blind sleep races the
            // boot under parallel load): the legacy help-exit prints
            // usage and exits.
            {
              type: 'wait_plain',
              regex: 'Usage: frodo journey',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'end' },
          ],
        });

        const end = result.captures.end.plain;
        // Legacy behavior: the stub's own help, NOT the picker.
        expect(end).toMatch(/Usage: frodo journey/);
        expect(end).not.toMatch(/Choose a sub-command/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    '--no-prompt on the action stub: bare conn declines without prompting',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['conn', '--no-prompt'],
          env: ENV,
          actions: [
            // The bare action declines under the gate and exits; a
            // fixed settle sleep then captures the final state (the
            // decline prints nothing, so there is no positive marker
            // to wait for).
            { type: 'sleep', ms: 5000 },
            { type: 'capture', label: 'end' },
          ],
        });

        const end = result.captures.end.plain;
        // The gate respected the flag: no picker rendered at all.
        expect(end).not.toMatch(/Choose a connection profile/);
        expect(end).not.toMatch(/Choose a sub-command/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
