import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connections delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'delete' should be expected english", async () => {
  // Arrange
  expect(stdout).toMatchSnapshot();
});
