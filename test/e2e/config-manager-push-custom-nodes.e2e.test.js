/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push custom-nodes -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push custom-nodes -n "Display Callback" -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/


import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

describe('frodo config-manager push custom-nodes', () => {
    test(`"frodo config-manager push custom-nodes -D ${allDirectory} -m forgeops": should import the custom-nodes into forgeops"`, async () => {
        const CMD = `frodo config-manager push custom-nodes -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);

    });
    test(`"frodo config-manager push custom-nodes -n "Display Callback" -D ${allDirectory} -m forgeops": should import a specific custom node by name into forgeops"`, async () => {
        const CMD = `frodo config-manager push custom-nodes -n "Display Callback" -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
        
    });
});