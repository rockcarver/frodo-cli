import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'log tail' should be expected english", async () => {
  const CMD = 'frodo log tail --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'logs tail' should be expected english", async () => {
  const CMD = 'frodo logs tail --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
