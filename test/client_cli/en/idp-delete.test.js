import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo idp delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idp delete' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
