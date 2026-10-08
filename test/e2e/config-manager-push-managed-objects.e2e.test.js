/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push managed-objects -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push managed-objects -n testObject -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, normalizeSnapshotText, exec } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

describe('frodo config-manager push managed-objects', () => {
    test(`"frodo config-manager push managed-objects -D ${allDirectory} -m forgeops": should import the managed-objects into forgeops"`, async () => {
        const CMD = `frodo config-manager push managed-objects -D ${allDirectory} -m forgeops`;
        const { stdout } = await exec(CMD, forgeopsEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo config-manager push managed-objects -n testObject -D ${allDirectory} -m forgeops": should import a specific managed-object by name into forgeops"`, async () => {
        const CMD = `frodo config-manager push managed-objects -n testObject -D ${allDirectory} -m forgeops`;
        const { stdout } = await exec(CMD, forgeopsEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });
});