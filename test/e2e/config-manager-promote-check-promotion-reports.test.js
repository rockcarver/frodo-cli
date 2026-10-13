/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote check-promotion-reports
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote check-promotion-reports -i 9b827cbd-d19b-4a5c-a78e-1d383b811d95
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote check-promotion-reports -l
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote check-promotion-reports -p
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager promote check-promotion-reports -r
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager promote check-promotion-reports', () => {
    test(`"frodo config-manager promote check-promotion-reports": Will check last report"`, async () => {
        const CMD = `frodo config-manager promote check-promotion-reports`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager promote check-promotion-reports -i 9b827cbd-d19b-4a5c-a78e-1d383b811d95": Will check a report by ID"`, async () => {
        const CMD = `frodo config-manager promote check-promotion-reports -i 9b827cbd-d19b-4a5c-a78e-1d383b811d95`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager promote check-promotion-reports -l": Will list all reports avaliable"`, async () => {
        const CMD = `frodo config-manager promote check-promotion-reports -l`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager promote check-promotion-reports -p": Will check the provisional promotion report"`, async () => {
        const CMD = `frodo config-manager promote check-promotion-reports -p`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager promote check-promotion-reports -r": Will check the provisional rollback report"`, async () => {
        const CMD = `frodo config-manager promote check-promotion-reports -r`;
        await testSuccess(CMD, cloudEnv);
    });
});