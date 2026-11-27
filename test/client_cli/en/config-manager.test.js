import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo config-manager --help';
const { stdout, stderr } = await exec(CMD);

/**
 * `config-manager` is the old name of `config`: it prints the page of `config`
 * (the snapshot is the one of config.test.js) and one notice on stderr.
 */
test("CLI help interface for 'config' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});

test("the old name 'config-manager' prints one notice on stderr", () => {
  expect(stderr.trim()).toBe(
    "'config-manager' is now called 'config'. The old name still works and will be removed in a future major release."
  );
});
