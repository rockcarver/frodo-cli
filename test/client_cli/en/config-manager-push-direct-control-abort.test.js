import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config-manager push direct-control-abort --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config-manager push direct-control-abort' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
