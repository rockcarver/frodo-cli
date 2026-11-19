import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test.each(['', ' show', ' enable', ' disable'])(
  "CLI help interface for 'settings update-check%s' should be expected english",
  async (verb) => {
    const { stdout } = await exec(`frodo settings update-check${verb} --help`);
    expect(stdout).toMatchSnapshot();
  }
);
