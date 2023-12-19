import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo authz policy export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'authz policy export' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
