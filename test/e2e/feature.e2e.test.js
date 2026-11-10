/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To record, run against the live frodo-dev tenant (uses your local
'openam-frodo-dev.forgeblocks.com' connection profile automatically, since
getEnv() switches to FRODO_CONNECTION in recording mode):

FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update -- e2e/feature

Deliberately covers only read-only verbs (list/describe/validate) against
"groups", a feature already installed on frodo-dev and present on virtually
every IDM tenant -- never `install`, which is irreversible on a shared
session tenant (per this session's own design decision when the command
was first built).
*/
import {
  assertNoPollyReplayError,
  execWithRecordingProgress,
  getEnv,
  isRecordingMode,
  logRecordingProgress,
  verifyAuth,
} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const isRecording = isRecordingMode();

const env = getEnv(c);

describe('frodo feature (list/describe/validate)', () => {
  beforeAll(async () => {
    if (isRecording) {
      logRecordingProgress('Verifying authentication before live feature run');
      await verifyAuth(env);
    }
  });

  test(`"frodo feature list": should list tenant-configuration features`, async () => {
    const CMD = `frodo feature list`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo feature describe -i groups": should describe the groups feature`, async () => {
    const CMD = `frodo feature describe -i groups`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo feature validate -i groups": should report already-installed as invalid to (re-)install`, async () => {
    const CMD = `frodo feature validate -i groups`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });
});
