/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo dcc session init
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS="https://openam-mtc-feb16-stg.forgeblocks.com" FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo dcc session abort
FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo dcc session init
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS="https://openam-mtc-feb16-stg.forgeblocks.com" FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo dcc session abort --json
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo dcc session abort', () => {
    test('"frodo dcc session abort": should abort the current direct configuration session', async () => {
        const CMD = `frodo dcc session abort`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });

    test('"frodo dcc session abort --json": should abort the current direct configuration session in JSON format', async () => {
        const CMD = `frodo dcc session abort --json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });
});
