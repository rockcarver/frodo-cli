import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config push idm-authentication --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config push idm-authentication' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});