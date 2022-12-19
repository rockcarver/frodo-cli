import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo admin list-static-user-mappings --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'admin list-static-user-mappings' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
