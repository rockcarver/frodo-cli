/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=<host> FRODO_TEST_NAME=0_dry-run frodo config-manager delete tenant-config --dry-run
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=<host> FRODO_TEST_NAME=0_y frodo config-manager delete tenant-config -y
*/

import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const cloudEnv = getEnv(c);

describe('frodo config-manager delete tenant-config', () => {
    test('"frodo config-manager delete tenant-config --dry-run": previews deletion of all secrets and variables', async () => {
      const CMD = 'frodo config-manager delete tenant-config --dry-run';
      await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_dry-run' } });
    });
    // The recorded run ends with exit code 1: the tenant refused to delete the
    // secrets and variables that a configuration placeholder still uses (HTTP 403).
    test('"frodo config-manager delete tenant-config -y": deletes all secrets and variables', async () => {
      const CMD = 'frodo config-manager delete tenant-config -y';
      await testFail(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_y' } });
    });
  });