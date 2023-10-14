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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -i j00
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -i j01 -f my-j01.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export --journey-id j02 --no-deps --use-string-arrays -D journeyTestDirectory1
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export --all --file my-allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -a --no-deps --use-string-arrays --directory journeyTestDirectory2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export --all-separate --no-deps --use-string-arrays
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey export -AD journeyTestDirectory3
*/
import { testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import fs from "fs";

process.env['FRODO_MOCK'] = '1';
const env = {
    env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const type = 'journey';

describe('frodo journey export', () => {
    test('"frodo journey export -i j00": should export the journey with journey id "j00"', async () => {
        const exportFile = "j00.journey.json";
        const CMD = `frodo journey export -i j00`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo journey export -i j01 -f my-j01.json": should export the journey with journey id "j01" into file named my-j01.json', async () => {
        const exportFile = "my-j01.json";
        const CMD = `frodo journey export -i j01 -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo journey export --journey-id j02 --no-deps --use-string-arrays -D journeyTestDirectory1": should export the journey with journey id "j02" to the folder named "journeyTestDirectory1", and the export should not contain dependencies and should use string arrays.', async () => {
        const exportFile = "j02.journey.json";
        const exportDirectory = "journeyTestDirectory1";
        const CMD = `frodo journey export --journey-id j02 --no-deps --use-string-arrays -D ${exportDirectory}`;
        await testExport(CMD, env, type, exportFile, exportDirectory);
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

    test('"frodo journey export -a --no-deps --use-string-arrays --directory journeyTestDirectory2": should export all journeys to a single file in the folder named "journeyTestDirectory2" with no dependencies and only string arrays in the export.', async () => {
        const exportFile = "allAlphaJourneys.journey.json";
        const exportDirectory = "journeyTestDirectory2";
        const CMD = `frodo journey export -a --no-deps --use-string-arrays --directory ${exportDirectory}`;
        await testExport(CMD, env, type, exportFile, exportDirectory);
    });

    test('"frodo journey export --all-separate --no-deps --use-string-arrays": should export all journeys to separate files with no dependencies and using string arrays', async () => {
        const CMD = `frodo journey export --all-separate --no-deps --use-string-arrays`;
        await testExport(CMD, env, type);
    });

    test('"frodo journey export -AD journeyTestDirectory3": should export all journeys to separate files in the folder named "journeyTestDirectory3"', async () => {
        const exportDirectory = "journeyTestDirectory3";
        const CMD = `frodo journey export -AD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory);
    });
});
