/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push raw -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push raw -p test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
cat test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config/cluster.json | FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am  frodo config-manager push raw -p /openidm/config/cluster -i -m forgeops
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -p test/e2e/exports/fr-config-manager/cloud/raw/environment  -D test/e2e/exports/fr-config-manager/cloud

*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';
import { connection as c } from './utils/TestConfig';
import {readFileSync} from 'fs'

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);
const cloudEnv = getEnv(c)

const forgeopsDirectory = "test/e2e/exports/fr-config-manager/forgeops";
const cloudDirectory = "test/e2e/exports/fr-config-manager/cloud"
const stdinFile = "test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config/cluster.json"

describe('frodo config-manager push raw ', () => {
    //Forgeops
    test(`"frodo config-manager push raw -D ${forgeopsDirectory} -m forgeops": should import raw configuration into forgeops"`, async () => {
        const CMD = `frodo config-manager push raw -D ${forgeopsDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager push raw -p /openidm/config/cluster -i -m forgeops": should import raw configuration into forgeops"`, async () => {
        const CMD = `frodo config-manager push raw -p /openidm/config/cluster -i -m forgeops`;
        await testSuccess(CMD, forgeopsEnv, 0, readFileSync(stdinFile));
    });
    test(`"frodo config-manager push raw -p test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -m forgeops": should import raw configuration into forgeops"`, async () => {
        const CMD = `frodo config-manager push raw -p test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -D ${forgeopsDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    //Cloud
    test(`"frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -D ${cloudDirectory}: should import raw configuration into cloud"`, async () => {
        const CMD = `frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -D ${cloudDirectory} `;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -p test/e2e/exports/fr-config-manager/cloud/raw/environment -D ${cloudDirectory}: should import raw configuration into cloud"`, async () => {
        const CMD = `frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -p test/e2e/exports/fr-config-manager/cloud/raw/environment  -D ${cloudDirectory}`;
        await testSuccess(CMD, cloudEnv);
    });
});