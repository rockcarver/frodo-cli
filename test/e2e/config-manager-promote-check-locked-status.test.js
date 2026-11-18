/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0 frodo config-manager promote check-locked-status
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_l frodo config-manager promote check-locked-status -L
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const cloudEnv = getEnv(c);

describe('frodo config-manager promote check-locked-status', () => {
    test(`"frodo config-manager promote check-locked-status": Will check lock-status(should default --local-lock-only to false)"`, async () => {
        const CMD = `frodo config-manager promote check-locked-status`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0' } });
    });
    test(`"frodo config-manager promote check-locked-status -l": Will check lock-status for local lock only."`, async () => {
        const CMD = `frodo config-manager promote check-locked-status -L`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_l' } });
    });
});