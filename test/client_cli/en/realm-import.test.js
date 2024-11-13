import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo realm import --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'realm import' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
