import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'agent ai describe' should be expected english", async () => {
  const CMD = 'frodo agent ai describe --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'agent ai describe --json' should be expected english", async () => {
  const CMD = 'frodo agent ai describe --help --json';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
