/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete tenant-config --dry-run
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete tenant-config -y
*/

import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager delete tenant-config', () => {
    test('"frodo config-manager delete tenant-config --dry-run": previews deletion of all secrets and variables', async () => {
      const CMD = 'frodo config-manager delete tenant-config --dry-run';
      await testSuccess(CMD, cloudEnv);
    });
    test('"frodo config-manager delete tenant-config -y": deletes all secrets and variables', async () => {
      const CMD = 'frodo config-manager delete tenant-config -y';
      await testFail(CMD, cloudEnv);
    });
  });