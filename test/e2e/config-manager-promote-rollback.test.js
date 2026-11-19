/** See test/e2e/README.md for how to write and record e2e tests. */

/*
 * The "--wait" and "--wait --timeout 6" recordings were recorded with the CLI on a promotion pair (the host of the
 * commands is the upper environment), one command at a time. The two environments were locked before each command
 * (frodo config-manager promote lock-tenants) and unlocked after its promotion had finished; a "--timeout 6" run
 * times out in the CLI while the promotion goes on, and its recording ends there. Record with FRODO_NO_UPDATE_CHECK=1
 * and, for a tenant that is not a frodo development host, FRODO_MOCK_HOSTS=<origin of the host>. Only repeated
 * identical status polls of the "--wait" recordings were trimmed: the first poll of every state and the last poll
 * stay, in their recorded order (https://github.com/rockcarver/frodo-lib/blob/main/decisions/0014-a-recording-of-a-wait-may-be-trimmed-of-its-repeated-polls.md).
 * The recording name uses the flag names, not their values, so "--timeout 6" and any other value share one recording.
 */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0 frodo config-manager promote rollback
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_p_ud_t frodo config-manager promote rollback -P provisional-report -u --description 'provisional report' -t ticket
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_wait frodo config-manager promote rollback --wait
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_wait_timeout frodo config-manager promote rollback --wait --timeout 6
*/

import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const cloudEnv = getEnv(c);

describe('frodo config-manager promote rollback', () => {
    test(`"frodo config-manager promote rollback": Will run rollback"`, async () => {
        const CMD = `frodo config-manager promote rollback`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0' } });
    });
    test(`"frodo config-manager promote rollback -p provisional-report -ud 'provisional report' -t ticket": Will run rollback with promoter, description, unlocking after, and Zendesk ticket"`, async () => {
        const CMD = `frodo config-manager promote rollback -P provisional-report -u --description 'provisional report' -t ticket`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_p_ud_t' } });
    });
    test(`"frodo config-manager promote rollback --wait": Should wait for rollback to complete`, async () => {
        const CMD = `frodo config-manager promote rollback --wait`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_wait' } });
      });
    test(`"frodo config-manager promote rollback --wait --timeout 6": Should time out waiting for rollback`, async () => {
        const CMD = `frodo config-manager promote rollback --wait --timeout 6`;
        await testFail(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_wait_timeout' } });
    });
});