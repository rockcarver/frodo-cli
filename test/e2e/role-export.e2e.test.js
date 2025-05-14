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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f roleExportTestFile1.json -N
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -n test-internal-role
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --role-name test-internal-role --file roleExportTestFile2.json --no-metadata
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -aNf roleExportTestFile3.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -AND roleExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --all-separate --directory roleExportTestDir2

//idm 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo role export -AD testDir4 -m idm   
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo role export -aD testDir5 -m idm
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, idm_connection as ic} from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const idmenv =getEnv(ic)
const type = 'internalRole';

describe('frodo role export', () => {
    test('"frodo role export -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f roleExportTestFile1.json -N": should export the role with role id "ccb11ba1-333b-4197-95db-89bb08a2ab56"', async () => {
        const exportfile = "roleExportTestFile1.json";
        const CMD = `frodo role export -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f ${exportfile} -N`;
        await testExport(CMD, env, type, exportfile, undefined, false);
    });

    test('"frodo role export --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56": should export the role with role id "ccb11ba1-333b-4197-95db-89bb08a2ab56".', async () => {
        const exportfile = "ccb11ba1-333b-4197-95db-89bb08a2ab56.internalRole.json";
        const CMD = `frodo role export --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56`;
        await testExport(CMD, env, type, exportfile);
    });

    test('"frodo role export -n test-internal-role": should export the role with name "test-internal-role".', async () => {
        const exportfile = "test-internal-role.internalRole.json";
        const CMD = `frodo role export -n test-internal-role`;
        await testExport(CMD, env, type, exportfile);
    });

    test('"frodo role export --role-name test-internal-role --file roleExportTestFile2.json --no-metadata": should export the role with name "test-internal-role".', async () => {
        const exportfile = "roleExportTestFile2.json";
        const CMD = `frodo role export --role-name test-internal-role --file ${exportfile} --no-metadata`;
        await testExport(CMD, env, type, exportfile, undefined, false);
    });

    test('"frodo role export -aNf roleExportTestFile3.json": should export all roles to a single file.', async () => {
        const exportFile = "roleExportTestFile3.json";
        const CMD = `frodo role export -aNf ${exportFile}`;
        await testExport(CMD, env, type, exportFile, undefined, false);
    });

    test('"frodo role export --all": should export all roles to a single file.', async () => {
        const exportFile = "allInternalRoles.internalRole.json";
        const CMD = `frodo role export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo role export -AND roleExportTestDir1": should export all roles to separate files', async () => {
        const exportDirectory = "roleExportTestDir1";
        const CMD = `frodo role export -AND ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo role export --all-separate --directory roleExportTestDir2": should export all roles to separate files', async () => {
        const exportDirectory = "roleExportTestDir2";
        const CMD = `frodo role export --all-separate --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
    test('"frodo role export -AD roleExportTestDir3 -m idm": should export all idm roles to separate files', async () => {
        const exportDirectory = "roleExportTestDir3";
        const CMD = `frodo role export -AD roleExportTestDir3 -m idm`;
        await testExport(CMD, idmenv, type, undefined, exportDirectory, false);
    });

    test('"frodo role export -aD roleExportTestDir4 -m idm ": should export all idm roles to one file', async () => {
        const exportDirectory = "roleExportTestDir4";
        const CMD = `frodo role export -aD roleExportTestDir4 -m idm`;
        await testExport(CMD, idmenv, type, undefined, exportDirectory, false);
    });
    
});
