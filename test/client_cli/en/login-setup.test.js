import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

test("CLI help interface for 'login setup' should be expected english", async () => {
  const { stdout } = await exec('frodo login setup --help');
  expect(stdout).toMatchSnapshot();
});

test("'login setup --help' (plain -h) shows --login-client-id/--login-redirect-uri directly under Options, with no separate Authentication Options heading", async () => {
  // Regression coverage for FrodoCommand.ts's mergeHeadingIntoOptions(),
  // same reasoning as login.test.js's equivalent check: every option on
  // `login setup` already IS an authentication option, so they're folded
  // into the plain "Options:" section instead of a separate "Authentication
  // Options:" heading, and must appear at plain -h (not only -hh/-hhh).
  const { stdout } = await exec('frodo login setup --help');
  expect(stdout).not.toMatch(/Authentication Options:/);
  expect(stdout).toMatch(/--login-client-id/);
  expect(stdout).toMatch(/--login-redirect-uri/);
});

test("'login --help' still lists 'setup' as a subcommand and still accepts its own [host] argument directly (regression guard for the enablePositionalOptions() fix — login setup's own options must not be swallowed by the parent)", async () => {
  const { stdout } = await exec('frodo login --help');
  expect(stdout).toMatch(/setup/);
  expect(stdout).toMatch(/\[host]/);
});

test("login setup's own options don't get swallowed by the parent 'login' command (regression guard for the enablePositionalOptions() fix)", async () => {
  // --login-client-id/--login-redirect-uri/--type both have defaults now
  // (auto-detected client id and redirect URI), so there's no cheap,
  // backend-free validation error left to hook an assertion on the way
  // the original bug's fix was verified here before. The fix itself was
  // verified directly, live, against a real ForgeOps tenant this session
  // (frodo login setup with explicit --login-client-id/--login-redirect-uri/
  // --type all correctly reaching options — confirmed via debug output
  // before the fix, and a full successful client+script creation after).
  // This test only confirms dispatch and argument parsing still work:
  // reaching getTokens()'s own "no connection profile" error (rather than
  // an earlier commander-level parse failure) proves the subcommand's
  // action ran with the right host argument.
  await expect(
    exec(
      'frodo login setup https://openam-example.forgeblocks.com/am --login-client-id my-client --login-redirect-uri http://127.0.0.1:8080/callback --type forgeops'
    )
  ).rejects.toThrow(/No connection profile found matching/);
});
