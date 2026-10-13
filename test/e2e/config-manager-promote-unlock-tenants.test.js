/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote unlock-tenants -i bb757dc6-0646-47d7-b63c-c7c6b5668ad7
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager promote unlock-tenants', () => {
    test(`"frodo config-manager promote unlock-tenants -i bb757dc6-0646-47d7-b63c-c7c6b5668ad7": unlock tenants if tenants are locked"`, async () => {
        const CMD = `frodo config-manager promote unlock-tenants -i bb757dc6-0646-47d7-b63c-c7c6b5668ad7`;
        await testSuccess(CMD, cloudEnv);
    });
});