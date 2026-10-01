/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete connector-definitions -m forgeops 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete connector-definitions -n Azure -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete connector-definitions -d -m forgeops
*/

import { getEnv, testSuccess} from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager delete connector-definitions', () => {
    test(`"frodo config-manager delete connector-definitions -m forgeops": should delete all the connector definitions in fr-config-manager format"`, async () => {
        const CMD = `frodo config-manager delete connector-definitions -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager delete connector-definitions -n Azure -m forgeops": should delete the Azure connector definition in fr-config-manager format"`, async () => {
        const CMD = `frodo config-manager delete connector-definitions -n Azure -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager delete connector-definitions -d -m forgeops": should show what would be deleted in fr-config-manager format as a preview"`, async () => {
        const CMD = `frodo config-manager delete connector-definitions -d -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
});