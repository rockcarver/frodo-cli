import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config-manager pull authn --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config-manager pull authn' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
