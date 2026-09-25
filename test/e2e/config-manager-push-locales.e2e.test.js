/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push locales -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push locales -n fr -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

test(`"frodo config-manager push locales -D ${allDirectory} -m forgeops": should import the locales into forgeops"`, async () => {
    const CMD = `frodo config-manager push locales -D ${allDirectory} -m forgeops`;
    const { stdout } = await exec(CMD, forgeopsEnv);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
});
test(`"frodo config-manager push locales -n fr -D ${allDirectory} -m forgeops": should import a specific locale by name into forgeops"`, async () => {
    const CMD = `frodo config-manager push locales -n fr -D ${allDirectory} -m forgeops`;
    const { stdout } = await exec(CMD, forgeopsEnv);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
});