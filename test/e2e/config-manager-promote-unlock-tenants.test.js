/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS=https://openam-frodo-promo-prd.forgeblocks.com FRODO_HOST=https://openam-frodo-promo-prd.forgeblocks.com/am FRODO_TEST_NAME=0_i frodo config-manager promote unlock-tenants -i 97b37332-a293-4052-a3cc-4a421fd59557
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const cloudEnv = getEnv(c);

describe('frodo config-manager promote unlock-tenants', () => {
    test(`"frodo config-manager promote unlock-tenants -i 97b37332-a293-4052-a3cc-4a421fd59557": unlock tenants if tenants are locked"`, async () => {
        const CMD = `frodo config-manager promote unlock-tenants -i 97b37332-a293-4052-a3cc-4a421fd59557`;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_i' } });
    });
});