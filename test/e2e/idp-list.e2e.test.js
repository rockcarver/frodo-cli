/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp list
 */
import { getEnv, normalizeSnapshotText, exec } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo idp list', () => {
    test('"frodo idp list": should list the ids of the idps', async () => {
        const CMD = `frodo idp list`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
