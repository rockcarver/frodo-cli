/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set delete -i test-policy-set
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set delete --set-id test-policy-set
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo authz set delete', () => {
  test('"frodo authz set delete -i test-policy-set": should delete the policy set with id \'test-policy-set\'', async () => {
    const CMD = `frodo authz set delete -i test-policy-set`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo authz set delete --set-id test-policy-set": should display error when the policy set with id \'test-policy-set\' cannot be deleted since it does not exist', async () => {
    const CMD = `frodo authz set delete --set-id test-policy-set`;
    try {
      const { stderr } = await exec(CMD, env);
      fail(`Command expected to fail: ${CMD}`);
    } catch (error) {
      expect(normalizeSnapshotText(error.stderr)).toMatchSnapshot();
    }
  });

  test('"frodo authz set delete -a": should delete all policy sets', async () => {
    const CMD = `frodo authz set delete -a`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo authz set delete --all": should do nothing when no policy sets can be deleted', async () => {
    const CMD = `frodo authz set delete --all`;
    const { stderr } = await exec(CMD, env);
    expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
  });
});
