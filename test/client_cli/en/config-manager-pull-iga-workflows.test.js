import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config pull iga-workflows --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'config pull iga-workflows' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
