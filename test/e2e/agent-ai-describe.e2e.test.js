/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai describe -i banking-assistant
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai describe -i banking-assistant --json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-volker-dev.forgeblocks.com/am frodo agent ai describe -i does-not-exist
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

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
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent ai describe -i banking-assistant --json": should describe AI agent in JSON format', async () => {
    const CMD = 'frodo agent ai describe -i banking-assistant --json';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent ai describe -i does-not-exist": should fail for non-existing AI agent', async () => {
    const CMD = 'frodo agent ai describe -i does-not-exist';
    try {
      await exec(CMD, env);
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });
});
