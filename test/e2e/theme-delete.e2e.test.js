/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme delete -n 'Starter Theme'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme delete --theme-name 'Does Not Exist'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme delete -i 9e6bf50d-85aa-4d70-a340-439d8bc7bc14
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme delete --theme-id 4eeb434c-1f56-4173-8da3-b49214bedeb6
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo theme delete', () => {
  test("\"frodo theme delete -n 'Starter Theme'\": should delete the theme named 'Starter Theme'", async () => {
    const CMD = `frodo theme delete -n 'Starter Theme'`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test("\"frodo theme delete --theme-name 'Does Not Exist'\": should display error when the theme named 'Does Not Exist' cannot be deleted since it does not exist", async () => {
    const CMD = `frodo theme delete --theme-name 'Does Not Exist'`;
    try {
      await exec(CMD, env);
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test('"frodo theme delete -i 9e6bf50d-85aa-4d70-a340-439d8bc7bc14": should delete the theme with id \'9e6bf50d-85aa-4d70-a340-439d8bc7bc14\'', async () => {
    const CMD = `frodo theme delete -i 9e6bf50d-85aa-4d70-a340-439d8bc7bc14`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo theme delete --theme-id 4eeb434c-1f56-4173-8da3-b49214bedeb6": should display error when the theme with id \'4eeb434c-1f56-4173-8da3-b49214bedeb6\' cannot be deleted since it does not exist', async () => {
    const CMD = `frodo theme delete --theme-id 4eeb434c-1f56-4173-8da3-b49214bedeb6`;
    try {
      await exec(CMD, env);
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test('"frodo theme delete -a": should delete all themes', async () => {
    const CMD = `frodo theme delete -a`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
});
