import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo agent web export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'agent web export' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
