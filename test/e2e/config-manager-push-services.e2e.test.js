/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push services -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push services -n id-repositories -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push services --name id-repositories -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/


import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

describe('frodo config-manager push services', () => {
    test(`"frodo config-manager push services -D ${allDirectory} -m forgeops": should import all services into forgeops"`, async () => {
        const CMD = `frodo config-manager push services -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo config-manager push services -n id-repositories -D ${allDirectory} -m forgeops": should import a specific service by name into forgeops"`, async () => {
        const CMD = `frodo config-manager push services -n id-repositories -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo config-manager push services --name id-repositories -D ${allDirectory} -m forgeops": should import a specific service by realm into forgeops"`, async () => {
        const CMD = `frodo config-manager push services --name id-repositories -D ${allDirectory} -m forgeops`;
        await testSuccess(CMD,{
            env: {
                ...forgeopsEnv.env,
                FRODO_REALM: 'alpha'
            }
        });
    });
});