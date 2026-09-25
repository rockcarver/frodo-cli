/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable delete -i esv-test-var-pi
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable delete --variable-id esv-test-var-pi
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv variable delete', () => {

    test('"frodo esv variable delete -i esv-test-var-pi": should delete the variable with id \'esv-test-var-pi\'', async () => {
        const CMD = `frodo esv variable delete -i esv-test-var-pi`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo esv variable delete --variable-id esv-test-var-pi": should display error when the variable with id \'esv-test-var-pi\' cannot be deleted since it does not exist', async () => {
        const CMD = `frodo esv variable delete --variable-id esv-test-var-pi`;
        try {
          await exec(CMD, env);
          fail("Command should've failed");
        } catch (e) {
          expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    //TODO: Generate mock for this test (skip for meantime)
    test.skip('"frodo esv variable delete -a": should delete all variables', async () => {
        const CMD = `frodo esv variable delete -a`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    //TODO: Generate mock for this test (skip for meantime)
    test.skip('"frodo esv variable delete --all": should do nothing when no variables can be deleted', async () => {
        const CMD = `frodo esv variable delete --all`;
        const { stderr } = await exec(CMD, env);
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

});
