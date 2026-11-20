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
            FRODO_MOCK: '1',
            FRODO_CONNECTION_PROFILES_PATH: connectionsPath,
          },
          actions: [
            // wait for the REPL prompt; allow extra time for mock auth round-trip
            { type: 'wait_prompt', timeoutMs: 30000 },
            { type: 'clear_output' },
            // verify Tab completion still works after auth
            { type: 'send', text: 'frodo.cloud.secret.readSecretValue(' },
            { type: 'key', name: 'tab' },
            {
              type: 'wait_plain',
              regex: 'readSecretValue\\([^)]*\\)',
            },
            { type: 'capture', label: 'afterTab' },
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
