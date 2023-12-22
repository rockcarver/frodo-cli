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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export -i RCSClient
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export --app-id RCSClient --no-deps -f my-nodeps-RCSClient.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export -Ni RCSClient -D oauthClientExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export --all --no-deps --file my-nodeps-allAlphaApplications.oauth2.app.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export -NaD oauthClientExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo oauth client export --all-separate --no-metadata --directory oauthClientExportTestDir3
*/
import { testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = {
    env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const type = 'oauth2.app';

describe('frodo oauth client export', () => {
    test('"frodo oauth client export -i RCSClient": should export the oauth client with oauth client id "RCSClient"', async () => {
        const exportFile = "RCSClient.oauth2.app.json";
        const CMD = `frodo oauth client export -i RCSClient`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo oauth client export --app-id RCSClient --no-deps -f my-nodeps-RCSClient.oauth2.app.json": should export the oauth client with oauth client id "RCSClient" with no dependencies into a file named my-nodeps-RCSClient.oauth2.app.json', async () => {
        const exportFile = "my-nodeps-RCSClient.oauth2.app.json";
        const CMD = `frodo oauth client export --app-id RCSClient --no-deps -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo oauth client export -Ni RCSClient -D oauthClientExportTestDir1": should export the oauth client with oauth client id "RCSClient" to the directory oauthClientExportTestDir1', async () => {
        const exportDirectory = "oauthClientExportTestDir1";
        const CMD = `frodo oauth client export -Ni RCSClient -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo oauth client export -a": should export all oauth clients to a single file', async () => {
        const exportFile = "allAlphaApplications.oauth2.app.json";
        const CMD = `frodo oauth client export -a`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo oauth client export --all --no-deps --file my-nodeps-allAlphaApplications.oauth2.app.json": should export all oauth clients to a single file with no dependencies', async () => {
        const exportFile = "my-nodeps-allAlphaApplications.oauth2.app.json";
        const CMD = `frodo oauth client export --all --no-deps --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo oauth client export -NaD oauthClientExportTestDir2": should export all oauth clients to a single file in the directory oauthClientExportTestDir2', async () => {
        const exportDirectory = "oauthClientExportTestDir2";
        const CMD = `frodo oauth client export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, "oauthClientExportTestDir2", false);
    });

    test('"frodo oauth client export -A": should export all oauth clients to separate files', async () => {
        const CMD = `frodo oauth client export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo oauth client export --all-separate --no-metadata --directory oauthClientExportTestDir3": should export all oauth clients to separate files in the directory oauthClientExportTestDir3', async () => {
        const exportDirectory = 'oauthClientExportTestDir3';
        const CMD = `frodo oauth client export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
