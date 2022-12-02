import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo journey list --help';
const { stdout, stderr } = await exec(CMD);

test("CLI help interface for 'journey list' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
