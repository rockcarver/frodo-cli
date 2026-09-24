/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script delete -n 'hashdeviceProfile'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script delete --script-name 'hashdeviceProfile'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script delete -i e15a13ee-9168-40cf-934f-656a5f568a6a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script delete --script-id e15a13ee-9168-40cf-934f-656a5f568a6a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo script delete', () => {
    test("\"frodo script delete -n 'hashdeviceProfile'\": should delete the script named 'hashdeviceProfile'", async () => {
        const CMD = `frodo script delete -n 'hashdeviceProfile'`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test("\"frodo script delete --script-name 'hashdeviceProfile'\": should display error when the script named 'hashdeviceProfile' cannot be deleted since it does not exist", async () => {
        const CMD = `frodo script delete --script-name 'hashdeviceProfile'`;
        try {
          await exec(CMD, env);
          fail("Command should've failed");
        } catch (e) {
          expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    test('"frodo script delete -i e15a13ee-9168-40cf-934f-656a5f568a6a": should delete the script with id \'e15a13ee-9168-40cf-934f-656a5f568a6a\'', async () => {
        const CMD = `frodo script delete -i e15a13ee-9168-40cf-934f-656a5f568a6a`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo script delete --script-id e15a13ee-9168-40cf-934f-656a5f568a6a": should display error when the script with id \'e15a13ee-9168-40cf-934f-656a5f568a6a\' cannot be deleted since it does not exist', async () => {
        const CMD = `frodo script delete --script-id e15a13ee-9168-40cf-934f-656a5f568a6a`;
        try {
            await exec(CMD, env);
            fail("Command should've failed");
          } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
          }
    });

    //TODO: Generate mock for this test (skip for meantime)
    test.skip('"frodo script delete -a": should delete all scripts', async () => {
        const CMD = `frodo script delete -a`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    //TODO: Generate mock for this test (skip for meantime)
    test.skip('"frodo script delete --all": should do nothing when no scripts can be deleted', async () => {
        const CMD = `frodo script delete --all`;
        const { stderr } = await exec(CMD, env);
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });
});
