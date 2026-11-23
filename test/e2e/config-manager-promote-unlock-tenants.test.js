/** See test/e2e/README.md for how to write and record e2e tests. */

/*
 * The unlock recording was recorded with the CLI on a promotion pair (the host of the command is the upper environment).
 * It was the last command of the recording session: both environments had been locked once, for the whole session, by
 * the recording of the lock test, and the id in the command is the id of that lock. Only repeated identical lock-state
 * polls of this recording were trimmed: the first poll of every state and the last poll stay, in their recorded order
 * (https://github.com/rockcarver/frodo-lib/blob/main/decisions/0014-a-recording-of-a-wait-may-be-trimmed-of-its-repeated-polls.md).
 */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_i frodo config-manager promote unlock-tenants -i d1d00cc5-127a-485f-b541-68542e0d2a7c
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const cloudEnv = getEnv(c);

describe('frodo config-manager promote unlock-tenants', () => {
    test(`"frodo config-manager promote unlock-tenants -i d1d00cc5-127a-485f-b541-68542e0d2a7c": unlock tenants if tenants are locked"`, async () => {
        const CMD = `frodo config-manager promote unlock-tenants -i d1d00cc5-127a-485f-b541-68542e0d2a7c`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_i' } });
    });
});