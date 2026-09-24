/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push terms-and-conditions -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

test(`"frodo config-manager push terms-and-conditions -D ${allDirectory} -m forgeops": should import the terms and conditions into forgeops"`, async () => {
    const CMD = `frodo config-manager push terms-and-conditions -D ${allDirectory} -m forgeops`;
    const { stdout } = await exec(CMD, forgeopsEnv);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
});