import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo iga workflow import --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'iga workflow import' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
