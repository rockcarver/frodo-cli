import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo app list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'app list' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
