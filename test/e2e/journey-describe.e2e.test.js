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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -o 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --override-version 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -i j00
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --journey-id j00
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -i j00 --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -i j00 -o 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --file test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json -o 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -F test.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --output-file test.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -F test.json --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -F test.json -o 4.2.0
*/
import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import fs from "fs";

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = {
    env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

describe('frodo journey describe', () => {
    test('"frodo journey describe": should describe all journeys', async () => {
        const CMD = `frodo journey describe`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe --markdown": should describe all journeys in markdown', async () => {
        const CMD = `frodo journey describe --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -o 4.2.0": should describe all journeys and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe --override-version 4.2.0": should describe all journeys and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe --override-version 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -i j00": should describe the j00 journey', async () => {
        const CMD = `frodo journey describe -i j00`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe --journey-id j00": should describe the j00 journey', async () => {
        const CMD = `frodo journey describe --journey-id j00`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -i j00 --markdown": should describe the j00 journey in markdown', async () => {
        const CMD = `frodo journey describe -i j00 --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -i j00 -o 4.2.0": should describe the j00 journey and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -i j00 -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json": should describe all journeys from file', async () => {
        const CMD = `frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe --file test/e2e/exports/all/allAlphaJourneys.journey.json": should describe all journeys from file', async () => {
        const CMD = `frodo journey describe --file test/e2e/exports/all/allAlphaJourneys.journey.json`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json --markdown": should describe all journeys from file in markdown', async () => {
        const CMD = `frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json -o 4.2.0": should describe all journeys from file and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test('"frodo journey describe -F test1.json": should describe all journeys and write output to test1.json file', async () => {
        const CMD = `frodo journey describe -F test1.json`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        const data = fs.readFileSync("test1.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test1.json");
    });

    test('"frodo journey describe --output-file test2.json": should describe all journeys and write output to test2.json file', async () => {
        const CMD = `frodo journey describe --output-file test2.json`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        const data = fs.readFileSync("test2.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test2.json");
    });

    test('"frodo journey describe -F test3.json --markdown": should describe all journeys and write output to test3.json file in markdown', async () => {
        const CMD = `frodo journey describe -F test3.json --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        const data = fs.readFileSync("test3.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test3.json");
    });

    test('"frodo journey describe -F test4.json -o 4.2.0": should describe all journeys and write output to test4.json file and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -F test4.json -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        const data = fs.readFileSync("test4.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test4.json");
    });
});
