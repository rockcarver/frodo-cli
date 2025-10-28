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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -i 01 -f serverExportTestFile1.json -xNdD serverExportTestDir1 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --server-id 01 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -u 8081 --file serverExportTestFile2.json --default --no-metadata -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --server-url http://localhost:8081/am --extract --directory serverExportTestDir2 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -axNdf serverExportTestFile3.json -D serverExportTestDir3 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --all -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export -AxNdD serverExportTestDir4 -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server export --all-separate --directory serverExportTestDir5 -m classic
 */
import { getEnv, testExport } from './utils/TestUtils';
import { classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const classicEnv = getEnv(cc);

const type = 'server';

describe('frodo server export', () => {
    test('"frodo server export -i 01 -f serverExportTestFile1.json -xNdD serverExportTestDir1 -m classic": should export the server with server id "01" along with extracted properties and default properties.', async () => {
        const exportDirectory = "serverExportTestDir1";
        const CMD = `frodo server export -i 01 -f serverExportTestFile1.json -xNdD ${exportDirectory} -m classic`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });

    test('"frodo server export --server-id 01 -m classic": should export the server with server id "01".', async () => {
        const exportfile = "01.server.json";
        const CMD = `frodo server export --server-id 01 -m classic`;
        await testExport(CMD, classicEnv, type, exportfile);
    });

    test('"frodo server export -u 8081 --file serverExportTestFile2.json --default --no-metadata -m classic": should export the server with url containing "8081" along with default properties.', async () => {
        const exportfile = "serverExportTestFile2.json";
        const CMD = `frodo server export -u 8081 --file ${exportfile} --default --no-metadata -m classic`;
        await testExport(CMD, classicEnv, type, exportfile, undefined, false);
    });

    test('"frodo server export --server-url http://localhost:8081/am --extract --directory serverExportTestDir2 -m classic": should export the server with url "http://localhost:8081/am" along with extracted properties.', async () => {
        const exportDirectory = "serverExportTestDir2";
        const CMD = `frodo server export --server-url http://localhost:8081/am --extract --directory ${exportDirectory} -m classic`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });

    test('"frodo server export -axNdf serverExportTestFile3.json -D serverExportTestDir3 -m classic": should export all servers to a single file in the directory serverExportTestDir3 along with extracted and default properties.', async () => {
        const exportDirectory = "serverExportTestDir3";
        const CMD = `frodo server export -axNdf serverExportTestFile3.json -D ${exportDirectory} -m classic`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });

    test('"frodo server export --all -m classic": should export all servers to a single file', async () => {
        const exportFile = "allServers.server.json";
        const CMD = `frodo server export --all -m classic`;
        await testExport(CMD, classicEnv, type, exportFile);
    });

    test('"frodo server export -AxNdD serverExportTestDir4 -m classic": should export all servers to separate files along with extracted and default properties', async () => {
        const exportDirectory = "serverExportTestDir4";
        const CMD = `frodo server export -AxNdD ${exportDirectory} -m classic`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });

    test('"frodo server export --all-separate --directory serverExportTestDir5 -m classic": should export all servers to separate files in the directory serverExportTestDir5', async () => {
        const exportDirectory = "serverExportTestDir5";
        const CMD = `frodo server export --all-separate --directory ${exportDirectory} -m classic`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });
});
