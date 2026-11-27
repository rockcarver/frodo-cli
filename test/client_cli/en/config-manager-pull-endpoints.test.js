import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config pull endpoints --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config pull endpoints' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
