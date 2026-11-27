import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config delete scripts --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config delete scripts' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
