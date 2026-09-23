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