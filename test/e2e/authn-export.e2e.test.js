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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn export -ND authnExportDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn export -f authnExportTest.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn export --no-metadata --file authnExportTest.json --directory  authnExportDir2
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo authn export -g -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo authn export --global --no-metadata --directory authnExportDir3 --type classic
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

const type = 'authentication.settings';

describe('frodo authn export', () => {
    test('"frodo authn export -ND authnExportDir1": should export authentication settings to a single file in the "authnExportDir1" directory', async () => {
        const exportFile = "alphaRealm.authentication.settings.json";
        const exportDirectory = "authnExportDir1";
        const CMD = `frodo authn export -ND ${exportDirectory}`;
        await testExport(CMD, env, type, exportFile, exportDirectory, false);
    });

    test('"frodo authn export -f authnExportTest.json": should export authentication settings to a file named "authnExportTest.json"', async () => {
        const exportFile = "authnExportTest.json";
        const CMD = `frodo authn export -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authn export --no-metadata --file authnExportTest.json --directory  authnExportDir2": should export authentication settings to a file named "authnExportTest.json" in the "authnExportDir2" directory', async () => {
        const exportFile = "authnExportTest.json";
        const exportDirectory = "authnExportDir2";
        const CMD = `frodo authn export --no-metadata --file ${exportFile} --directory ${exportDirectory}`;
        await testExport(CMD, env, type, exportFile, exportDirectory, false);
    });

    test('"frodo authn export -g -m classic": should export global authentication settings to a file', async () => {
        const exportFile = "global.authentication.settings.json";
        const CMD = `frodo authn export -g -m classic`;
        await testExport(CMD, classicEnv, type, exportFile);
    });

    test('"frodo authn export --global --no-metadata --directory  authnExportDir3 --type classic": should export global authentication settings to a file in the "authnExportDir3" directory', async () => {
        const exportFile = "global.authentication.settings.json";
        const exportDirectory = "authnExportDir3";
        const CMD = `frodo authn export --global --no-metadata --directory ${exportDirectory} --type classic`;
        await testExport(CMD, classicEnv, type, exportFile, exportDirectory, false);
    });
});
