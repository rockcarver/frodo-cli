import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo esv variable export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'esv variable export' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
