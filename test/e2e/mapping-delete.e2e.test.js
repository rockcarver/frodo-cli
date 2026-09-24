/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping delete -i sync/managedAlpha_user_managedBravo_user
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping delete --mapping-id mapping/managedBravo_user_managedBravo_user0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo mapping delete', () => {

    test('"frodo mapping delete -i sync/managedAlpha_user_managedBravo_user": should delete the mapping with id \'sync/managedAlpha_user_managedBravo_user\'', async () => {
        const CMD = `frodo mapping delete -i sync/managedAlpha_user_managedBravo_user`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo mapping delete --mapping-id mapping/managedBravo_user_managedBravo_user0": should delete the mapping with id \'mapping/managedBravo_user_managedBravo_user0\'', async () => {
        const CMD = `frodo mapping delete --mapping-id mapping/managedBravo_user_managedBravo_user0`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo mapping delete -a": should delete all mappings', async () => {
        const CMD = `frodo mapping delete -a`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo mapping delete --all": should do nothing when no mappings can be deleted', async () => {
        const CMD = `frodo mapping delete --all`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
