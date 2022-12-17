import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo conn delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'conn delete' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
