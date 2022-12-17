import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo esv secret delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'esv secret delete' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
