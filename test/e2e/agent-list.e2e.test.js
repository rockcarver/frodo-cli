/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent list -l
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent list -gm classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent list --global --long --type classic
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo agent list', () => {
    describe('Cloud Tests:', () => {
        test('"frodo agent list": should list the ids of the agents', async () => {
            const CMD = `frodo agent list`;
            const { stdout } = await exec(CMD, env);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });

        test('"frodo agent list -l": should list the ids, statuses, and types of the agents', async () => {
            const CMD = `frodo agent list -l`;
            const { stdout } = await exec(CMD, env);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });
    });

    describe.skip('Classic Tests:', () => {
        test('"frodo agent list -gm classic": should list the ids of the global agents', async () => {
            const CMD = `frodo agent list -gm classic`;
            const { stdout } = await exec(CMD, classicEnv);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });

        test('"frodo agent list --global --long --type classic": should list the ids and statuses of the global agents', async () => {
            const CMD = `frodo agent list --global --long --type classic`;
            const { stdout } = await exec(CMD, classicEnv);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });
    });
});
