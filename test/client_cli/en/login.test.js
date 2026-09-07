import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo login --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'login' should be expected english", async () => {
  expect(stdout).toMatchSnapshot();
});

test("'login --help' (plain -h) shows the authentication options directly under Options, with no separate Authentication Options heading", async () => {
  // Regression coverage for FrodoCommand.ts's mergeHeadingIntoOptions():
  // every option on `login` already IS an authentication option, so
  // login.ts folds them into the plain "Options:" section instead of
  // keeping a separate "Authentication Options:" heading. They must still
  // appear at plain -h (not only -hh/-hhh), and every other command keeps
  // its own separate heading (see the next test).
  expect(stdout).not.toMatch(/Authentication Options:/);
  expect(stdout).toMatch(/--browser/);
  expect(stdout).toMatch(/--device/);
});

test("the Authentication Options merge is scoped to 'login' only — another command still gets its own separate heading", async () => {
  const { stdout: journeyStdout } = await exec('frodo journey list -hh');
  expect(journeyStdout).toMatch(/Authentication Options:/);
});
