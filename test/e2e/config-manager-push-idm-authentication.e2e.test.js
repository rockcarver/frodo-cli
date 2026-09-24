/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push idm-authentication -D test/e2e/exports/fr-config-manager/forgeops -m forgeops

*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';



process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);


const forgeopsDirectory = "test/e2e/exports/fr-config-manager/forgeops/";

describe('frodo config-manager push idm-authentication', () => {
    test(`"frodo config-manager push idm-authentication -D ${forgeopsDirectory} -m forgeops": should import idm authentication into forgeops"`, async () => {
        const CMD = `frodo config-manager push idm-authentication -D ${forgeopsDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
});