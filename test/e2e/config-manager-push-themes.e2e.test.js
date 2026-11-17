/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=allRealms frodo config-manager push themes -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha FRODO_TEST_NAME=0_D_m frodo config-manager push themes -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

// FRODO_TEST_NAME pins the recording's identity (the last segment of its path): the id stays when flags are renamed.
test(`"frodo config-manager push themes -D ${allDirectory} -m forgeops": should import the themes into forgeops"`, async () => {
    const CMD = `frodo config-manager push themes -D ${allDirectory} -m forgeops`;
    await testSuccess(CMD, {
        env: {
            ...forgeopsEnv.env,
            FRODO_TEST_NAME: 'allRealms',
        }
    });
});

test(`"frodo config-manager push themes -D ${allDirectory} -m forgeops": should import the themes into forgeops"`, async () => {
    const CMD = `frodo config-manager push themes -D ${allDirectory} -m forgeops`;
    await testSuccess(CMD, {
        env: {
            ...forgeopsEnv.env,
            FRODO_TEST_NAME: '0_D_m',
            FRODO_REALM: 'alpha'
        }
    });
});