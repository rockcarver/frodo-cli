/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To record, run against the live frodo-dev tenant (uses your local
'openam-frodo-dev.forgeblocks.com' connection profile automatically, since
getEnv() switches to FRODO_CONNECTION in recording mode):

FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update -- e2e/esv-secret-version-prune

then prove it replays offline:

npm run test:only -- e2e/esv-secret-version-prune

This is one strictly sequential lifecycle: each step acts on the state the
step before it left behind, so the file is recorded as a whole and its steps
must stay in this order.

Staging. In recording mode, beforeAll creates a throwaway secret
(esv-frodo-e2e-prune-fixture) with four versions and deactivates version 2:

  version 1 active, version 2 INACTIVE, version 3 active, version 4 active
  (and the secret's active version is 4)

afterAll deletes the secret again. Replay mode runs no staging and no cleanup
at all. Staging and cleanup run live-only (FRODO_MOCK stripped from their
environment), so they leave no recording behind; only the steps that exercise
the command are recorded.

The fixture is created with --no-use-in-placeholders ("Used in placeholders" =
false). Such a secret needs no pod restart in Identity Cloud: new versions take
effect immediately (the loaded version follows the active one at once) and the
secret can be deleted immediately. A secret that is used in placeholders would
make every recording pass wait for a restart. The secret values are dummy
strings, not secrets.

If a pass is aborted and the fixture is left behind, remove it by hand:

  frodo esv secret delete -i esv-frodo-e2e-prune-fixture

(the next recording pass also removes a leftover before it stages a new one).

What is NOT recorded, on purpose: 'frodo esv secret version prune -a'. It prunes
every secret of the tenant, and the shared frodo-dev tenant holds other
people's secrets with long version histories that other tests depend on, so a
live run would delete data irreversibly. '-a' is covered by the pruneTarget unit
test (test/unit/EsvSecretVersionPrune.test.js), the help snapshot, and the
refusal steps below. Never add an '-a' step here.

'--keep-loaded' passes straight through to the library. On this fixture the
loaded version is always the active one, so the step shows that the flag is
accepted and what remains, not a loaded-but-inactive version being kept.

Every recorded step sets FRODO_TEST_NAME: the steps run similar command lines
against changing state (three 'version list' calls, four 'prune' calls), and a
recording is keyed by its command line, so each step needs its own label to
get its own recording.
*/
import {
  assertNoPollyReplayError,
  execWithRecordingProgress,
  getEnv,
  isRecordingMode,
  logRecordingProgress,
  stageFixture,
  verifyAuth,
} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const isRecording = isRecordingMode();

const env = getEnv(c);

// A variant of env with FRODO_MOCK stripped, so staging and cleanup calls
// bypass Polly entirely (live only) and leave no recording behind.
const liveOnlyEnv = {
  env: Object.fromEntries(
    Object.entries(env.env).filter(([key]) => key !== 'FRODO_MOCK')
  ),
};

/** The environment for one recorded step: its own recording label. */
const named = (label) => ({ env: { ...env.env, FRODO_TEST_NAME: label } });

const secretId = 'esv-frodo-e2e-prune-fixture';
const unknownSecretId = 'esv-frodo-e2e-does-not-exist';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cleanUp() {
  try {
    await stageFixture(`frodo esv secret delete -i ${secretId}`, liveOnlyEnv);
  } catch {
    // Best-effort: the secret may already be gone, or never have been created.
  }
}

async function stage() {
  // A fixture left behind by an aborted pass would make the create fail.
  await cleanUp();
  const stagingCommands = [
    `frodo esv secret create -i ${secretId} --value e2e-fixture-value-1 --description "Frodo e2e fixture for esv secret version prune. Throwaway, safe to delete." --no-use-in-placeholders`,
    `frodo esv secret version create -i ${secretId} --value e2e-fixture-value-2`,
    `frodo esv secret version create -i ${secretId} --value e2e-fixture-value-3`,
    `frodo esv secret version create -i ${secretId} --value e2e-fixture-value-4`,
    `frodo esv secret version deactivate -i ${secretId} -v 2`,
  ];
  for (const command of stagingCommands) {
    logRecordingProgress(`Staging: ${command}`);
    await stageFixture(command, liveOnlyEnv);
  }
}

describe('frodo esv secret version prune', () => {
  beforeAll(async () => {
    if (isRecording) {
      logRecordingProgress('Verifying authentication before staging');
      await verifyAuth(liveOnlyEnv);
      await stage();
      logRecordingProgress('Waiting 1000ms after staging to allow eventual consistency');
      await wait(1000);
    }
  });

  afterAll(async () => {
    if (isRecording) {
      logRecordingProgress('Removing the fixture secret from the live tenant');
      await cleanUp();
    }
  });

  // Refusals need no tenant: they fail while the command line is checked,
  // before any login, so they run (and pass) in every mode.
  describe('refuses to run without a clear target', () => {
    test('"frodo esv secret version prune --no-prompt": should fail because neither -i nor -a is given', async () => {
      const CMD = 'frodo esv secret version prune --no-prompt';
      try {
        await execWithRecordingProgress(CMD, env, false);
        throw new Error('Command should have failed with non-zero exit code');
      } catch (e) {
        expect(e.code).toBe(1);
        expect(e.stderr).toContain(
          "one of '-i, --secret-id <secret-id> | -a, --all' is required to choose which secrets to prune"
        );
      }
    });

    test('"frodo esv secret version prune -i esv-a -a --no-prompt": should fail because -i and -a conflict', async () => {
      const CMD = 'frodo esv secret version prune -i esv-a -a --no-prompt';
      try {
        await execWithRecordingProgress(CMD, env, false);
        throw new Error('Command should have failed with non-zero exit code');
      } catch (e) {
        expect(e.code).toBe(1);
        expect(e.stderr).toContain(
          "option '-i, --secret-id <secret-id>' cannot be used with option '-a, --all'"
        );
      }
    });

    test('"frodo esv secret version prune -a --no-prompt": should refuse because there is no terminal to confirm in and no -y', async () => {
      const CMD = 'frodo esv secret version prune -a --no-prompt';
      try {
        await execWithRecordingProgress(CMD, env, false);
        throw new Error('Command should have failed with non-zero exit code');
      } catch (e) {
        expect(e.code).toBe(1);
        expect(e.stderr).toContain(
          'Refusing to prune all secrets without confirmation: there is no interactive terminal to ask. Pass -y/--yes to prune without asking, or --dry-run to only show what would be deleted.'
        );
      }
    });
  });

  describe('prunes the versions of one secret (recorded against the staged fixture)', () => {
    test(`"frodo esv secret version list -i ${secretId}": should list all four versions before pruning`, async () => {
      const CMD = `frodo esv secret version list -i ${secretId}`;
      const { stdout, stderr } = await execWithRecordingProgress(CMD, named('versionsBefore'), isRecording);
      expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
      expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
    });

    test(`"frodo esv secret version prune -i ${secretId} --keep-deactivated": should prune versions 1 and 3 and keep the inactive version 2 and the active version 4`, async () => {
      const CMD = `frodo esv secret version prune -i ${secretId} --keep-deactivated`;
      const { stdout, stderr } = await execWithRecordingProgress(CMD, named('keepDeactivated'), isRecording);
      expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
      expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
    });

    test(`"frodo esv secret version list -i ${secretId}": should show versions 1 and 3 as deleted and versions 2 and 4 intact`, async () => {
      const CMD = `frodo esv secret version list -i ${secretId}`;
      const { stdout, stderr } = await execWithRecordingProgress(CMD, named('afterKeepDeactivated'), isRecording);
      expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
      expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
    });

    test(`"frodo esv secret version prune -i ${secretId} --keep-loaded": should prune version 2 and keep the active, loaded version 4`, async () => {
      const CMD = `frodo esv secret version prune -i ${secretId} --keep-loaded`;
      const { stdout, stderr } = await execWithRecordingProgress(CMD, named('keepLoaded'), isRecording);
      expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
      expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
    });

    test(`"frodo esv secret version list -i ${secretId}": should show only version 4 left`, async () => {
      const CMD = `frodo esv secret version list -i ${secretId}`;
      const { stdout, stderr } = await execWithRecordingProgress(CMD, named('afterKeepLoaded'), isRecording);
      expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
      expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
    });

    test(`"frodo esv secret version prune -i ${secretId}": should succeed and prune nothing when only the active version is left`, async () => {
      const CMD = `frodo esv secret version prune -i ${secretId}`;
      const { stdout, stderr } = await execWithRecordingProgress(CMD, named('nothingToPrune'), isRecording);
      expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
      expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
    });

    test(`"frodo esv secret version prune -i ${unknownSecretId}": should fail with an error when the secret does not exist`, async () => {
      const CMD = `frodo esv secret version prune -i ${unknownSecretId}`;
      try {
        await execWithRecordingProgress(CMD, named('unknownSecret'), isRecording);
        throw new Error('Command should have failed with non-zero exit code');
      } catch (e) {
        expect(e.code).toBe(1);
        expect(assertNoPollyReplayError(e.stderr, CMD)).toMatchSnapshot();
      }
    });
  });
});
