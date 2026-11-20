import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { checkMasterKeyUsable } from './utils/MasterKeyGate';
import { testif } from './utils/TestUtils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const connectionsPath = path.join(
  repoRoot,
  'test',
  'e2e',
  'env',
  'Connections.json'
);

const MOCK_HOST = 'https://openam-frodo-dev.forgeblocks.com/am';

// The scenario decrypts the committed connection-profile fixture, so it
// runs only when the available key actually decrypts it: fork and
// Dependabot PRs get no Actions secrets, and without the gate the
// undecryptable fixture fails the suite (the Oct 2026 CI signature)
// instead of skipping like the gated conn suites.
const hasUsableMasterKey = checkMasterKeyUsable(connectionsPath);

describe('frodo shell auth-startup e2e', () => {
  testif(hasUsableMasterKey)(
    'shell with a host reaches a working prompt and supports Tab completion after mock auth',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          // pass the host as the positional argument — exercises getTokens() path
          args: ['shell', MOCK_HOST],
          env: {
            // Replay by default, but let an outer recording pass
            // (FRODO_MOCK=record ... npm run test:update) win: this suite
            // must be recordable, and a hard-coded '1' pins the child to
            // replay mode where the first unrecorded request fails.
            FRODO_MOCK: process.env.FRODO_MOCK || '1',
            // Replay reads the committed fixture (isolation from live
            // profiles). Recording logs in for real, so it needs a
            // credential the tenant actually accepts: the fixture's
            // throwaway JWK signs nothing the tenant verifies. The pty
            // driver redirects HOME to a temp dir, so the real profile
            // store and its key must be passed explicitly when the
            // caller names a connection (FRODO_CONNECTION, per the e2e
            // README's recording contract).
            ...(process.env.FRODO_MOCK === 'record' &&
            process.env.FRODO_CONNECTION
              ? {
                  FRODO_CONNECTION_PROFILES_PATH: path.join(
                    os.homedir(),
                    '.frodo',
                    'Connections.json'
                  ),
                  FRODO_MASTER_KEY_PATH: path.join(
                    os.homedir(),
                    '.frodo',
                    'masterkey.key'
                  ),
                }
              : { FRODO_CONNECTION_PROFILES_PATH: connectionsPath }),
          },
          actions: [
            // wait for the REPL prompt; allow extra time for the auth
            // round-trip (and for the real network during a recording pass)
            { type: 'wait_prompt', timeoutMs: 90000 },
            { type: 'clear_output' },
            // verify Tab completion still works after auth
            { type: 'send', text: 'frodo.cloud.secret.readSecretValue(' },
            { type: 'key', name: 'tab' },
            {
              type: 'wait_plain',
              regex: 'readSecretValue\\([^)]*\\)',
            },
            { type: 'capture', label: 'afterTab' },
            // Recording only: Polly persists its HAR when its idle
            // shutdown timer (15s, armed in record mode) fires, so the
            // child must outlive the last request by that long or the
            // recording is never written (replay then finds nothing).
            ...(process.env.FRODO_MOCK === 'record'
              ? [{ type: 'sleep', ms: 17000 }]
              : []),
          ],
        });

        expect(result.captures.afterTab.plain).toMatch(
          /frodo\.cloud\.secret\.readSecretValue\([^)]*\)/
        );
      } finally {
        removeShellTestHome(homeDir);
      }
    }
  );
});
