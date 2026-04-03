import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config-manager push audit --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config-manager push audit' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
