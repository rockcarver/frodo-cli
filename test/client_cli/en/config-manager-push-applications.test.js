import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config push apps --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config push apps' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
