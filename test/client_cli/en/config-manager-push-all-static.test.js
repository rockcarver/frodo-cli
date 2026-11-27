import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config push all-static --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config push all-static' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
