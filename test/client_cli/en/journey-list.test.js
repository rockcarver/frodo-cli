import cp from 'child_process';
import { promisify } from 'util';
import { node14Compatibility } from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo journey list --help';
const { stdout, stderr } = await exec(CMD);

test("CLI help interface for 'journey list' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});
