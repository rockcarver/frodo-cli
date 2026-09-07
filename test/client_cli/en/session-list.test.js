import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo session list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'session list' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
