/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret delete -i esv-test-secret-pi-generic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret delete --secret-id esv-test-secret-pi-generic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv secret delete', () => {

    test('"frodo esv secret delete -i esv-test-secret-pi-generic": should delete the secret with id \'esv-test-secret-pi-generic\'', async () => {
        const CMD = `frodo esv secret delete -i esv-test-secret-pi-generic`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo esv secret delete --secret-id esv-test-secret-pi-generic": should display error when the secret with id \'esv-test-secret-pi-generic\' cannot be deleted since it does not exist', async () => {
        const CMD = `frodo esv secret delete --secret-id esv-test-secret-pi-generic`;
        try {
          await exec(CMD, env);
          fail("Command should've failed");
        } catch (e) {
          expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    //TODO: Generate mock for this test (skip for meantime)
    test.skip('"frodo esv secret delete -a": should delete all secrets', async () => {
        const CMD = `frodo esv secret delete -a`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    //TODO: Generate mock for this test (skip for meantime)
    test.skip('"frodo esv secret delete --all": should do nothing when no secrets can be deleted', async () => {
        const CMD = `frodo esv secret delete --all`;
        const { stderr } = await exec(CMD, env);
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

});
