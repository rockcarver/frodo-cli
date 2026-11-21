/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_dry-run_n frodo config-manager delete secrets --dry-run -i esv-josh-secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_n frodo config-manager delete secrets -i esv-josh-secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_d frodo config-manager delete secrets -d
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';



process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const cloudEnv = getEnv(c);

describe('frodo config-manager delete secrets', () => {
    test(`"frodo config-manager delete secrets --dry-run -n esv-josh-secret": should print a dry-run message deleting a secret by name from cloud."`, async () => {
        const CMD = `frodo config-manager delete secrets --dry-run -i esv-josh-secret`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_dry-run_n' } })
    });
    test(`"frodo config-manager delete secrets -n esv-josh-secret": should delete a specific secret by name from cloud.`, async () => {
        const CMD = `frodo config-manager delete secrets -i esv-josh-secret`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_n' } })
    });
    test(`"frodo config-manager delete secrets -d": should dry-run delete all secrets from cloud.`, async () => {
        const CMD = `frodo config-manager delete secrets -d`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_d' } })
    });
    test(`"frodo config-manager delete secrets -y": should delete all secrets from cloud.`, async () => {
        const CMD = `frodo config-manager delete secrets -y`;
        await testFail(CMD, cloudEnv)
    });
});