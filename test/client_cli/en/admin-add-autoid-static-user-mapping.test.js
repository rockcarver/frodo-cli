import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo admin add-autoid-static-user-mapping --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'admin add-autoid-static-user-mapping' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
