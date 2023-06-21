import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'log fetch' Usage should be expected english", async () => {
  const CMD = 'frodo log fetch --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'logs fetch' Usage should be expected english", async () => {
  const CMD = 'frodo logs fetch --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
