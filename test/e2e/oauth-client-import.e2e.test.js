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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --no-deps -i test2 -f test/e2e/exports/all/allAlphaApplications.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --app-id test2 --file test/e2e/exports/all/allAlphaApplications.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import -i test2 -f allAlphaApplications.oauth2.app.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --no-deps -f test/e2e/exports/all/allAlphaApplications.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --file test/e2e/exports/all/allAlphaApplications.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import -f allAlphaApplications.oauth2.app.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --no-deps -af test/e2e/exports/all/allAlphaApplications.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --all --file test/e2e/exports/all/allAlphaApplications.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import -af allAlphaApplications.oauth2.app.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --no-deps -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/oauth2.app
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import --all-separate --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/oauth2.app
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client import -f testclient.oauth2.app.json --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/oauth2.app
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaOauthApplicationsFileName = "allAlphaApplications.oauth2.app.json";
const allAlphaOauthApplicationsExport = `${allDirectory}/${allAlphaOauthApplicationsFileName}`;
const allSeparateOauthApplicationsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/oauth2.app`;

describe('frodo oauth client import', () => {
    test(`"frodo oauth client import --no-deps -i test2 -f ${allAlphaOauthApplicationsExport}": should import the oauth client with the id "test2" from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --no-deps -i test2 -f ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import --app-id test2 --file ${allAlphaOauthApplicationsExport}": should import the oauth client with the id "test2" from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --app-id test2 --file ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import -i test2 -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}": should import the oauth client with the id "test2" from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import -i test2 -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import --no-deps -f ${allAlphaOauthApplicationsExport}": should import the first oauth client from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --no-deps -f ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import --file ${allAlphaOauthApplicationsExport}": should import the first oauth client from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --file ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}": should import the first oauth client from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import --no-deps -af ${allAlphaOauthApplicationsExport}": should import all oauth clients from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --no-deps -af ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import --all --file ${allAlphaOauthApplicationsExport}": should import all oauth clients from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --all --file ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import -af ${allAlphaOauthApplicationsFileName} -D ${allDirectory}": should import all oauth clients from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import -af ${allAlphaOauthApplicationsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import --no-deps -AD ${allSeparateOauthApplicationsDirectory}": should import all oauth clients from the ${allSeparateOauthApplicationsDirectory} directory"`, async () => {
        const CMD = `frodo oauth client import --no-deps -AD ${allSeparateOauthApplicationsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo oauth client import --all-separate --directory ${allSeparateOauthApplicationsDirectory}": should import all oauth clients from the ${allSeparateOauthApplicationsDirectory} directory"`, async () => {
        const CMD = `frodo oauth client import --all-separate --directory ${allSeparateOauthApplicationsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"Regression rockcarver/frodo-lib#393: frodo oauth client import -f 'testclient.oauth2.app.json' -D ${allSeparateOauthApplicationsDirectory}": should import the first oauth client from the file "testclient.oauth2.app.json"`, async () => {
        const CMD = `frodo oauth client import -f testclient.oauth2.app.json --directory ${allSeparateOauthApplicationsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
