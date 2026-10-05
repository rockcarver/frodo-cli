/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha frodo config-manager delete themes -n Test -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete themes -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha frodo config-manager delete themes -d -n Test -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete themes --dry-run -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete themes', () => {
  test(`"frodo config-manager delete themes -n Test -m forgeops": should delete a specific theme by name in alpha`, async () => {
    const CMD = 'frodo config-manager delete themes -n Test -m forgeops';
    await testSuccess(CMD, {
      env: {
        ...forgeopsEnv.env,
        FRODO_REALM: 'alpha',
      },
    });
  });
  test('"frodo config-manager delete themes -m forgeops": should delete themes across all realms', async () => {
    const CMD = 'frodo config-manager delete themes -m forgeops';
    await testSuccess(CMD, forgeopsEnv);
  });
  test(`"frodo config-manager delete themes -d -n Test -m forgeops": should dry-run delete a specific theme by name in alpha`, async () => {
    const CMD = 'frodo config-manager delete themes -d -n Test -m forgeops';
    await testSuccess(CMD, {
      env: {
        ...forgeopsEnv.env,
        FRODO_REALM: 'alpha',
      },
    });
  });
  test('"frodo config-manager delete themes --dry-run -m forgeops": should preview theme deletion across all realms', async () => {
    const CMD = 'frodo config-manager delete themes --dry-run -m forgeops';
    await testSuccess(CMD, forgeopsEnv);
  });
});