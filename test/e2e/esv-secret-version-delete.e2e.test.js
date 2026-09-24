/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret version delete -i esv-test-secret-pi-generic -v 2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret version delete --secret-id esv-test-secret-pi-generic --version 4
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv secret version delete', () => {
    test('"frodo esv secret version delete -i esv-test-secret-pi-generic -v 2": should delete version 2 of the "esv-test-var-pi-generic" secret', async () => {
        const CMD = `frodo esv secret version delete -i esv-test-secret-pi-generic -v 2`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo esv secret version delete --secret-id esv-test-secret-pi-generic --version 4": should display error when deleting non-existent version 4 of the "esv-test-var-pi-generic" secret', async () => {
        const CMD = `frodo esv secret version delete --secret-id esv-test-secret-pi-generic --version 4`;
        try {
          await exec(CMD, env);
          fail("Command should've failed");
        } catch (e) {
          expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });
});
