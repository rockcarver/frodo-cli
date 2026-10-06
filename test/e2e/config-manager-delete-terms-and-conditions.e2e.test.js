/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete terms-and-conditions -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete terms-and-conditions -n 0.1 -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete terms-and-conditions', () => {
    test('should delete all terms and conditions versions from forgeops', async () => {
      const CMD = `frodo config-manager delete terms-and-conditions -m forgeops`;
      await testSuccess(CMD, forgeopsEnv);
    });
    test('should delete a specific terms and conditions version from forgeops', async () => {
      const CMD = `frodo config-manager delete terms-and-conditions -n 0.1 -m forgeops`;
      await testSuccess(CMD, forgeopsEnv);
    });
});
