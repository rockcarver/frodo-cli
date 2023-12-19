import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo authz set delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'authz set delete' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
