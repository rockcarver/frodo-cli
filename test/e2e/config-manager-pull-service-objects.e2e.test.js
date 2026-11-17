/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_f_D frodo config-manager pull service-objects -f test/e2e/fr-config-manager-pull-config/service-objects.json -D objectTestDir
*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager pull service-objects', () => {
  test('"frodo config-manager pull service-objects -f test/e2e/fr-config-manager-pull-config/service-objects.json -D objectTestDir": should export the service-objects based on service-objects.json config file in fr-config-manager style"', async () => {
    const dirName = 'objectTestDir';
    const CMD = `frodo config-manager pull service-objects -f test/e2e/fr-config-manager-pull-config/service-objects.json -D ${dirName}`;
    await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_f_D' } }, undefined, undefined, dirName, false);
  });
});