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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export --realm-id L2FscGhh
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export -i L2FscGhh -f my-frodo-L2FscGhh.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export --realm-name alpha --no-metadata
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export -Nn alpha -D realmExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export -a --file my-allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export -NaD realmExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm export --all-separate --no-metadata --directory realmExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'realm';

describe('frodo realm export', () => {
    test('"frodo realm export --realm-id L2FscGhh": should export the realm with realm id "L2FscGhh"', async () => {
        const exportFile = "L2FscGhh.realm.json";
        const CMD = `frodo realm export --realm-id L2FscGhh`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo realm export -i L2FscGhh -f my-frodo-L2FscGhh.realm.json": should export the realm with realm id "L2FscGhh" into file named my-frodo-L2FscGhh.realm.json', async () => {
        const exportFile = "my-frodo-L2FscGhh.realm.json";
        const CMD = `frodo realm export -i L2FscGhh -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo realm export --realm-name alpha --no-metadata": should export the realm with realm name "alpha"', async () => {
        const exportFile = "alpha.realm.json";
        const CMD = `frodo realm export --realm-name alpha --no-metadata`;
        await testExport(CMD, env, type, exportFile, undefined, false);
    });

    test('"frodo realm export -Nn alpha -D realmExportTestDir1": should export the realm with realm name "alpha" into the directory named realmExportTestDir1', async () => {
        const exportDirectory = "realmExportTestDir1";
        const CMD = `frodo realm export -Nn alpha -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo realm export --all": should export all realms to a single file', async () => {
        const exportFile = "allRealms.realm.json";
        const CMD = `frodo realm export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo realm export -a --file my-allRealms.realm.json": should export all realms to a single file named my-allRealms.realm.json', async () => {
        const exportFile = "my-allRealms.realm.json";
        const CMD = `frodo realm export -a --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo realm export -NaD realmExportTestDir2": should export all realms to a single file in the directory realmExportTestDir2', async () => {
        const exportDirectory = "realmExportTestDir2";
        const CMD = `frodo realm export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo realm export -A": should export all realms to separate files', async () => {
        const CMD = `frodo realm export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo realm export --all-separate --no-metadata --directory realmExportTestDir3": should export all realms to separate files in the directory realmExportTestDir3', async () => {
        const exportDirectory = "realmExportTestDir3";
        const CMD = `frodo realm export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
