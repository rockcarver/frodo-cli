import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo realm export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'realm export' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
