import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo idm remote-proxy describe --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idm remote-proxy describe' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
