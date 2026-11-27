import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config pull password-policy --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config pull password-policy' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
