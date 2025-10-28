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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -di 01 -f test/e2e/exports/all/allServers.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --server-id 01 --file test/e2e/exports/all/allServers.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -u 8081 -f test/e2e/exports/all/allServers.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --default --server-url http://localhost:8081/am --file test/e2e/exports/all/allServers.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -f test/e2e/exports/all/allServers.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -daf test/e2e/exports/all/allServers.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --all --file test/e2e/exports/all/allServers.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -dAD test/e2e/exports/all-separate/classic/global/server -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --all-separate --directory test/e2e/exports/all-separate/classic/global/server -m classic
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { classic_connection as cc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const classicEnv = getEnv(cc);

const allDirectory = "test/e2e/exports/all";
const allServersFileName = "allServers.server.json";
const allServersExport = `${allDirectory}/${allServersFileName}`;
const allSeparateServersDirectory = `test/e2e/exports/all-separate/classic/global/server`;

describe('frodo server import', () => {

    test(`"frodo server import -di 01 -f ${allServersExport} -m classic": should import the server with the id "01" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -di 01 -f ${allServersExport} -m classic`;
        const { stdout, stderr } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
        expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test(`"frodo server import --server-id 01 --file ${allServersExport} -m classic": should import the server with the id "01" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import --server-id 01 --file ${allServersExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo server import -u 8081 -f ${allServersExport} -m classic": should import the server with the url containing "8081" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -u 8081 -f ${allServersExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo server import --default  --server-url http://localhost:8081/am --file ${allServersExport} -m classic": should import the server with the url "http://localhost:8081/am" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import --default --server-url http://localhost:8081/am --file ${allServersExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo server import -f ${allServersExport} -m classic": should import the first server from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -f ${allServersExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo server import -daf ${allServersExport} -m classic": should import all servers from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -daf ${allServersExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo server import --all --file ${allServersExport} -m classic": should import all servers from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import --all --file ${allServersExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo server import -dAD ${allSeparateServersDirectory} -m classic": should import all servers from the ${allSeparateServersDirectory} directory"`, async () => {
        const CMD = `frodo server import -dAD ${allSeparateServersDirectory} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo server import --all-separate --directory ${allSeparateServersDirectory} -m classic": should import all servers from the ${allSeparateServersDirectory} directory"`, async () => {
        const CMD = `frodo server import --all-separate --directory ${allSeparateServersDirectory} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
