/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web describe -i frodo-test-web-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web describe -i frodo-test-web-agent --json
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, stageFixture, clearFixture, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
// const stagingCommand = `frodo agent web import -i frodo-test-web-agent -f test/e2e/exports/all/allAlphaAgents.web.agent.json`;

describe('frodo agent web describe', () => {
  // beforeEach(async () => {
  //   await stageFixture(stagingCommand, env);
  // });

  // afterEach(async () => {
  //   await clearFixture('frodo agent web delete -i frodo-test-web-agent', env);
  // });
  test('"frodo agent web describe -i frodo-test-web-agent": should describe web agent in table format', async () => {
    const CMD = 'frodo agent web describe -i frodo-test-web-agent';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });

  test('"frodo agent web describe -i frodo-test-web-agent --json": should describe web agent in JSON format', async () => {
    const CMD = 'frodo agent web describe -i frodo-test-web-agent --json';
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  });
});
