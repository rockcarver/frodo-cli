import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo journey prune --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'journey prune' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
