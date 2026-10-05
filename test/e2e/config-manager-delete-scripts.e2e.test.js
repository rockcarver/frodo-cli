/** See test/e2e/README.md for how to write and record e2e tests. */

// NAME, ID, PREFIX, REALM, ALL
/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=/alpha frodo config-manager delete scripts -n FrodoDeleteByName -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=/alpha frodo config-manager delete scripts -p FrodoDeletePrefix -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete scripts -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=/alpha frodo config-manager delete scripts -d -n FrodoDeleteByName -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete scripts --dry-run -m forgeops
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete scripts', () => {
  test('"frodo config-manager delete scripts -n FrodoDeleteByName -m forgeops": should delete a specific script by name', async () => {
    const CMD = 'frodo config-manager delete scripts -n FrodoDeleteByName -m forgeops';
    await testSuccess(CMD, {
      env: {
        ...forgeopsEnv.env,
        FRODO_REALM: '/alpha',
      },
    });
  });
  test('"frodo config-manager delete scripts -p FrodoDeletePrefix -m forgeops": should delete scripts matching the prefix', async () => {
    const CMD = 'frodo config-manager delete scripts -p FrodoDeletePrefix -m forgeops';
    await testSuccess(CMD, {
      env: {
        ...forgeopsEnv.env,
        FRODO_REALM: '/alpha',
      },
    });
  });
  test('"frodo config-manager delete scripts -m forgeops": should delete eligible scripts across realms', async () => {
    const CMD = 'frodo config-manager delete scripts -m forgeops';
    await testFail(CMD, forgeopsEnv);
  });
  test('"frodo config-manager delete scripts -d -n FrodoDeleteByName -m forgeops": should dry-run delete a specific script by name', async () => {
    const CMD = 'frodo config-manager delete scripts -d -n FrodoDeleteByName -m forgeops';
    await testSuccess(CMD, {
      env: {
        ...forgeopsEnv.env,
        FRODO_REALM: '/alpha',
      },
    });
  });
  test('"frodo config-manager delete scripts --dry-run -m forgeops": should dry-run delete all eligible scripts across realms', async () => {
    const CMD = 'frodo config-manager delete scripts --dry-run -m forgeops';
    await testSuccess(CMD, forgeopsEnv);
  });
});