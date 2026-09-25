/** See test/e2e/README.md for how to write and record e2e tests. */

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
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

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
