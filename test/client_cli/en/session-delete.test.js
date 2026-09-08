import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo session delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'session delete' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});

test("'session delete -hhh' omits every Authentication/Connection option — it never calls getTokens()", async () => {
  // Regression coverage for FrodoCommand.ts's `{ local: true }` constructor
  // option and OptionCategory: `session delete` is local file I/O only, so
  // it should show none of the options a real login/connection would need,
  // even at the fullest help level. Before this, these leaked in silently
  // (session-delete.ts's omit list never accounted for options added after
  // it was written, e.g. --browser/--device).
  const { stdout: fullStdout } = await exec('frodo session delete -hhh');
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
