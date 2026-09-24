/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret version deactivate -i esv-test-secret-pi-generic -v 1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret version deactivate --secret-id esv-test-secret-pi-generic --version 2
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv secret version deactivate', () => {
    test('"frodo esv secret version deactivate -i esv-test-secret-pi-generic -v 1": should deactivate version 1 of the secret "esv-test-secret-pi-generic"', async () => {
        const CMD = `frodo esv secret version deactivate -i esv-test-secret-pi-generic -v 1`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo esv secret version deactivate --secret-id esv-test-secret-pi-generic --version 2": should display an error when activating version 2 of the secret "esv-test-secret-pi-generic", which is the latest and already activated version', async () => {
        const CMD = `frodo esv secret version deactivate --secret-id esv-test-secret-pi-generic --version 2`;
        try {
          await exec(CMD, env);
          fail("Command should've failed");
        } catch (e) {
          expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });
});
