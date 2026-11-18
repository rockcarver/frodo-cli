/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0 frodo config-manager pull test
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_USERNAME=wrong FRODO_PASSWORD=wrong FRODO_TEST_NAME='invalid_credentials' frodo config-manager pull test
*/

import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager pull test', () => {
  test('"frodo config-manager pull test": should receive access tokens"', async () => {
    const env = getEnv(c);
    const CMD = `frodo config-manager pull test`;
    await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0' } });
  });
  test('"frodo config-manager pull test": should fail connection with invalid credentials"', async () => {
    const CMD = `frodo config-manager pull test`;
    const env = getEnv(c);
    env.env.FRODO_TEST_NAME = 'invalid_credentials';
    env.env.FRODO_PASSWORD = 'wrong';
    env.env.FRODO_USERNAME = 'wrong';
    env.env.FRODO_MOCK_DEDICATED_AUTH = '1';
    delete env.env.FRODO_SA_ID;
    delete env.env.FRODO_SA_JWK;
    await testFail(CMD, env);
  });
});