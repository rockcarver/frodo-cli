/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push journeys -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push journeys -n ProgressiveProfile -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push journeys -d -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push journeys -n Test -d -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push journeys --directory test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";
describe('frodo config-manager push journeys', () => {
    test(`"frodo config-manager push journeys -D ${allDirectory} -m forgeops": should import the journeys into forgeops"`, async () => {
        const CMD = `frodo config-manager push journeys -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager push journeys -n ProgressiveProfile -D ${allDirectory} -m forgeops": should import a specific journey by name into forgeops"`, async () => {
        const CMD = `frodo config-manager push journeys -n ProgressiveProfile -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager push journeys -d -D ${allDirectory} -m forgeops": should resolve dependencies when importing to  forgeops"`, async () => {
        const CMD = `frodo config-manager push journeys -d -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager push journeys -n Test -d -D ${allDirectory} -m forgeops": should import a journey with dependencies"`, async () => {
        const CMD = `frodo config-manager push journeys -n Test -d  -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager push journeys --directory ${allDirectory} -m forgeops": should import journeys into a specific realm"`, async () => {
        const CMD = `frodo config-manager push journeys --directory ${allDirectory} -m forgeops`;
        await testSuccess(CMD, {
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: 'alpha'
            }
        });
    });
});