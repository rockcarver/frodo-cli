/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_D_m frodo config-manager push raw -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_p_D_m frodo config-manager push raw -p test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
cat test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config/cluster.json | FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am  FRODO_TEST_NAME=0_p_i_m frodo config-manager push raw -p /openidm/config/cluster -i -m forgeops
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_E_D frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_E_p_D frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -p test/e2e/exports/fr-config-manager/cloud/raw/environment  -D test/e2e/exports/fr-config-manager/cloud
*/

import { exec, getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';
import { connection as c } from './utils/TestConfig';
import {readFileSync} from 'fs'

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);
const cloudEnv = getEnv(c)

const forgeopsDirectory = "test/e2e/exports/fr-config-manager/forgeops";
const cloudDirectory = "test/e2e/exports/fr-config-manager/cloud"
const stdinFile = "test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config/cluster.json"

/*
 * The path of -p is the path of the configuration in the tenant, below the raw
 * folder (for example /openidm/config/cluster), not a file-system path. The two
 * tests below name a file-system path, which matches no raw configuration. The
 * command used to import nothing and exit 0; a named path that matches nothing
 * is a failure now (decision record 0041, cli#1112), so they pin exit code 1.
 * Their old snapshots (exit code 0, "Raw config import completed.") were
 * removed by hand, and nothing is recorded again: the output is not asserted,
 * because the replay's expiry warnings come with it.
 */
async function expectNoMatchingPath(command, env) {
    let failure;
    try {
        await exec(command, env);
    } catch (e) {
        failure = e;
    }
    expect(failure?.code).toBe(1);
}

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager push raw ', () => {
    //Forgeops
    test(`"frodo config-manager push raw -D ${forgeopsDirectory} -m forgeops": should import raw configuration into forgeops"`, async () => {
        const CMD = `frodo config-manager push raw -D ${forgeopsDirectory} -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_D_m' } });
    });
    test(`"frodo config-manager push raw -p /openidm/config/cluster -i -m forgeops": should import raw configuration into forgeops"`, async () => {
        const CMD = `frodo config-manager push raw -p /openidm/config/cluster -i -m forgeops`;
        await testSuccess(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_p_i_m' } }, 0, readFileSync(stdinFile));
    });
    test(`"frodo config-manager push raw -p test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -m forgeops": should fail because the path matches no raw configuration"`, async () => {
        const CMD = `frodo config-manager push raw -p test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -D ${forgeopsDirectory} -m forgeops`;
        await expectNoMatchingPath(CMD, { ...forgeopsEnv, env: { ...forgeopsEnv.env, FRODO_TEST_NAME: '0_p_D_m' } });
    });

    //Cloud
    test(`"frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -D ${cloudDirectory}: should import raw configuration into cloud"`, async () => {
        const CMD = `frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -D ${cloudDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_E_D' } });
    });
    test(`"frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -p test/e2e/exports/fr-config-manager/cloud/raw/environment -D ${cloudDirectory}: should fail because the path matches no raw configuration"`, async () => {
        const CMD = `frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -p test/e2e/exports/fr-config-manager/cloud/raw/environment  -D ${cloudDirectory}`;
        await expectNoMatchingPath(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_E_p_D' } });
    });
});