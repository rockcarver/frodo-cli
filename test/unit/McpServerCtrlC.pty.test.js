import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * Ctrl+C in the terminal of a running `frodo mcp server start --transport
 * http`.
 *
 * A terminal sends the SIGINT to every process of its foreground group. When
 * the entry (`dist/launch.cjs`) was a wrapper that had spawned the app as a
 * child, Ctrl+C could end the server with exit status 0 but without the
 * shutdown line, or with the lockfile (`<home>/.frodo/mcp-http-<port>.pid`) left
 * behind (the app alone, started the same way, shut down gracefully in 4 of 4
 * runs). The probable cause is that the wrapper received the signal too and
 * forwarded a second one to the child, in the middle of the shutdown. The entry
 * now runs the app in its own process, the terminal's signal arrives once, and
 * the server shuts down the way it does for a `kill`.
 *
 * The old defect was a race: against the two-process launcher this case fails
 * in about half of the runs, so it is a guard for the graceful shutdown of the
 * one process, not the proof that the entry is one process. That proof is the
 * cases of `LauncherCommandLine.test.js` (the app is the started process, a
 * death by signal is reported, a SIGKILL of the entry leaves nothing).
 *
 * The scenario starts `node dist/launch.cjs` itself, not the test binary: the
 * dev-mode binary is a shim that is a process of its own, and the whole point
 * is what the terminal does to the program without anything between them. The
 * profile file is empty (no tenant is involved: the listener comes up without
 * one). Run `npx tsdown` first, the test scripts do not rebuild `dist/`.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const LAUNCHER = path.join(ROOT, 'dist', 'launch.cjs');
const testif = (condition) => (condition ? test : test.skip);

describe('Ctrl+C in the terminal of a running MCP HTTP server', () => {
  const TIMEOUT = 90000;

  testif(fs.existsSync(LAUNCHER))(
    'shuts the server down gracefully, exits 0 and removes the lockfile',
    () => {
      const homeDir = createShellTestHome();
      try {
        const profiles = path.join(homeDir, 'Connections.json');
        fs.writeFileSync(profiles, '{}');
        const result = runShellScenario({
          homeDir,
          binary: process.execPath,
          args: [
            LAUNCHER,
            'mcp',
            'server',
            'start',
            '--transport',
            'http',
            '--port',
            'auto',
          ],
          env: {
            FRODO_CONNECTION_PROFILES_PATH: profiles,
            FRODO_NO_UPDATE_CHECK: '1',
            NO_COLOR: '1',
          },
          actions: [
            {
              type: 'wait_plain',
              regex: 'listening on http://127\\.0\\.0\\.1:\\d+/mcp',
              timeoutMs: 30000,
            },
            // the signal handlers are installed before the listener is
            // announced; the lockfile is written right after the announcement,
            // so this pause keeps the key from racing it
            { type: 'sleep', ms: 300 },
            { type: 'key', name: 'ctrl_c' },
            { type: 'wait_exit', timeoutMs: 15000 },
          ],
        });

        const port = /listening on http:\/\/127\.0\.0\.1:(\d+)\/mcp/.exec(
          result.plainOutput
        )[1];
        // the shutdown line, which the app prints when it handles the signal
        expect(result.plainOutput).toMatch(
          /shutdown: received SIGINT, shutting down MCP HTTP server/
        );
        // the app ended by itself and reported success; not killed by a signal
        expect(result.exitSignal).toBeNull();
        expect(result.exitCode).toBe(0);
        // the lockfile of that very server is gone (and nothing else is left)
        const configDir = path.join(homeDir, '.frodo');
        expect(
          fs.existsSync(path.join(configDir, `mcp-http-${port}.pid`))
        ).toBe(false);
        expect(
          fs.readdirSync(configDir).filter((name) => name.endsWith('.pid'))
        ).toEqual([]);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
