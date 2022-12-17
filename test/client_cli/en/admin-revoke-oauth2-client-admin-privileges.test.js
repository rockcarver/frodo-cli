import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo admin revoke-oauth2-client-admin-privileges --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'admin revoke-oauth2-client-admin-privileges' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
