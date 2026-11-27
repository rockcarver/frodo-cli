import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config push oauth-cimd-profiles --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config push oauth-cimd-profiles' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
