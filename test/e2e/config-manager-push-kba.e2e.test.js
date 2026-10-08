/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push kba -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import { getEnv, normalizeSnapshotText, exec } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops/";

describe('frodo config-manager push kba', () => {
    test(`"frodo config-manager push kba -D ${allDirectory}-m forgeops": should import KBA into forgeops"`, async () => {
        const CMD = `frodo config-manager push kba -D ${allDirectory} -m forgeops`;
        const { stdout, stderr } = await exec(CMD, forgeopsEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot();
    });
});