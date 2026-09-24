/** See test/e2e/README.md for how to write and record e2e tests. */

/*
Create mappings without recording

FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -i sync/managedAlpha_application_managedBravo_application -f test/e2e/exports/all/allMappings.mapping.json
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --no-deps --mapping-id mapping/managedBravo_group_managedBravo_group --file allMappings.mapping.json -D test/e2e/exports/all
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -f test/e2e/exports/all/allMappings.mapping.json
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --no-deps --file allMappings.mapping.json --directory test/e2e/exports/all
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -af test/e2e/exports/all/allMappings.mapping.json
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --all --no-deps --file allMappings.mapping.json --directory test/e2e/exports/all
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -AD test/e2e/exports/all-separate/cloud/global/idm
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/global/idm
*/

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --mapping-id sync/managedAlpha_user_managedBravo_user
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -xi mapping/managedBravo_group_managedBravo_group -f my-frodo-test-mapping.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -Ni mapping/managedBravo_group_managedBravo_group --no-deps --use-string-arrays -D mappingExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -a --file my-allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --no-deps --use-string-arrays -c GoogleApps -t alpha_user -NaD mappingExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export -AD mappingExportTestDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping export --no-deps --use-string-arrays --connector-id GoogleApps --managed-object-type alpha_user --all-separate --no-metadata --directory mappingExportTestDir3

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo mapping export -AD mappingExportTestDir5 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo mapping export -i sync/UserToUserGroovySync -D mappingExportTestDir6 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo mapping export --mapping-id mapping/UserToUserJavascript -D mappingExportTestDir7 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo mapping export -xi sync/UserToUserGroovySync -D mappingExportTestDir8 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo mapping export --no-extract --mapping-id mapping/UserToUserJavascript -D mappingExportTestDir9 -m forgeops
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

const syncType = 'sync';
const mappingType = 'mapping';

describe('frodo mapping export', () => {

    // Cloud tests
    describe('Cloud', () => {
        test('"frodo mapping export --mapping-id sync/managedAlpha_user_managedBravo_user": should export the mapping with mapping id "sync/managedAlpha_user_managedBravo_user"', async () => {
            const exportDirectory = "managedAlpha_user_managedBravo_user";
            const CMD = `frodo mapping export --mapping-id sync/managedAlpha_user_managedBravo_user`;
            await testExport(CMD, env, syncType, undefined, exportDirectory);
        });

        test('"frodo mapping export -xi mapping/managedBravo_group_managedBravo_group -f my-frodo-test-mapping.mapping.json": should export the mapping with mapping id "mapping/managedBravo_group_managedBravo_group" into file named my-frodo-test-mapping.mapping.json', async () => {
            const exportFile = "my-frodo-test-mapping.mapping.json";
            const CMD = `frodo mapping export -xi mapping/managedBravo_group_managedBravo_group -f ${exportFile}`;
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
    });

    // ForgeOps Tests
    describe('ForgeOps', () => {
        test('"frodo mapping export -AD mappingExportTestDir5 -m forgeops": should export mapping objects into separate files', async () => {
            const dirName = 'mappingExportTestDir5';
            const CMD = `frodo mapping export -AD ${dirName} -m forgeops`;
            await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
        });

        test('"frodo mapping export -i sync/UserToUserGroovySync -D mappingExportTestDir6 -m forgeops": should export sync/UserToUserGroovySync object with extracted idm scripts', async () => {
            const dirName = 'mappingExportTestDir6';
            const CMD = `frodo mapping export -i sync/UserToUserGroovySync -D ${dirName} -m forgeops`;
            await testExport(CMD, forgeopsEnv, syncType, undefined, dirName, false);
        });

        test('"frodo mapping export --mapping-id mapping/UserToUserJavascript -D mappingExportTestDir7 -m forgeops": should export mapping/UserToUserJavascript object with extracted idm scripts', async () => {
            const dirName = 'mappingExportTestDir7';
            const CMD = `frodo mapping export --mapping-id mapping/UserToUserJavascript -D ${dirName} -m forgeops`;
            await testExport(CMD, forgeopsEnv, mappingType, undefined, dirName, false);
        });

        test('"frodo mapping export -xi sync/UserToUserGroovySync -D mappingExportTestDir8 -m forgeops": should export sync/UserToUserGroovySync object with extracted idm scripts', async () => {
            const dirName = 'mappingExportTestDir8';
            const CMD = `frodo mapping export -xi sync/UserToUserGroovySync -D ${dirName} -m forgeops`;
            await testExport(CMD, forgeopsEnv, syncType, "UserToUserGroovySync.sync.json", dirName, false);
        });

        test('"frodo mapping export --no-extract --mapping-id mapping/UserToUserJavascript -D mappingExportTestDir9 -m forgeops": should export mapping/UserToUserJavascript object with extracted idm scripts', async () => {
            const dirName = 'mappingExportTestDir9';
            const CMD = `frodo mapping export --no-extract --mapping-id mapping/UserToUserJavascript -D ${dirName} -m forgeops`;
            await testExport(CMD, forgeopsEnv, mappingType, "UserToUserJavascript.mapping.json", dirName, false);
        });
    });
});
