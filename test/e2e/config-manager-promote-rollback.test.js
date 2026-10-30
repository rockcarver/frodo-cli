/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote rollback
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote rollback -p provisional-report -ud 'provisional report' -t ticket
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager promote rollback', () => {
    test(`"frodo config-manager promote rollback": Will run rollback"`, async () => {
        const CMD = `frodo config-manager promote rollback`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager promote rollback -p provisional-report -ud 'provisional report' -t ticket": Will run rollback with promoter, description, unlocking after, and Zendesk ticket"`, async () => {
        const CMD = `frodo config-manager promote rollback -p provisional-report -ud 'provisional report' -t ticket`;
        await testSuccess(CMD, cloudEnv);
    });
});