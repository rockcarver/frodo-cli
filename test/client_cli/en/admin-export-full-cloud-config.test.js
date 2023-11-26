import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo admin export-full-cloud-config --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'admin export-full-cloud-config' should be expected english", async () => {
    expect(stdout).toMatchSnapshot();
});
