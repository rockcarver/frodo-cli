import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'settings config-manager-layout' should be expected english", async () => {
  const { stdout } = await exec('frodo settings config-manager-layout --help');
  expect(stdout).toMatchSnapshot();
});
