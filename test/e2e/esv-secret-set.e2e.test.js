/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret set -i esv-test-secret-pi-generic --description "Test secret containing value of pi"
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv secret set', () => {
    test('"frodo esv secret set -i esv-test-secret-pi-generic --description "Test secret containing value of pi"": should update the "esv-test-secret-pi-generic" secret\'s description.', async () => {
        const CMD = `frodo esv secret set -i esv-test-secret-pi-generic --description "Test secret containing value of pi"`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
