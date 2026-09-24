/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push secrets --env-file test/e2e/env/configManager1.env  -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push secrets -n esv-fr-test-secret -E ESV_FR_TEST_SECRET="test1" -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push secrets -n esv-test-secret --env-file test/e2e/env/configManager1.env -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push secrets -p -n esv-prune-secrets -E ESV_PRUNE_SECRETS=test3 -D test/e2e/exports/fr-config-manager/cloud 

*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';



process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/cloud";
const envDir = "test/e2e/env/configManager1.env"

describe('frodo config-manager push secrets', () => {
    test(`"frodo config-manager push secrets --env-file ${envDir} -D ${allDirectory} ": should import the secrets into cloud"`, async () => {
        const CMD = `frodo config-manager push secrets --env-file ${envDir} -D ${allDirectory} `;
        await testSuccess(CMD, cloudEnv)
    });
    test(`"frodo config-manager push secrets -n esv-fr-test-secret -E ESV_FR_TEST_SECRET="test1" ${allDirectory}": should import the specified secret into cloud`, async () => {
        const CMD = `frodo config-manager push secrets -n esv-fr-test-secret -E ESV_FR_TEST_SECRET="test1"  -D ${allDirectory}`;
        await testSuccess(CMD, cloudEnv)
    });
    test(`"frodo config-manager push secrets -n esv-test-secret --env-file ${envDir} -D ${allDirectory}": should import multiple versions of the specified secret into cloud`, async () => {
        const CMD = `frodo config-manager push secrets -n esv-test-secret --env-file ${envDir} -D ${allDirectory}`;
        await testSuccess(CMD, cloudEnv);
    });
    test(`"frodo config-manager push secrets -p -n esv-prune-secrets -E ESV_PRUNE_SECRETS=test3  -D ${allDirectory}": should import multiple specified secrets into cloud`, async () => {
        const CMD = `frodo config-manager push secrets -p -n esv-prune-secrets -E ESV_PRUNE_SECRETS=test3  -D ${allDirectory}`;
        await testSuccess(CMD, cloudEnv)
    });
});