/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
// WARNING: the next line deletes EVERY schedule of the tenant it is run against. Do
// not record it again: the delete of all schedules is covered by
// test/unit/FrConfigSchedulesDelete.test.js.
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_y_m frodo config-manager delete schedules -y -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_n_m frodo config-manager delete schedules -n taskscan_activate -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_dry-run_m frodo config-manager delete schedules --dry-run -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_dry-run_n_m frodo config-manager delete schedules --dry-run -n taskscan_activate -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// FRODO_TEST_NAME pins the recording identity of a command: the id its recording was made under.
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete schedules', () => {
    test(`"frodo config-manager delete schedules -y -m forgeops": should delete schedules from forgeops"`, async () => {
        const CMD = `frodo config-manager delete schedules -y -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_y_m' } });
    });
    test(`"frodo config-manager delete schedules -n taskscan_activate -m forgeops": should delete a specific schedule by name from forgeops"`, async () => {
        const CMD = `frodo config-manager delete schedules -n taskscan_activate -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_n_m' } });
    });
    test(`"frodo config-manager delete schedules --dry-run -m forgeops": should dry-run delete schedules from forgeops"`, async () => {
        const CMD = `frodo config-manager delete schedules --dry-run -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_dry-run_m' } });
    });
    test(`"frodo config-manager delete schedules --dry-run -n taskscan_activate -m forgeops": should dry-run delete a specific schedule by name from forgeops"`, async () => {
        const CMD = `frodo config-manager delete schedules --dry-run -n taskscan_activate -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_dry-run_n_m' } });
    });
});
