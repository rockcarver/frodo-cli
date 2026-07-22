import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo iga workflow list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'iga workflow list' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
