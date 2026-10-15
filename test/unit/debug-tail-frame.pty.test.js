import { checkMasterKeyUsable } from '../e2e/utils/MasterKeyGate.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * `frodo debug oauth`'s interactive tail frame (the DebugTailPrompt
 * slice of the design-system rollout): the prompt boots into the shared
 * frame design -- Navigate bar + framed panel titled
 * `Debugging oauth (<host> · <realm>)` -- and exits cleanly.
 *
 * Recording: one cassette (`FRODO_TEST_NAME=debugTailOauth`, recorded
 * live against frodo-dev -- one 200 for `/monitoring/logs/tail`,
 * replayed for every poll; a static tail is fine, the test asserts on
 * the frame, not the event flow). Replay ignores the auth headers, so
 * the test routes `ensureLogApiCredentials` down its environment branch
 * (dummy FRODO_LOG_KEY/FRODO_LOG_SECRET) -- the fixture profile carries
 * only service-account credentials, no saved log API key. The suite
 * still gates on a usable master key like the other key-dependent
 * suites (the fixture Connections.json is encrypted; see
 * test/e2e/README.md's MasterKeyGate section): with one it runs,
 * without one it skips with a warning -- the expected, green result on
 * fork and Dependabot PRs.
 */
describe('debug tail frame', () => {
  const TIMEOUT = 90000;

  // The gate runs in THIS jest process (not the CLI child), so it needs
  // the key path pinned here -- getEnv() does that only for the spawned
  // CLI's env, which is too late for a module-scope checkMasterKeyUsable().
  process.env.FRODO_MASTER_KEY_PATH = new URL(
    '../e2e/env/masterkey.key',
    import.meta.url
  ).pathname;

  const keyUsable = checkMasterKeyUsable();

  const ENV = {
    FRODO_MOCK: '1',
    FRODO_HOST: 'https://openam-frodo-dev.forgeblocks.com/am',
    FRODO_MOCK_DEPLOYMENT: 'cloud',
    FRODO_TEST_NAME: 'debugTailOauth',
    // Dummy Log API credentials for the env branch of
    // ensureLogApiCredentials (see the suite remark -- the fixture
    // profile has none saved, and the mock never validates them).
    FRODO_LOG_KEY: 'dummy-log-api-key',
    FRODO_LOG_SECRET: 'dummy-log-api-secret',
    FRODO_CONNECTION_PROFILES_PATH: new URL(
      '../e2e/env/Connections.json',
      import.meta.url
    ).pathname,
    FRODO_MASTER_KEY_PATH: new URL('../e2e/env/masterkey.key', import.meta.url)
      .pathname,
  };

  test(
    'boots the framed tail and double-ESC exits cleanly',
    async () => {
      if (!keyUsable) {
        console.warn(
          'Master-key gate: no usable master key -- skipping the ' +
            'debug-tail-frame PTY test (expected on fork/Dependabot PRs).'
        );
        return;
      }
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['debug', 'oauth'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Debugging oauth',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 1500 },
            // Capture-window discipline: output ACCUMULATES, so clear
            // before the gesture -- the assertions must judge only what
            // happened from the gesture onward.
            { type: 'clear_output' },
            // Double-ESC: the first opens the grace window (hint line),
            // the second exits all the way out (clean, session over).
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 150 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'afterDoubleEsc' },
          ],
        });

        const full = result.plainOutput;
        // The frame design rendered: Navigate bar + panel title.
        expect(full).toMatch(/Debugging oauth/);
        expect(full).toMatch(/Navigate/);
        expect(full).toMatch(/\[ESC\]×2 exit all/);

        const after = result.captures.afterDoubleEsc.plain;
        // The grace hint rendered between the presses...
        expect(after).toMatch(/esc again to exit all/);
        // ...and the session ended cleanly: the concluded status line is
        // the last render (no error print, no re-opened prompt, no
        // credentials help dump). The PTY accumulate model keeps erased
        // lines -- and the grace redraw legitimately re-renders the
        // titled frame -- so the frame's absence can't be asserted on
        // captured text; the done status is the clean-exit marker.
        expect(after).not.toMatch(/No log api credentials found/);
        expect(after).toMatch(/Debug tail ended/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
