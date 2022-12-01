import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo email template import --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'email_templates import' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
