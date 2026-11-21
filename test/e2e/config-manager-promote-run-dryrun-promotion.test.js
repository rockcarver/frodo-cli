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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=0 frodo config-manager promote run-dryrun-promotion
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=0_p_uid_t frodo config-manager promote run-dryrun-promotion -P provisional-report -uI --description 'provisional report' -t ticket
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=0_wait frodo config-manager promote run-dryrun-promotion --wait
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=0_wait_timeout frodo config-manager promote run-dryrun-promotion --wait --timeout 6
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=missingEsvError frodo config-manager promote run-dryrun-promotion --wait
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=encryptedSecretsWarningContinue frodo config-manager promote run-dryrun-promotion --full
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=0_full frodo config-manager promote run-dryrun-promotion --full
*/

import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const cloudEnv = getEnv(c);

describe('frodo config-manager promote run-dryrun-promotion', () => {
    test(`"frodo config-manager promote run-dryrun-promotion": Will run promotion"`, async () => {
        const CMD = `frodo config-manager promote run-dryrun-promotion`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0' } });
    });
    test(`"frodo config-manager promote run-dryrun-promotion -P provisional-report -uI --description 'provisional report' -t ticket": Will run dry-run promotion with promoter, description, ignoring encrpted secrets, unlocking after, and Zendesk ticket"`, async () => {
        const CMD = `frodo config-manager promote run-dryrun-promotion -P provisional-report -uI --description 'provisional report' -t ticket`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_p_uid_t' } });
    });
    test(`"frodo config-manager promote run-dryrun-promotion --wait": Should wait for dry-run promotion to complete`, async () => {
        const CMD = `frodo config-manager promote run-dryrun-promotion --wait`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_wait' } });
    });
    test(`"frodo config-manager promote run-dryrun-promotion --wait --timeout 6": Should time out waiting for dry-run promotion`, async () => {
        const CMD = `frodo config-manager promote run-dryrun-promotion --wait --timeout 6`;
        await testFail(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_wait_timeout' } });
    });
    test(`"frodo config-manager promote run-dryrun-promotion --wait": Should fail due to missing ESVs`, async () => {
        const CMD = `frodo config-manager promote run-dryrun-promotion --wait`;
        await testFail(CMD, {
            ...cloudEnv,
            env: {
                ...cloudEnv.env,
                FRODO_TEST_NAME: 'missingEsvError',
            },
        });
    });
    test(`"frodo config-manager promote run-dryrun-promotion --full": Should continue after encrypted secrets warning`, async () => {
        const CMD = `frodo config-manager promote run-dryrun-promotion --full`;
        await testSuccess(CMD, {
            ...cloudEnv,
            env: {
                ...cloudEnv.env,
                FRODO_TEST_NAME: 'encryptedSecretsWarningContinue',
            },
        }, undefined, 'y');
    });
    test(`"frodo config-manager promote run-dryrun-promotion --full": Should run full dry-run promotion without errors`, async () => {
        const CMD = `frodo config-manager promote run-dryrun-promotion --full`;
        await testSuccess(CMD, {
            ...cloudEnv,
            env: {
                ...cloudEnv.env,
                FRODO_TEST_NAME: '0_full',
            },
        });
    });
});