import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo esv variable set --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'esv variable set' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
