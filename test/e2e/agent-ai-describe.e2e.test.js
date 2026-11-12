/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai describe -i banking-assistant
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai describe -i banking-assistant --json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai describe -i does-not-exist
*/

import { getEnv, stageFixture, clearFixture, normalizeSnapshotText, exec } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
// const stagingCommand = `frodo agent ai import frodo-dev -i testAgent -f test/e2e/exports/all/allAlphaAgents.ai.agent.json`;

describe('frodo agent ai describe', () => {
  // beforeEach(async () => {
  //   await stageFixture(stagingCommand, env);
  // });

  // afterEach(async () => {
  //   await clearFixture('frodo agent ai delete -i testAgent', env);
  // });
  test('"frodo agent ai describe -i banking-assistant": should describe AI agent in table format', async () => {
    const CMD = 'frodo agent ai describe -i banking-assistant';
    // The table and the --json output are made from the same read, so this
    // replays the recording of the --json run below. Without a name, this
    // command shares its recording ("0_i") with the does-not-exist test, which
    // overwrote it: the read of banking-assistant was never in it, the command
    // printed the error and ended with exit code 0 (cli#1274), and the
    // snapshot of this test was the empty string.
    const { stdout } = await exec(CMD, {
      env: { ...env.env, FRODO_TEST_NAME: '0_i_json' },
    });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent ai describe -i banking-assistant --json": should describe AI agent in JSON format', async () => {
    const CMD = 'frodo agent ai describe -i banking-assistant --json';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent ai describe -i does-not-exist": should fail for non-existing AI agent', async () => {
    const CMD = 'frodo agent ai describe -i does-not-exist';
    let failure;
    try {
      await exec(CMD, env);
    } catch (e) {
      failure = e;
    }
    // exit code 1 (cli#1274): the command used to print the error and end
    // with 0, and this test did not see it because `fail` is not defined
    expect(failure).toBeDefined();
    expect(failure.code).toBe(1);
    expect(normalizeSnapshotText(failure.stderr)).toMatchSnapshot();
  });
});
