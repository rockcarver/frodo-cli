/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role list -l
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role list --long
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo role list', () => {
    test('"frodo role list": should list the names of the internal roles', async () => {
        const CMD = `frodo role list`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo role list -l": should list the ids, names, descriptions, and conditions of the internal roles', async () => {
        const CMD = `frodo role list -l`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo role list --long": should list the ids, names, descriptions, and conditions of the internal roles', async () => {
        const CMD = `frodo role list --long`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
