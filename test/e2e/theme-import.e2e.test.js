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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -n 'Starter Theme' -f test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import --theme-name 'Starter Theme' --file test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -n 'Starter Theme' -f allAlphaThemes.theme.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d --file test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f allAlphaThemes.theme.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -f test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import --file test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -f allAlphaThemes.theme.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -af test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import --all --file test/e2e/exports/all/allAlphaThemes.theme.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -af allAlphaThemes.theme.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/theme
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo theme import --all-separate --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/theme
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaThemesFileName = "allAlphaThemes.theme.json";
const allAlphaThemesExport = `${allDirectory}/${allAlphaThemesFileName}`;
const allSeparateThemesDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/theme`;

describe('frodo theme import', () => {
    test(`"frodo theme import -n \'Starter Theme\' -f ${allAlphaThemesExport}": should import the theme with the name "Starter Theme" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -n 'Starter Theme' -f ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import --theme-name \'Starter Theme\' --file ${allAlphaThemesExport}": should import the theme with the name "Starter Theme" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --theme-name 'Starter Theme' --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -n \'Starter Theme\' -f ${allAlphaThemesFileName} -D ${allDirectory}": should import the theme with the name "Starter Theme" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -n 'Starter Theme' -f ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesExport}": should import the theme with the id "86ce2f64-586d-44fe-8593-b12a85aac68d" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d --file ${allAlphaThemesExport}": should import the theme with the id "86ce2f64-586d-44fe-8593-b12a85aac68d" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesFileName} -D ${allDirectory}": should import the theme with the id "86ce2f64-586d-44fe-8593-b12a85aac68d" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -f ${allAlphaThemesExport}": should import the first theme from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -f ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import --file ${allAlphaThemesExport}": should import the first theme from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -f ${allAlphaThemesFileName} -D ${allDirectory}": should import the first theme from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -f ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -af ${allAlphaThemesExport}": should import all themes from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -af ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import --all --file ${allAlphaThemesExport}": should import all themes from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --all --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -af ${allAlphaThemesFileName} -D ${allDirectory}": should import all themes from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -af ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import -AD ${allSeparateThemesDirectory}": should import all themes from the '${allSeparateThemesDirectory}' directory"`, async () => {
        const CMD = `frodo theme import -AD ${allSeparateThemesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo theme import --all-separate --directory ${allSeparateThemesDirectory}": should import all themes from the '${allSeparateThemesDirectory}' directory"`, async () => {
        const CMD = `frodo theme import --all-separate --directory ${allSeparateThemesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
