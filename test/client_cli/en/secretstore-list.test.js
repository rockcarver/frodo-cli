import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo secretstore list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'secretstore list' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
