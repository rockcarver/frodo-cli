import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo conn list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'conn list' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});

test("'conn list -hhh' omits every Authentication/Connection option — it never calls getTokens()", async () => {
  // Regression coverage for FrodoCommand.ts's `{ local: true }` constructor
  // option and OptionCategory: `conn list` is local file I/O only, so it
  // should show none of the options a real login/connection would need,
  // even at the fullest help level. Before this, these leaked in silently
  // (conn-list.ts's omit list never accounted for options added after it
  // was written, e.g. --browser/--device).
  const { stdout: fullStdout } = await exec('frodo conn list -hhh');
  expect(fullStdout).not.toMatch(/Authentication Options:/);
  expect(fullStdout).not.toMatch(/Connection Options:/);
  expect(fullStdout).not.toMatch(/--browser/);
  expect(fullStdout).not.toMatch(/--device/);
  expect(fullStdout).not.toMatch(/--login-client-id/);
  expect(fullStdout).not.toMatch(/--sa-id/);
  expect(fullStdout).not.toMatch(/--insecure/);
  expect(fullStdout).not.toMatch(/--idm-host/);
  expect(fullStdout).not.toMatch(/--flush-cache/);
  expect(fullStdout).not.toMatch(/--no-cache/);
});
