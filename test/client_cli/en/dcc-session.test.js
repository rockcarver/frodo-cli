import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'frodo dcc session' should be expected english", async () => {
  const CMD = 'frodo dcc session --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});

test("CLI help interface for 'frodo direct-configuration-control session' should be expected english", async () => {
  const CMD = 'frodo direct-configuration-control session --help';
  const { stdout } = await exec(CMD);
  expect(stdout).toMatchSnapshot();
});
