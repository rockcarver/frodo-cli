/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -i FrodoTest
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export --verbose -i FrodoTest
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -i j01 -f my-j01.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export --journey-id j02 --no-metadata --no-deps --no-coords --use-string-arrays -D journeyTestDirectory1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export --all --file my-allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -Na --no-deps --no-coords --use-string-arrays --directory journeyTestDirectory2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export --all-separate --no-deps --no-coords --use-string-arrays
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -NAD journeyTestDirectory3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'journey';

describe('frodo journey export', () => {
    test('"frodo journey export -i FrodoTest": should export the journey with journey id "FrodoTest"', async () => {
        const exportFile = "FrodoTest.journey.json";
        const CMD = `frodo journey export -i FrodoTest`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo journey export --verbose -i FrodoTest": should export the journey with journey id "FrodoTest"', async () => {
        const exportFile = "FrodoTest.journey.json";
        const CMD = `frodo journey export --verbose -i FrodoTest`;
        await testExport(CMD, env, type, exportFile, './', true, true);
    });

    test('"frodo journey export -i j01 -f my-j01.json": should export the journey with journey id "j01" into file named my-j01.json', async () => {
        const exportFile = "my-j01.json";
        const CMD = `frodo journey export -i j01 -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo journey export --journey-id j02 --no-metadata --no-deps --no-coords --use-string-arrays -D journeyTestDirectory1": should export the journey with journey id "j02" to the folder named "journeyTestDirectory1", and the export should not contain dependencies or coordinates, and should use string arrays.', async () => {
        const exportFile = "j02.journey.json";
        const exportDirectory = "journeyTestDirectory1";
        const CMD = `frodo journey export --journey-id j02 --no-metadata --no-deps --no-coords --use-string-arrays -D ${exportDirectory}`;
        await testExport(CMD, env, type, exportFile, exportDirectory, false);
    });

    test('"frodo journey export -a": should export all journeys to a single file', async () => {
        const exportFile = "allAlphaJourneys.journey.json";
        const CMD = `frodo journey export -a`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo journey export --all --file my-allAlphaJourneys.journey.json": should export all journeys to a single file named my-allAlphaJourneys.journey.json', async () => {
        const exportFile = "my-allAlphaJourneys.journey.json";
        const CMD = `frodo journey export --all --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo journey export -Na --no-deps --no-coords --use-string-arrays --directory journeyTestDirectory2": should export all journeys to a single file in the folder named "journeyTestDirectory2" with no dependencies, no coordinates, and only string arrays in the export.', async () => {
        const exportFile = "allAlphaJourneys.journey.json";
        const exportDirectory = "journeyTestDirectory2";
        const CMD = `frodo journey export -Na --no-deps --no-coords --use-string-arrays --directory ${exportDirectory}`;
        await testExport(CMD, env, type, exportFile, exportDirectory, false);
    });

    test('"frodo journey export --all-separate --no-deps --no-coords --use-string-arrays": should export all journeys to separate files with no dependencies, no coordinates, and using string arrays', async () => {
        const CMD = `frodo journey export --all-separate --no-deps --no-coords --use-string-arrays`;
        await testExport(CMD, env, type);
    });

    test('"frodo journey export -NAD journeyTestDirectory3": should export all journeys to separate files in the folder named "journeyTestDirectory3"', async () => {
        const exportDirectory = "journeyTestDirectory3";
        const CMD = `frodo journey export -NAD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
