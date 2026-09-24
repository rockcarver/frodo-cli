/** See test/e2e/README.md for how to write and record e2e tests. */

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

process.env['FRODO_MOCK'] ||= '1';
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
