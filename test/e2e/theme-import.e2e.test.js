/** See test/e2e/README.md for how to write and record e2e tests. */

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
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaThemesFileName = "allAlphaThemes.theme.json";
const allAlphaThemesExport = `${allDirectory}/${allAlphaThemesFileName}`;
const allSeparateThemesDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/theme`;

describe('frodo theme import', () => {
    test(`"frodo theme import -n \'Starter Theme\' -f ${allAlphaThemesExport}": should import the theme with the name "Starter Theme" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -n 'Starter Theme' -f ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import --theme-name \'Starter Theme\' --file ${allAlphaThemesExport}": should import the theme with the name "Starter Theme" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --theme-name 'Starter Theme' --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -n \'Starter Theme\' -f ${allAlphaThemesFileName} -D ${allDirectory}": should import the theme with the name "Starter Theme" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -n 'Starter Theme' -f ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesExport}": should import the theme with the id "86ce2f64-586d-44fe-8593-b12a85aac68d" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d --file ${allAlphaThemesExport}": should import the theme with the id "86ce2f64-586d-44fe-8593-b12a85aac68d" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --theme-id 86ce2f64-586d-44fe-8593-b12a85aac68d --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesFileName} -D ${allDirectory}": should import the theme with the id "86ce2f64-586d-44fe-8593-b12a85aac68d" from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -i 86ce2f64-586d-44fe-8593-b12a85aac68d -f ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -f ${allAlphaThemesExport}": should import the first theme from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -f ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import --file ${allAlphaThemesExport}": should import the first theme from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -f ${allAlphaThemesFileName} -D ${allDirectory}": should import the first theme from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -f ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -af ${allAlphaThemesExport}": should import all themes from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -af ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import --all --file ${allAlphaThemesExport}": should import all themes from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import --all --file ${allAlphaThemesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -af ${allAlphaThemesFileName} -D ${allDirectory}": should import all themes from the file "${allAlphaThemesExport}"`, async () => {
        const CMD = `frodo theme import -af ${allAlphaThemesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import -AD ${allSeparateThemesDirectory}": should import all themes from the '${allSeparateThemesDirectory}' directory"`, async () => {
        const CMD = `frodo theme import -AD ${allSeparateThemesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo theme import --all-separate --directory ${allSeparateThemesDirectory}": should import all themes from the '${allSeparateThemesDirectory}' directory"`, async () => {
        const CMD = `frodo theme import --all-separate --directory ${allSeparateThemesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
