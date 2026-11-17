/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha FRODO_TEST_NAME=0_n_m frodo config-manager delete themes -n Test -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_y_m frodo config-manager delete themes -y -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha FRODO_TEST_NAME=0_d_n_m frodo config-manager delete themes -d -n Test -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_dry-run_m frodo config-manager delete themes --dry-run -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// FRODO_TEST_NAME pins the recording identity of a command: the id its recording was made under.
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete themes', () => {
  test(`"frodo config-manager delete themes -n Test -m forgeops": should delete a specific theme by name in alpha`, async () => {
    const CMD = 'frodo config-manager delete themes -n Test -m forgeops';
    await testSuccess(CMD, {
      env: {
        ...forgeopsEnv.env,
        FRODO_REALM: 'alpha',
        FRODO_TEST_NAME: '0_n_m',
      },
    });
  });
  test('"frodo config-manager delete themes -y -m forgeops": should delete themes across all realms', async () => {
    const CMD = 'frodo config-manager delete themes -y -m forgeops';
    await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_y_m' } });
  });
  test(`"frodo config-manager delete themes -d -n Test -m forgeops": should dry-run delete a specific theme by name in alpha`, async () => {
    const CMD = 'frodo config-manager delete themes -d -n Test -m forgeops';
    await testSuccess(CMD, {
      env: {
        ...forgeopsEnv.env,
        FRODO_REALM: 'alpha',
        FRODO_TEST_NAME: '0_d_n_m',
      },
    });
  });
  test('"frodo config-manager delete themes --dry-run -m forgeops": should preview theme deletion across all realms', async () => {
    const CMD = 'frodo config-manager delete themes --dry-run -m forgeops';
    await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_dry-run_m' } });
  });
});