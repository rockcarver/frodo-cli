/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo log list
 */
import cp from 'child_process';
import { promisify } from 'util';
import { connection as c } from './utils/TestConfig';
import { normalizeSnapshotText } from './utils/TestUtils';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] = './test/e2e/env/Connections.json';
process.env['FRODO_HOST'] = c.host;
process.env['FRODO_LOG_KEY'] = c.saId;
process.env['FRODO_LOG_SECRET'] = c.saJwk;
const env = {
  env: process.env,
};

describe('frodo log list', () => {
  test('"frodo log list": should list the names of the logs sources', async () => {
    const CMD = `frodo log list`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
});
