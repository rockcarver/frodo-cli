/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To record, run against the live frodo-dev tenant (uses your local
'openam-frodo-dev.forgeblocks.com' connection profile automatically, since
getEnv() switches to FRODO_CONNECTION in recording mode):

FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update -- e2e/script-type-describe
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

describe('frodo script type describe', () => {
  beforeAll(async () => {
    if (isRecording) {
      logRecordingProgress(
        'Verifying authentication before live script type describe run'
      );
      await verifyAuth(env);
    }
  });

  test(`"frodo script type describe -c SCRIPTED_DECISION_NODE": should list the bindings available in that scripting context`, async () => {
    const CMD = `frodo script type describe -c SCRIPTED_DECISION_NODE`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });
});
