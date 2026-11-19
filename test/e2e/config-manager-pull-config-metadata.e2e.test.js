/** See test/e2e/README.md for how to write and record e2e tests. */

/* 
//forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_m frodo config-manager pull config-metadata -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(fc);

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager pull config-metadata', () => {
  test('"frodo config-manager pull config-metadata -m forgeops ": should export the config-metadata in fr-config-manager style"', async () => {
    const CMD = `frodo config-manager pull config-metadata -m forgeops`;
    await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_m' } });
  });
});
