/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_TEST_NAME=0_y_m FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete remote-servers -y -m forgeops
FRODO_TEST_NAME=0_dry-run_m FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete remote-servers --dry-run -m forgeops
FRODO_TEST_NAME=0_name_m FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete remote-servers --name asdf -m forgeops
FRODO_TEST_NAME=0_d_n_m FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete remote-servers -d -n asdf -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete remote-servers', () => {
  test('"frodo config-manager delete remote-servers -y -m forgeops": should delete all remote servers from ForgeOps', async () => {
    const CMD = 'frodo config-manager delete remote-servers -y -m forgeops';
    await testSuccess(CMD, {
      ...forgeopsEnv,
      env: {
        ...forgeopsEnv.env,
        FRODO_TEST_NAME: '0_y_m',
      },
    });
  });
  test('"frodo config-manager delete remote-servers --dry-run -m forgeops": should preview deletion of all remote servers on ForgeOps', async () => {
    const CMD = 'frodo config-manager delete remote-servers --dry-run -m forgeops';
    await testSuccess(CMD, {
      ...forgeopsEnv,
      env: {
        ...forgeopsEnv.env,
        FRODO_TEST_NAME: '0_dry-run_m',
      },
    });
  });
  test('"frodo config-manager delete remote-servers --name asdf -m forgeops": should delete the remote server named asdf from ForgeOps', async () => {
    const CMD = 'frodo config-manager delete remote-servers --remote-server-id asdf -m forgeops';
    await testSuccess(CMD, {
      ...forgeopsEnv,
      env: {
        ...forgeopsEnv.env,
        FRODO_TEST_NAME: '0_name_m',
      },
    });
  });
  test('"frodo config-manager delete remote-servers -d -n asdf -m forgeops": should preview deletion of the remote server named asdf on ForgeOps', async () => {
    const CMD = 'frodo config-manager delete remote-servers -d -i asdf -m forgeops';
    await testSuccess(CMD, {
      ...forgeopsEnv,
      env: {
        ...forgeopsEnv.env,
        FRODO_TEST_NAME: '0_d_n_m',
      },
    });
  });
});