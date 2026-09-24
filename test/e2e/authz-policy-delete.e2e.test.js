/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy delete -i 'Test Policy'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy delete --policy-id 'Test Policy'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy delete --all --set-id test-policy-set
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo authz policy delete', () => {

    test('"frodo authz policy delete -i \'Test Policy\'": should delete the policies with id \'Test Policy\'', async () => {
        const CMD = `frodo authz policy delete -i 'Test Policy'`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy delete --policy-id \'Test Policy\'": should display error when the policies with id \'Test Policy\' cannot be deleted since it does not exist', async () => {
        const CMD = `frodo authz policy delete --policy-id 'Test Policy'`;
        try {
            await exec(CMD, env);
            fail("Command should've failed")
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    test('"frodo authz policy delete -a": should delete all policies', async () => {
        const CMD = `frodo authz policy delete -a`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy delete --all --set-id test-policy-set": should delete all policies in the test-policy-set set', async () => {
        const CMD = `frodo authz policy delete --all --set-id test-policy-set`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy delete --all": should do nothing when no policies can be deleted', async () => {
        const CMD = `frodo authz policy delete --all`;
        const { stderr } = await exec(CMD, env);
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

});
