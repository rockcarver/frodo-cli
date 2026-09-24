/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -di 01 -f test/e2e/exports/all/allServers.server.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --server-id 01 --file test/e2e/exports/all/allServers.server.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -u 8081 -f test/e2e/exports/all/allServers.server.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --default --server-url http://localhost:8081/am --file test/e2e/exports/all/allServers.server.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -f test/e2e/exports/all/allServers.server.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -daf test/e2e/exports/all/allServers.server.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --all --file test/e2e/exports/all/allServers.server.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import -dAD test/e2e/exports/all-separate/classic/global/server
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server import --all-separate --directory test/e2e/exports/all-separate/classic/global/server
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { classic_connection as cc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const classicEnv = getEnv(cc);

const allDirectory = "test/e2e/exports/all";
const allServersFileName = "allServers.server.json";
const allServersExport = `${allDirectory}/${allServersFileName}`;
const allSeparateServersDirectory = `test/e2e/exports/all-separate/classic/global/server`;

describe('frodo server import', () => {

    test(`"frodo server import -di 01 -f ${allServersExport}": should import the server with the id "01" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -di 01 -f ${allServersExport}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import --server-id 01 --file ${allServersExport}": should import the server with the id "01" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import --server-id 01 --file ${allServersExport}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import -u 8081 -f ${allServersExport}": should import the server with the url containing "8081" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -u 8081 -f ${allServersExport}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import --default  --server-url http://localhost:8081/am --file ${allServersExport}": should import the server with the url "http://localhost:8081/am" from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import --default --server-url http://localhost:8081/am --file ${allServersExport}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import -f ${allServersExport}": should import the first server from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -f ${allServersExport}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import -daf ${allServersExport}": should import all servers from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import -daf ${allServersExport}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import --all --file ${allServersExport}": should import all servers from the file "${allServersExport}"`, async () => {
        const CMD = `frodo server import --all --file ${allServersExport}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import -dAD ${allSeparateServersDirectory}": should import all servers from the ${allSeparateServersDirectory} directory"`, async () => {
        const CMD = `frodo server import -dAD ${allSeparateServersDirectory}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo server import --all-separate --directory ${allSeparateServersDirectory}": should import all servers from the ${allSeparateServersDirectory} directory"`, async () => {
        const CMD = `frodo server import --all-separate --directory ${allSeparateServersDirectory}`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
