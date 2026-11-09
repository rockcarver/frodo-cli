import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connector export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'connector export' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
