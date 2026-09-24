/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull idm-authentication -D test/e2e/exports/fr-config-manager/forgeops -m forgeops

*/
import { getEnv, testExport } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const dirName = "idmAuthDir";

describe('frodo config-manager pull idm-authentication', () => {
    test(`"frodo config-manager pull idm-authentication -D ${dirName} -m forgeops": should export idm authentication from forgeops"`, async () => {
        const CMD = `frodo config-manager pull idm-authentication -D ${dirName} -m forgeops`;
        await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
    });
});
