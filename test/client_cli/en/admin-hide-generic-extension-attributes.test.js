import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo admin hide-generic-extension-attributes --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'admin hide-generic-extension-attributes' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
