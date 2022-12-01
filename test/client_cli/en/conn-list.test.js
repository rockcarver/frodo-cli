import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connections list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'list' should be expected english", async () => {
  // Arrange
  expect(stdout).toMatchSnapshot();
});
