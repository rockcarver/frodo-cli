/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push restart
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push restart -s
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push restart -c
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push restart -w
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

// FRODO_TEST_NAME pins the recording's identity (the last segment of its path): the id stays when flags are renamed.
describe('frodo config-manager push restart', () => {
    test(`"frodo config-manager push restart": should restart the cloud tenant"`, async () => {
        const CMD = `frodo config-manager push restart`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0' } })
    });
    test(`"frodo config-manager push restart -s": should check for updates to apply to the cloud tenant"`, async () => {
        const CMD = `frodo config-manager push restart -s`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_s' } })
    });
    test(`"frodo config-manager push restart -c": should check for updates and then apply them to the cloud tenant"`, async () => {
        const CMD = `frodo config-manager push restart -c`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_c' } })
    });
    test(`"frodo config-manager push restart -w": should restart the cloud tenant and wait until restart is complete to exit command."`, async () => {
        const CMD = `frodo config-manager push restart -w`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_w' } }, 5000);
    });
});