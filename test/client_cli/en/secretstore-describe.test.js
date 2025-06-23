import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo secretstore describe --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'secretstore describe' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
