import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connections add --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'add' should be expected english", async () => {
  // Arrange
  expect(stdout).toMatchSnapshot();
});
