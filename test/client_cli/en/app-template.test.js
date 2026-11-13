import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo app template --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'app template --help' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
