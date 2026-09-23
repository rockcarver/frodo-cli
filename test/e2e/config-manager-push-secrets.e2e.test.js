/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

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