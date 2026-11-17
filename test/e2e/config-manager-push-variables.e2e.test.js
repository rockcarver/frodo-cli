/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push variables -F -E ESV_FR_VAR_TEST_2="20" -E ESV_FR_VAR_TEST='this is a test' -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push variables --env-file test/e2e/env/configManager2.env --env-file test/e2e/env/configManager1.env -D test/e2e/exports/fr-config-manager/cloud 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push variables --force-update -n esv-fr-var-test-2 --env ESV_FR_VAR_TEST_2=20 -D test/e2e/exports/fr-config-manager/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push variables --name esv-fr-var-test --env ESV_FR_VAR_TEST="test2" --env-file test/e2e/env/configManager1.env -D test/e2e/exports/fr-config-manager/cloud
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/cloud";
const envDir1 = "test/e2e/env/configManager1.env"
const envDir2 = "test/e2e/env/configManager2.env"

// FRODO_TEST_NAME pins the recording's identity (the last segment of its path): the id stays when flags are renamed.
describe('Should import variables into cloud', () => {
    test(`"frodo config-manager push variables -F -E ESV_FR_VAR_TEST_2="20" -E ESV_FR_VAR_TEST='this is a test' -D ${allDirectory} ": should import two variables into cloud"`, async () => {
        const CMD = `frodo config-manager push variables -F -E ESV_FR_VAR_TEST_2="20" -E ESV_FR_VAR_TEST='this is a test' -D ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_F_E_E_D' } });
    });
    test(`"frodo config-manager push variables --env-file ${envDir2} --env-file ${envDir1}  -D ${allDirectory} ": should not import two variables into cloud when no changes"`, async () => {
        const CMD = `frodo config-manager push variables --env-file ${envDir2} --env-file ${envDir1}  -D ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_env-file_env-file_D' } });
    });
    test(`"frodo config-manager push variables --force-update -n esv-fr-var-test-2 --env ESV_FR_VAR_TEST_2=20 -D ${allDirectory} ": should import the specified variable into cloud"`, async () => {
        const CMD = `frodo config-manager push variables --force-update -n esv-fr-var-test-2 --env ESV_FR_VAR_TEST_2=20 -D ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_force-update_n_env_D' } });
    });
    test(`"frodo config-manager push variables --name esv-fr-var-test --env ESV_FR_VAR_TEST="test2" --env-file ${envDir1} -D ${allDirectory} ": should not import the specified variable into cloud when no changes"`, async () => {
        const CMD = `frodo config-manager push variables --name esv-fr-var-test --env ESV_FR_VAR_TEST="test2" --env-file ${envDir1}  -D ${allDirectory} `;
        await testSuccess(CMD, { ...cloudEnv, env: { ...cloudEnv.env, FRODO_TEST_NAME: '0_name_env_env-file_D' } });
    });
});