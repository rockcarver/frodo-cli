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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -f test/e2e/exports/all-separate/journey/FrodoTest.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --verbose -f test/e2e/exports/all-separate/journey/FrodoTest.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -i j00 -f test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -i j00 -f test/e2e/exports/all/allAlphaJourneys.journey.json --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --journey-id j00 -f test/e2e/exports/all/allAlphaJourneys.journey.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -i j00 -f allAlphaJourneys.journey.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -f test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -f test/e2e/exports/all/allAlphaJourneys.journey.json --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --file test/e2e/exports/all/allAlphaJourneys.journey.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -f allAlphaJourneys.journey.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -af test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -af test/e2e/exports/all/allAlphaJourneys.journey.json --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --all --file test/e2e/exports/all/allAlphaJourneys.journey.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -af allAlphaJourneys.journey.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -AD test/e2e/exports/all-separate/journey
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -AD test/e2e/exports/all-separate/journey --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --all-separate --no-deps --directory test/e2e/exports/all-separate/journey
*/
import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = {
    env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const allDirectory = "test/e2e/exports/all";
const allAlphaJourneysFileName = "allAlphaJourneys.journey.json";
const allAlphaJourneysExport = `${allDirectory}/${allAlphaJourneysFileName}`;
const allSeparateJourneysDirectory = `test/e2e/exports/all-separate/journey`;

describe('frodo journey import', () => {
    test(`"frodo journey import -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json": should import the journey in file "${allSeparateJourneysDirectory}/FrodoTest.journey.json"`, async () => {
        const CMD = `frodo journey import -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import --verbose -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json": should import the journey in file "${allSeparateJourneysDirectory}/FrodoTest.journey.json"`, async () => {
        const CMD = `frodo journey import --verbose -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json`;
        const { stdout, stderr } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test(`"frodo journey import -i j00 -f ${allAlphaJourneysExport} --re-uuid": should import the journey with the id "j00" from the file "${allAlphaJourneysExport}" with new uuids`, async () => {
        const CMD = `frodo journey import -i j00 -f ${allAlphaJourneysExport} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import --journey-id j00 -f ${allAlphaJourneysExport} --no-deps": should import the journey with the id "j00" from the file "${allAlphaJourneysExport}" with no deps`, async () => {
        const CMD = `frodo journey import --journey-id j00 -f ${allAlphaJourneysExport} --no-deps`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -i j00 -f ${allAlphaJourneysFileName} -D ${allDirectory}": should import the journey with the id "j00" from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -i j00 -f ${allAlphaJourneysFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -f ${allAlphaJourneysExport}": should import the first journey from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -f ${allAlphaJourneysExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -f ${allAlphaJourneysExport} --re-uuid": should import the first journey from the file "${allAlphaJourneysExport}" with new uuids`, async () => {
        const CMD = `frodo journey import -f ${allAlphaJourneysExport} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import --file ${allAlphaJourneysExport} --no-deps": should import the first journey from the file"${allAlphaJourneysExport}" with no deps`, async () => {
        const CMD = `frodo journey import --file ${allAlphaJourneysExport} --no-deps`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -f ${allAlphaJourneysFileName} -D ${allDirectory}": should import the first journey from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -f ${allAlphaJourneysFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -af ${allAlphaJourneysExport}": should import all journeys from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -af ${allAlphaJourneysExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    // TODO: Find out why this test is not passing (skip until it can be fixed)
    test.skip(`"frodo journey import -af ${allAlphaJourneysExport} --re-uuid": should import all journeys from the file "${allAlphaJourneysExport}" with new uuids`, async () => {
        const CMD = `frodo journey import -af ${allAlphaJourneysExport} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import --all --file ${allAlphaJourneysExport} --no-deps": should import all journeys from the file"${allAlphaJourneysExport}" with no deps`, async () => {
        const CMD = `frodo journey import --all --file ${allAlphaJourneysExport} --no-deps`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -af ${allAlphaJourneysFileName} -D ${allDirectory}": should import all journeys from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -af ${allAlphaJourneysFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -AD ${allSeparateJourneysDirectory}": should import all journeys from the ${allSeparateJourneysDirectory} directory"`, async () => {
        const CMD = `frodo journey import -AD ${allSeparateJourneysDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import -AD ${allSeparateJourneysDirectory} --re-uuid": should import all journeys from the ${allSeparateJourneysDirectory} directory with new uuids`, async () => {
        const CMD = `frodo journey import -AD ${allSeparateJourneysDirectory} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo journey import --all-separate --no-deps --directory ${allSeparateJourneysDirectory}": should import all journeys from the ${allSeparateJourneysDirectory} directory with no deps`, async () => {
        const CMD = `frodo journey import --all-separate --no-deps --directory ${allSeparateJourneysDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
});
