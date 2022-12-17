import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo admin list-oauth2-clients-with-custom-privileges --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'admin list-oauth2-clients-with-custom-privileges' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
