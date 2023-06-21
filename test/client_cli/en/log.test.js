import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'log' should be expected english", async () => {
  const CMD = 'frodo log --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'logs' should be expected english", async () => {
  const CMD = 'frodo logs --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
