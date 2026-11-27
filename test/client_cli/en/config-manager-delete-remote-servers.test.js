import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config delete connector-servers --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config delete connector-servers' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
