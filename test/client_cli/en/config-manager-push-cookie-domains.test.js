import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config push cookie-domains --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config push cookie-domains' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});