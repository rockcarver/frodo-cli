import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'agent java describe' should be expected english", async () => {
  const CMD = 'frodo agent java describe --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'agent java describe --json' should be expected english", async () => {
  const CMD = 'frodo agent java describe --help --json';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
