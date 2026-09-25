/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type delete -n FrodoTestResourceType13
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type delete --type-name FrodoTestResourceType13
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type delete -i 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type delete --type-id 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo authz type delete', () => {
  test('"frodo authz type delete -n FrodoTestResourceType13": should delete the resource type with name FrodoTestResourceType13', async () => {
    const CMD = `frodo authz type delete -n FrodoTestResourceType13`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo authz type delete --type-name FrodoTestResourceType13": should display error when the resource type with name FrodoTestResourceType13 cannot be deleted since it does not exist', async () => {
    const CMD = `frodo authz type delete --type-name FrodoTestResourceType13`;
    expect.assertions(1);
    try {
      await exec(CMD, env);
      fail(`Command expected to fail: ${CMD}`);
    } catch (error) {
      expect(normalizeSnapshotText(error.stderr)).toMatchSnapshot();
    }
  });

  test('"frodo authz type delete -i 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76": should delete the resource type with id 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76', async () => {
    const CMD = `frodo authz type delete -i 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo authz type delete --type-id 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76": should display error when the resource type with id 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76 cannot be deleted since it does not exist', async () => {
    const CMD = `frodo authz type delete --type-id 0aa5ed25-0c62-4ff5-9a42-3bda8c5cbb76`;
    expect.assertions(1);
    try {
      await exec(CMD, env);
      fail(`Command expected to fail: ${CMD}`);
    } catch (error) {
      expect(normalizeSnapshotText(error.stderr)).toMatchSnapshot();
    }
  });

  //TODO: Generate mock for this test (skip for meantime)
  test.skip('"frodo authz type delete -a": should delete all resource types', async () => {
    const CMD = `frodo authz type delete -a`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  //TODO: Generate mock for this test (skip for meantime)
  test.skip('"frodo authz type delete --all": should do nothing when no resource types can be deleted', async () => {
    const CMD = `frodo authz type delete --all`;
    const { stderr } = await exec(CMD, env);
    expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
  });
});
