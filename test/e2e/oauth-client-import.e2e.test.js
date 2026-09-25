/** See test/e2e/README.md for how to write and record e2e tests. */

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
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaOauthApplicationsFileName = "allAlphaApplications.oauth2.app.json";
const allAlphaOauthApplicationsExport = `${allDirectory}/${allAlphaOauthApplicationsFileName}`;
const allSeparateOauthApplicationsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/oauth2.app`;

describe('frodo oauth client import', () => {
    test(`"frodo oauth client import --no-deps -i test2 -f ${allAlphaOauthApplicationsExport}": should import the oauth client with the id "test2" from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --no-deps -i test2 -f ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import --app-id test2 --file ${allAlphaOauthApplicationsExport}": should import the oauth client with the id "test2" from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --app-id test2 --file ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import -i test2 -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}": should import the oauth client with the id "test2" from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import -i test2 -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import --no-deps -f ${allAlphaOauthApplicationsExport}": should import the first oauth client from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --no-deps -f ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import --file ${allAlphaOauthApplicationsExport}": should import the first oauth client from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --file ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}": should import the first oauth client from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import -f ${allAlphaOauthApplicationsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import --no-deps -af ${allAlphaOauthApplicationsExport}": should import all oauth clients from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --no-deps -af ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import --all --file ${allAlphaOauthApplicationsExport}": should import all oauth clients from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import --all --file ${allAlphaOauthApplicationsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import -af ${allAlphaOauthApplicationsFileName} -D ${allDirectory}": should import all oauth clients from the file "${allAlphaOauthApplicationsExport}"`, async () => {
        const CMD = `frodo oauth client import -af ${allAlphaOauthApplicationsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import --no-deps -AD ${allSeparateOauthApplicationsDirectory}": should import all oauth clients from the ${allSeparateOauthApplicationsDirectory} directory"`, async () => {
        const CMD = `frodo oauth client import --no-deps -AD ${allSeparateOauthApplicationsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo oauth client import --all-separate --directory ${allSeparateOauthApplicationsDirectory}": should import all oauth clients from the ${allSeparateOauthApplicationsDirectory} directory"`, async () => {
        const CMD = `frodo oauth client import --all-separate --directory ${allSeparateOauthApplicationsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"Regression rockcarver/frodo-lib#393: frodo oauth client import -f 'testclient.oauth2.app.json' -D ${allSeparateOauthApplicationsDirectory}": should import the first oauth client from the file "testclient.oauth2.app.json"`, async () => {
        const CMD = `frodo oauth client import -f testclient.oauth2.app.json --directory ${allSeparateOauthApplicationsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
