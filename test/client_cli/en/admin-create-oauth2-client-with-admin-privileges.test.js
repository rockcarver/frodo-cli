import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo admin create-oauth2-client-with-admin-privileges --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'admin create-oauth2-client-with-admin-privileges' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
