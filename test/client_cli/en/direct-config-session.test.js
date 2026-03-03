import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo direct-config-session --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'direct-config-session' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
