/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f roleExportTestFile1.json -N
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -n test-internal-role
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --role-name test-internal-role --file roleExportTestFile2.json --no-metadata
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -aNf roleExportTestFile3.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export -AND roleExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role export --all-separate --directory roleExportTestDir2
 */
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

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
});
