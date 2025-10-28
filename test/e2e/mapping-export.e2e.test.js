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
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --mapping-id sync/managedAlpha_user_managedBravo_user
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -i mapping/managedBravo_group_managedBravo_group -f my-frodo-test-mapping.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -Ni mapping/managedBravo_group_managedBravo_group --no-deps --use-string-arrays -D mappingExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -a --file my-allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --no-deps --use-string-arrays -c GoogleApps -t alpha_user -NaD mappingExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -AD mappingExportTestDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --no-deps --use-string-arrays --connector-id GoogleApps --managed-object-type alpha_user --all-separate --no-metadata --directory mappingExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -AxD mappingExportTestDir7

// IDM
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo mapping export -AD mappingExportTestDir8 -m idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo mapping export -aD mappingExportTestDir9 -m idm
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c , idm_connection as ic} from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const idmEnv = getEnv(ic)

const syncType = 'sync';
const mappingType = 'mapping';

describe('frodo mapping export', () => {
    test('"frodo mapping export --mapping-id sync/managedAlpha_user_managedBravo_user": should export the mapping with mapping id "sync/managedAlpha_user_managedBravo_user"', async () => {
        const exportFile = "managedAlpha_user_managedBravo_user.sync.json";
        const CMD = `frodo mapping export --mapping-id sync/managedAlpha_user_managedBravo_user`;
        await testExport(CMD, env, syncType, exportFile);
    });

    test('"frodo mapping export -i mapping/managedBravo_group_managedBravo_group -f my-frodo-test-mapping.mapping.json": should export the mapping with mapping id "mapping/managedBravo_group_managedBravo_group" into file named my-frodo-test-mapping.mapping.json', async () => {
        const exportFile = "my-frodo-test-mapping.mapping.json";
        const CMD = `frodo mapping export -i mapping/managedBravo_group_managedBravo_group -f ${exportFile}`;
        await testExport(CMD, env, mappingType, exportFile);
    });

    test('"frodo mapping export -Ni mapping/managedBravo_group_managedBravo_group --no-deps --use-string-arrays -D mappingExportTestDir1": should export the mapping with mapping id "mapping/managedBravo_group_managedBravo_group" into the directory named mappingExportTestDir1', async () => {
        const exportDirectory = "mappingExportTestDir1";
        const CMD = `frodo mapping export -Ni mapping/managedBravo_group_managedBravo_group --no-deps --use-string-arrays -D ${exportDirectory}`;
        await testExport(CMD, env, mappingType, undefined, exportDirectory, false);
    });

    test('"frodo mapping export --all": should export all mappings to a single file', async () => {
        const exportFile = "allMappings.mapping.json";
        const CMD = `frodo mapping export --all`;
        await testExport(CMD, env, mappingType, exportFile);
    });

    test('"frodo mapping export -a --file my-allMappings.mapping.json": should export all mappings to a single file named my-allMappings.mapping.json', async () => {
        const exportFile = "my-allMappings.mapping.json";
        const CMD = `frodo mapping export -a --file ${exportFile}`;
        await testExport(CMD, env, mappingType, exportFile);
    });

    test('"frodo mapping export --no-deps --use-string-arrays -c GoogleApps -t alpha_user -NaD mappingExportTestDir2": should export all mappings to a single file in the directory mappingExportTestDir2', async () => {
        const exportDirectory = "mappingExportTestDir2";
        const CMD = `frodo mapping export --no-deps --use-string-arrays -c GoogleApps -t alpha_user -NaD ${exportDirectory}`;
        await testExport(CMD, env, mappingType, undefined, exportDirectory, false);
    });

    test('"frodo mapping export -AD mappingExportTestDir4": should export all mappings to separate files in the mappingExportTestDir4 directory', async () => {
        const exportDirectory = "mappingExportTestDir4";
        const CMD = `frodo mapping export -AD ${exportDirectory}`;
        await testExport(CMD, env, undefined, undefined, exportDirectory, false);
    });

    test('"frodo mapping export --no-deps --use-string-arrays --connector-id GoogleApps --managed-object-type alpha_user --all-separate --no-metadata --directory mappingExportTestDir3": should export all mappings to separate files in the directory mappingExportTestDir3', async () => {
        const exportDirectory = "mappingExportTestDir3";
        const CMD = `frodo mapping export --no-deps --use-string-arrays --connector-id GoogleApps --managed-object-type alpha_user --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, undefined, undefined, exportDirectory, false);
    });

    test('"frodo mapping export -AxD mappingExportTestDir7": should export all mappings into separated fils with extracted scripts', async () => {
        const exportDirectory = "mappingExportTestDir7";
        const CMD = `frodo mapping export -AxD ${exportDirectory}`;
        await testExport(CMD, env, undefined, undefined, exportDirectory, false);
    });

    test('"frodo mapping export -aD mappingExportTestDir9 -m idm": should export all IDM mappings to one file in the directory mappingExportTestDir4', async () => {
        const exportDirectory = "mappingExportTestDir9";
        const CMD = `frodo mapping export -aD mappingExportTestDir9 -m idm`;
        await testExport(CMD, idmEnv, undefined, undefined, exportDirectory, false);
    });
    test('"frodo mapping export -AD mappingExportTestDir8 -m idm": should export all IDM mappings to separate files in the directory mappingExportTestDir5', async () => {        
        const exportDirectory = "mappingExportTestDir8";
        const CMD = `frodo mapping export -AD mappingExportTestDir8 -m idm`;
        await testExport(CMD, idmEnv, undefined, undefined, exportDirectory, false);
    });
});
