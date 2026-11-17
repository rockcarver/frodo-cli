/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_n_m frodo config-manager delete endpoints -n Javascript -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_y_m frodo config-manager delete endpoints -y -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_dry-run_n_m frodo config-manager delete endpoints --dry-run -n Javascript -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_d_m frodo config-manager delete endpoints -d -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// FRODO_TEST_NAME pins the recording identity of a command: the id its recording was made under.
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete endpoints', () => {
    test(`"frodo config-manager delete endpoints -n Javascript -m forgeops": should delete a specific endpoint by name in config-manager format`, async () => {
        const CMD = `frodo config-manager delete endpoints -n Javascript -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_n_m' } });
    });
    test(`"frodo config-manager delete endpoints -y -m forgeops": should delete all endpoints in config-manager format`, async () => {
        const CMD = `frodo config-manager delete endpoints -y -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_y_m' } });
    });
    test(`"frodo config-manager delete endpoints --dry-run -n Javascript -m forgeops": should delete a specific endpoint by name in config-manager format`, async () => {
        const CMD = `frodo config-manager delete endpoints --dry-run -n Javascript -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_dry-run_n_m' } });
    });
    test(`"frodo config-manager delete endpoints -d -m forgeops": should delete all endpoints in config-manager format`, async () => {
        const CMD = `frodo config-manager delete endpoints -d -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_d_m' } });
    });
});