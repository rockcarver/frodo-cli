import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'log list' should be expected english", async () => {
  const CMD = 'frodo log list --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'logs list' should be expected english", async () => {
  const CMD = 'frodo logs list --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
