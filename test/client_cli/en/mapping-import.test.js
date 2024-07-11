import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo mapping import --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'mapping import' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
