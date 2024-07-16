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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export --theme-name 'Starter Theme'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export -n 'Starter Theme' -f my-Starter-Theme.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export -Nn 'Starter Theme' -D themeExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f my-86ce2f64-586d-44fe-8593-b12a85aac68d.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export -Ni 86ce2f64-586d-44fe-8593-b12a85aac68d -D themeExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export -a --file test.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export -NaD themeExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme export --all-separate --no-metadata --directory themeExportTestDir4
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'theme';

describe('frodo theme export', () => {
    test('"frodo theme export --theme-name \'Starter Theme\'": should export the theme named "Starter Theme"', async () => {
        const exportFile = "Starter-Theme.theme.json";
        const CMD = `frodo theme export --theme-name 'Starter Theme'`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo theme export -n \'Starter Theme\' -f my-Starter-Theme.theme.json": should export the theme named "Starter Theme" into file named my-Starter-Theme.theme.json', async () => {
        const exportFile = "my-tarter-Theme.theme.json";
        const CMD = `frodo theme export -n 'Starter Theme' -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo theme export -Nn \'Starter Theme\' -D themeExportTestDir1": should export the theme named "Starter Theme" into a file in the directory themeExportTestDir1', async () => {
        const exportDirectory = "themeExportTestDir1";
        const CMD = `frodo theme export -Nn \'Starter Theme\' -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo theme export --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d": should export the theme with id "86ce2f64-586d-44fe-8593-b12a85aac68d"', async () => {
        const exportFile = "86ce2f64-586d-44fe-8593-b12a85aac68d.theme.json";
        const CMD = `frodo theme export --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo theme export -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f my-86ce2f64-586d-44fe-8593-b12a85aac68d.theme.json": should export the theme with id "86ce2f64-586d-44fe-8593-b12a85aac68d" into file named my-86ce2f64-586d-44fe-8593-b12a85aac68d.theme.json', async () => {
        const exportFile = "my-86ce2f64-586d-44fe-8593-b12a85aac68d.theme.json";
        const CMD = `frodo theme export -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo theme export -Ni 86ce2f64-586d-44fe-8593-b12a85aac68d -D themeExportTestDir2": should export the theme with id "86ce2f64-586d-44fe-8593-b12a85aac68d" into a file in the directory themeExportTestDir2', async () => {
        const exportDirectory = "themeExportTestDir2";
        const CMD = `frodo theme export -Ni 86ce2f64-586d-44fe-8593-b12a85aac68d -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo theme export --all": should export all themes to a single file', async () => {
        const exportFile = "allAlphaThemes.theme.json";
        const CMD = `frodo theme export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo theme export -a --file my-allAlphaThemes.theme.json": should export all themes to a single file named my-allAlphaThemes.theme.json', async () => {
        const exportFile = "my-allAlphaThemes.theme.json";
        const CMD = `frodo theme export -a --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo theme export -NaD themeExportTestDir3": should export all themes to a single file in the directory themeExportTestDir3', async () => {
        const exportDirectory = "themeExportTestDir3";
        const CMD = `frodo theme export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo theme export -A": should export all themes to separate files', async () => {
        const CMD = `frodo theme export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo theme export --all-separate --no-metadata --directory themeExportTestDir4": should export all themes to separate files in the directory themeExportTestDir4', async () => {
        const exportDirectory = "themeExportTestDir4";
        const CMD = `frodo theme export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
