import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config push oauth2-agents --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'frodo config push oauth2-agents' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});

