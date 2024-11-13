import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo server export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'server export' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
