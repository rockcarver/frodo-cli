/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm describe
 */
import { getEnv, normalizeSnapshotText, exec } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo realm describe', () => {
    test('"frodo realm describe": should describe the current realm', async () => {
        const CMD = `frodo realm describe`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
