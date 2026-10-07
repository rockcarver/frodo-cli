/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete variables --dry-run -n esv-josh-delete-test
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete variables -n esv-josh-delete-test
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete variables -d
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('Should delete variables from cloud', () => {
    test(`"frodo config-manager delete variables --dry-run -n esv-josh-delete-test": should print a dryrun message deleting by name from cloud."`, async () => {
        const CMD = `frodo config-manager delete variables --dry-run -n esv-josh-delete-test`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager delete variables -n esv-josh-delete-test": should delete a specific variable by name from cloud."`, async () => {
        const CMD = `frodo config-manager delete variables -n esv-josh-delete-test`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager delete variables -d": should print a dryrun message deleting by name from cloud."`, async () => {
        const CMD = `frodo config-manager delete variables -d`;
        await testSuccess(CMD, cloudEnv);
    });
});