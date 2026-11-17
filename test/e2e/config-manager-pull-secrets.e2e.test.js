/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D frodo config-manager pull secrets -D secretTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_aD frodo config-manager pull secrets -aD secretTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME='report' frodo config-manager pull secrets -r
*/

import { getEnv, testExport, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager pull secrets', () => {
  test('"frodo config-manager pull secrets -D secretTestDir1": should export all secrets and their versions in fr-config-manager style"', async () => {
    const dirName = 'secretTestDir1';
    const CMD = `frodo config-manager pull secrets -D ${dirName}`;
    await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_D' } }, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull secrets -aD secretTestDir2": should export all the active only secrets in fr-config-manager style"', async () => {
    const dirName = 'secretTestDir2';
    const CMD = `frodo config-manager pull secrets -aD ${dirName}`;
    await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_aD' } }, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull secrets -r": should report all secrets as a csv table report in fr-config-manager style"', async () => {
    const CMD = `frodo config-manager pull secrets -r`;
    await testSuccess(CMD, {
      ...env,
      env: { ...env.env, FRODO_TEST_NAME: 'report' },
    });
  });
});
