/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -i 01 -f serverExportTestFile1.json -xNdD serverExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --server-id 01 --directory serverExportTestDir6
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -u 8081 --file serverExportTestFile2.json --default --no-metadata --directory serverExportTestDir7
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --server-url http://localhost:8081/am --no-extract --directory serverExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -axNdf serverExportTestFile3.json -D serverExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -AxNdD serverExportTestDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --all-separate --directory serverExportTestDir5
 */
import { getEnv, testExport } from './utils/TestUtils';
import { classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const classicEnv = getEnv(cc);

const type = 'server';

describe.skip('frodo server export', () => {
    test('"frodo server export -i 01 -f serverExportTestFile1.json -xNdD serverExportTestDir1": should export the server with server id "01" along with default properties.', async () => {
        const exportFile = "serverExportTestFile1.json"
        const exportDirectory = "serverExportTestDir1";
        const CMD = `frodo server export -i 01 -f ${exportFile} -xNdD ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, exportFile, exportDirectory, false);
    });

    test('"frodo server export --server-id 01 --directory serverExportTestDir6": should export the server with server id "01".', async () => {
        const exportfile = "01.server.json";
        const exportDirectory = "serverExportTestDir6"
        const CMD = `frodo server export --server-id 01 --directory ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, exportfile, exportDirectory);
    });

    test('"frodo server export -u 8081 --file serverExportTestFile2.json --default --no-metadata": should export the server with url containing "8081" along with default properties.', async () => {
        const exportfile = "serverExportTestFile2.json";
        const exportDirectory = "serverExportTestDir7"
        const CMD = `frodo server export -u 8081 --file ${exportfile} --default --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, exportfile, exportDirectory, false);
    });

    test('"frodo server export --server-url http://localhost:8081/am --no-extract --directory serverExportTestDir2": should export the server with url "http://localhost:8081/am".', async () => {
        const exportFile = "03.server.json"
        const exportDirectory = "serverExportTestDir2";
        const CMD = `frodo server export --server-url http://localhost:8081/am --no-extract --directory ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, exportFile, exportDirectory, false);
    });

    test('"frodo server export -axNdf serverExportTestFile3.json -D serverExportTestDir3": should export all servers to a single file in the directory serverExportTestDir3 along with default properties.', async () => {
        const exportFile = "serverExportTestFile3.json"
        const exportDirectory = "serverExportTestDir3";
        const CMD = `frodo server export -axNdf ${exportFile} -D ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, exportFile, exportDirectory, false);
    });

    test('"frodo server export --all": should export all servers to a single file', async () => {
        const exportFile = "allServers.server.json";
        const CMD = `frodo server export --all`;
        await testExport(CMD, classicEnv, type, exportFile);
    });

    test('"frodo server export -AxNdD serverExportTestDir4": should export all servers to separate files along with default properties', async () => {
        const exportDirectory = "serverExportTestDir4";
        const CMD = `frodo server export -AxNdD ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });

    test('"frodo server export --all-separate --directory serverExportTestDir5": should export all servers to separate files in the directory serverExportTestDir5', async () => {
        const exportDirectory = "serverExportTestDir5";
        const CMD = `frodo server export --all-separate --directory ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });
});
