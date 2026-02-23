import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'conn alias' should be expected english", async () => {
  const CMD = 'frodo conn alias add --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
