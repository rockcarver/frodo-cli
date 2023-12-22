import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo oauth client describe --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'oauth client describe' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
