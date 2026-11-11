import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'aiagent describe' should be expected english", async () => {
  const CMD = 'frodo aiagent describe --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'aiagent describe --json' should be expected english", async () => {
  const CMD = 'frodo aiagent describe --help --json';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
