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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore export -Ni ESV -t GoogleSecretManagerSecretStoreProvider -f myFrodoExport.secretstore.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore export -Na
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore export -NAD secretStoreExportTestDir1

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export --global --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export -g --all -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export -gam classic --no-metadata --file myFrodoExport2.secretstore.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export -gm classic --all-separate --directory secretStoreExportTestDir2
*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

const type = 'secretstore';

describe('frodo secretstore export', () => {
    test('"frodo secretstore export -Ni ESV -t GoogleSecretManagerSecretStoreProvider -f myFrodoExport.secretstore.json": should export the ESV secret store', async () => {
        const exportFile = 'myFrodoExport.secretstore.json';
        const CMD = `frodo secretstore export -Ni ESV -t GoogleSecretManagerSecretStoreProvider -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile, undefined, false);
    });
    test('"frodo secretstore export -Na": should export all secretstores in realm to file', async () => {
        const exportFile = 'allAlphaSecretStores.secretstore.json';
        const CMD = `frodo secretstore export -Na`;
        await testExport(CMD, env, type, exportFile, undefined, false);
    });
    test('"frodo secretstore export -NAD secretStoreExportTestDir1": should export all seceretstores in realm to separate files', async () => {
        const exportDirectory = 'secretStoreExportTestDir1';
        const CMD = `frodo secretstore export -NAD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
    test('"frodo secretstore export --global --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore --type classic": should export the global EnvironmentAndSystemPropertySecretStore secret store', async () => {
        const exportFile = 'EnvironmentAndSystemPropertySecretStore.secretstore.json';
        const CMD = `frodo secretstore export --global --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore --type classic`;
        await testExport(CMD, classicEnv, type, exportFile);
    });
    test('"frodo secretstore export -g --all -m classic": should export all global secretstores to file', async () => {
        const exportFile = 'allGlobalSecretStores.secretstore.json';
        const CMD = `frodo secretstore export -g --all -m classic`;
        await testExport(CMD, classicEnv, type, exportFile);
    });
    test('"frodo secretstore export -gam classic --no-metadata --file myFrodoExport2.secretstore.json": should export all global secretstores to specific file with no metadata', async () => {
        const exportFile = 'myFrodoExport2.secretstore.json';
        const CMD = `frodo secretstore export -gam classic --no-metadata --file ${exportFile}`;
        await testExport(CMD, classicEnv, type, exportFile, undefined, false);
    });
    test('"frodo secretstore export -gm classic --all-separate --directory secretStoreExportTestDir2": should export all global seceretstores to separate files', async () => {
        const exportDirectory = 'secretStoreExportTestDir2';
        const CMD = `frodo secretstore export -gm classic --all-separate --directory ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory);
    });
});
