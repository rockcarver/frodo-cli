/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete custom-nodes -y
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete custom-nodes -d
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete custom-nodes -n ALU
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete custom-nodes -n ALU --dry-run
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo config-manager delete custom-nodes', () => {
    // Record 0040: after the errors of the failed deletes and the count of the
    // deleted nodes the command prints one summary that names each failed node
    // with its reason (4 of 12 here). The recording is unchanged; the summary
    // was added to the snapshot by hand.
    test(`"frodo config-manager delete custom-nodes -y": should continue deleting custom nodes after individual failures and exit unsuccessfully"`, async () => {
        const CMD = `frodo config-manager delete custom-nodes -y`;
        await testFail(CMD, env);
    });
    test(`"frodo config-manager delete custom-nodes -d": should dry-run delete all the custom-nodes"`, async () => {
        const CMD = `frodo config-manager delete custom-nodes -d`;
        await testSuccess(CMD, env);
    });
    test(`"frodo config-manager delete custom-nodes -n ALU": should delete a specific custom node by name"`, async () => {
        const CMD = `frodo config-manager delete custom-nodes -n ALU`;
        await testSuccess(CMD, env);  
    });
    test(`"frodo config-manager delete custom-nodes -n ALU --dry-run": should dry-run delete a specific custom node by name"`, async () => {
        const CMD = `frodo config-manager delete custom-nodes -n ALU --dry-run`;
        await testSuccess(CMD, env);  
    });
});