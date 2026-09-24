/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway describe -i frodo-test-ig-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway describe -i frodo-test-ig-agent --json
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
// const stagingCommand = `frodo agent gateway import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.gateway.agent.json`;

describe('frodo agent gateway describe', () => {
  // beforeEach(async () => {
  //   await stageFixture(stagingCommand, env);
  // });

  // afterEach(async () => {
  //   await clearFixture('frodo agent gateway delete -i frodo-test-ig-agent', env);
  // });
  test('"frodo agent gateway describe -i frodo-test-ig-agent": should describe gateway agent in table format', async () => {
    const CMD = 'frodo agent gateway describe -i frodo-test-ig-agent';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent gateway describe -i frodo-test-ig-agent --json": should describe gateway agent in JSON format', async () => {
    const CMD = 'frodo agent gateway describe -i frodo-test-ig-agent --json';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });
});
