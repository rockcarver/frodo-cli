import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'save' should be expected english", async () => {
  const CMD = 'frodo conn save --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'save' should be expected english", async () => {
  const CMD = 'frodo connections save --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'add' should be expected english", async () => {
  const CMD = 'frodo connections add --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'add' should be expected english", async () => {
  const CMD = 'frodo conn add --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
