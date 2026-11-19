/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha FRODO_TEST_NAME=0_d_n_m frodo config-manager delete journeys -d -n Test -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha FRODO_TEST_NAME=0_n_m frodo config-manager delete journeys -n Test -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_dry-run_m frodo config-manager delete journeys --dry-run -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_y_m frodo config-manager delete journeys -y -m forgeops
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(fc);

describe('frodo config-manager delete journeys', () => {
    test(`"frodo config-manager delete journeys -d -n Test -m forgeops": should print a dry-run message deleting a specific journey by name in a specific realm"`, async () => {
        const CMD = `frodo config-manager delete journeys -d -n Test -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...env.env,
                FRODO_REALM: 'alpha',
                FRODO_TEST_NAME: '0_d_n_m'
            }
        });
    });
    test(`"frodo config-manager delete journeys -n Test -m forgeops": should delete a specific journey by name in a specific realm"`, async () => {
        const CMD = `frodo config-manager delete journeys -n Test -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...env.env,
                FRODO_REALM: 'alpha',
                FRODO_TEST_NAME: '0_n_m'
            }
        });
    });
    test(`"frodo config-manager delete journeys --dry-run -m forgeops": should print a dry-run message deleting all journeys across all realms"`, async () => {
        const CMD = `frodo config-manager delete journeys --dry-run -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...env.env,
                FRODO_TEST_NAME: '0_dry-run_m'
            }
        })
    });
    test(`"frodo config-manager delete journeys -y -m forgeops": should delete all journeys across every realm"`, async () => {
        const CMD = `frodo config-manager delete journeys -y -m forgeops`;
        await testFail(CMD, {
            env: {
                ...env.env,
                FRODO_TEST_NAME: '0_y_m'
            }
        })
    });
});
