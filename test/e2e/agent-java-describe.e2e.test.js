/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java describe -i frodo-test-java-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java describe -i frodo-test-java-agent --json
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
// const stagingCommand = `frodo agent java import -i frodo-test-java-agent -f test/e2e/exports/all/allAlphaAgents.java.agent.json`;

describe('frodo agent java describe', () => {
  // beforeEach(async () => {
  //   await stageFixture(stagingCommand, env);
  // });

  // afterEach(async () => {
  //   await clearFixture('frodo agent java delete -i frodo-test-java-agent', env);
  // });
  test('"frodo agent java describe -i frodo-test-java-agent": should describe java agent in table format', async () => {
    const CMD = 'frodo agent java describe -i frodo-test-java-agent';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent java describe -i frodo-test-java-agent --json": should describe java agent in JSON format', async () => {
    const CMD = 'frodo agent java describe -i frodo-test-java-agent --json';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });
});
