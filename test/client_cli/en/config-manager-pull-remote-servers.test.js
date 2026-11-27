import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config pull connector-servers --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config pull connector-servers' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
