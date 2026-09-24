/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent ai delete -i testAgent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent ai delete --agent-id does-not-exist
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent ai delete -a
*/

import cp from 'child_process';
import { promisify } from 'util';
import { clearFixture, getEnv, stageFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

// const stagedAgentImport =
//   'frodo agent ai import frodo-dev -i testAgent -f test/e2e/exports/all/allAlphaAgents.ai.agent.json';
const deleteAgent = 'frodo agent ai delete -i testAgent';
const deleteNonExistantAgent = 'frodo agent ai delete --agent-id does-not-exist';
const deleteAllAgents = 'frodo agent ai delete -a';

describe('frodo agent ai delete', () => {

  // in recording mode, setup test data before recording and cleanup after
  // in replay mode, tests run with mock data from HAR files (no setup/teardown needed)
  // beforeAll(async () => {
  //   if (process.env['FRODO_MOCK'] === 'record') {
  //     await stageFixture(stagedAgentImport, env);
  //   }
  // });

  // afterAll(async () => {
  //   if (process.env['FRODO_MOCK'] === 'record') {
  //     await clearFixture(deleteAgent, env);
  //     await clearFixture(deleteAllAgents, env);
  //   }
  // });

  test('"frodo agent ai delete frodo-dev -i testAgent": should delete AI agent testAgent', async () => {
    const { stdout } = await exec(deleteAgent, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent ai delete frodo-dev --agent-id does-not-exist": should fail deleting does-not-exist', async () => {
    try {
      await exec(deleteNonExistantAgent, env);
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test('"frodo agent ai delete frodo-dev -a": should delete all AI agents', async () => {
    const { stdout } = await exec(deleteAllAgents, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });
});
