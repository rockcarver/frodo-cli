import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'frodo' root command should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});

test('root full help documents the update-check opt-out under Runtime', async () => {
  const { stdout: fullHelp } = await exec('frodo -hhh');
  const runtimeHelp = fullHelp.split('  Runtime:\n')[1].split('\n  Output:')[0];
  expect(runtimeHelp).toContain('FRODO_NO_UPDATE_CHECK');
  expect(runtimeHelp).toContain('Set to 1, true, yes, or on (case-insensitive)');
  expect(runtimeHelp.replace(/\s+/g, ' ')).toContain(
    'the only outbound call frodo makes on its own. Skips the version cache and update notices.'
  );
});
