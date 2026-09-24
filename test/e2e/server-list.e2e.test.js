/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server list -l
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo server list --long
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

describe('frodo server list', () => {
    test('"frodo server list": should list the urls of the servers', async () => {
        const CMD = `frodo server list`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo server list -l": should list the ids, urls, and site names of the servers', async () => {
        const CMD = `frodo server list -l`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo server list --long": should list the ids, urls, and site names of the servers', async () => {
        const CMD = `frodo server list --long`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
