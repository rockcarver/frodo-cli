/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote check-promotion-status
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager promote check-promotion-status', () => {
    test(`"frodo config-manager promote check-promotion-status": Will check the current promotion status"`, async () => {
        const CMD = `frodo config-manager promote check-promotion-status`;
        await testSuccess(CMD, cloudEnv);
    });
});