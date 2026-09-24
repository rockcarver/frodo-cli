/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node delete -n 'Generate JWT'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node delete --node-name 'Unknown'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node delete -i e5ad0110c8ee4dafaae983003cd05d4a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node delete --node-id c605506774a848f7877b4d17a453bd39-1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node delete -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node delete --all
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo node delete', () => {
    test("\"frodo node delete -n 'Generate JWT'\": should delete the custom node named 'Generate JWT'", async () => {
      const CMD = `frodo node delete -n 'Generate JWT'`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test("\"frodo node delete --node-name 'Unknown'\": should display error when the custom node named 'Unknown' cannot be deleted since it doesn't exist", async () => {
      const CMD = `frodo node delete --node-name 'Unknown'`;
      try {
        await exec(CMD, env);
        throw new Error("Command should've failed");
      } catch (e) {
        expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
      }
    });

    test('"frodo node delete -i e5ad0110c8ee4dafaae983003cd05d4a": should delete the custom node with service name \'e5ad0110c8ee4dafaae983003cd05d4a\'', async () => {
      const CMD = `frodo node delete -i e5ad0110c8ee4dafaae983003cd05d4a`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo node delete --node-id c605506774a848f7877b4d17a453bd39-1": should display error when the custom node with id \'c605506774a848f7877b4d17a453bd39-1\' cannot be deleted since it is being used', async () => {
      const CMD = `frodo node delete --node-id c605506774a848f7877b4d17a453bd39-1`;
      try {
        await exec(CMD, env);
        throw new Error("Command should've failed");
      } catch (e) {
        expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
      }
    });

    test('"frodo node delete -a": should delete all nodes that are not being used', async () => {
      const CMD = `frodo node delete -a`;
      try {
        await exec(CMD, env);
        throw new Error("Command should've failed");
      } catch (e) {
        expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
      }
    });

    test('"frodo node delete --all": should not delete any nodes if they are all in use', async () => {
      const CMD = `frodo node delete --all`;
      try {
        await exec(CMD, env);
        throw new Error("Command should've failed");
      } catch (e) {
        expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
      }
    });
});
