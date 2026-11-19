/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_D_m frodo config-manager push custom-nodes -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_n_D_m frodo config-manager push custom-nodes -n "Display Callback" -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_f_D_m frodo config-manager push custom-nodes --filename-filter ~Display -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager push custom-nodes', () => {
    test(`"frodo config-manager push custom-nodes -D ${allDirectory} -m forgeops": should import the custom-nodes into forgeops"`, async () => {
        const CMD = `frodo config-manager push custom-nodes -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_D_m' } });
    });
    test(`"frodo config-manager push custom-nodes -n "Display Callback" -D ${allDirectory} -m forgeops": should import a specific custom node by name into forgeops"`, async () => {
        const CMD = `frodo config-manager push custom-nodes -n "Display Callback" -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_n_D_m' } });  
    });
    test(`"frodo config-manager push custom-nodes -f ~Display -D ${allDirectory} -m forgeops": should import a specific custom node by name into forgeops"`, async () => {
        const CMD = `frodo config-manager push custom-nodes --filename-filter ~Display -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_f_D_m' } });
    });
});