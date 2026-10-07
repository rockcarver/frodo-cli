/**
 * The guard of the `config-manager delete` commands (cli record 0037), through
 * the real CLI and without a tenant. Without a terminal, a delete of more than
 * one object is refused before the login, so these runs never reach the host
 * (it cannot be reached): the refusal is the only thing that happens. A single
 * named target and a dry run are not refused, so they go on to the login and
 * fail on the host instead.
 */
import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const HOST = 'http://127.0.0.1:9/am';

async function run(command) {
  try {
    const { stdout, stderr } = await exec(`${command} ${HOST}`, {
      env: { ...process.env, FRODO_TEST: '0' },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('a delete of more than one object without a terminal and without --yes', () => {
  test.each([
    'frodo config-manager delete applications',
    'frodo config-manager delete oauth-cimd-profiles',
    'frodo config-manager delete custom-nodes',
    'frodo config-manager delete endpoints',
    'frodo config-manager delete scripts',
    'frodo config-manager delete scripts -p Example',
    'frodo config-manager delete scripts -p Example -p Other',
    'frodo config-manager delete themes',
    'frodo config-manager delete email-templates',
    'frodo config-manager delete locales',
    'frodo config-manager delete secrets',
    'frodo config-manager delete terms-and-conditions',
    'frodo config-manager delete oauth-issuers',
    'frodo config-manager delete variables',
    'frodo config-manager delete schedules',
    'frodo config-manager delete secret-mappings',
  ])('"%s" is refused before the login', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete');
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });

  test('the refusal says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete scripts -p Example -p Other');

    expect(stderr).toContain('all eligible scripts that start with "Example" or "Other"');
  });

  test('the refusal of themes names the realms', async () => {
    const { stderr } = await run('frodo config-manager delete themes');

    expect(stderr).toContain('all themes in the selected realms');
  });

  test('the refusal of email templates says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete email-templates');

    expect(stderr).toContain('all email templates');
  });

  test('the refusal of locales says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete locales');

    expect(stderr).toContain('all locales');
  });

  test('the refusal of schedules says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete schedules');

    expect(stderr).toContain('all schedules');
  });

  test('the refusal of secrets says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete secrets');

    expect(stderr).toContain('all secrets');
  });

  test('the refusal of terms and conditions says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete terms-and-conditions');

    expect(stderr).toContain('all terms and conditions versions');
  });

  test('the refusal of variables says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete variables');

    expect(stderr).toContain('all variables');
  });

  test('the refusal of CIMD profiles says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete oauth-cimd-profiles');

    expect(stderr).toContain('all CIMD profiles in the selected realms');
  });

  test('the refusal of trusted JWT issuers says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete oauth-issuers');

    expect(stderr).toContain('all trusted JWT issuers in the selected realms');
  });

  test('the refusal of applications says that the objects they own go too', async () => {
    const { stderr } = await run('frodo config-manager delete applications');

    expect(stderr).toContain('all applications and the objects they own');
  });
});

describe('what is not refused', () => {
  test.each([
    'frodo config-manager delete applications -n Example',
    'frodo config-manager delete oauth-cimd-profiles -n Example',
    'frodo config-manager delete oauth-issuers -n Example',
    'frodo config-manager delete custom-nodes -n Example',
    'frodo config-manager delete endpoints -n Example',
    'frodo config-manager delete scripts -n Example',
    'frodo config-manager delete themes -n Example',
    'frodo config-manager delete email-templates -n Example',
    'frodo config-manager delete secrets -n esv-example',
    'frodo config-manager delete terms-and-conditions -n 0.1',
    'frodo config-manager delete variables -n esv-example',
    // a name that is given but empty is not "delete all": it is not asked about,
    // it fails after the login because no variable has that id
    "frodo config-manager delete variables -n ''",
    'frodo config-manager delete oauth-cimd-profiles --dry-run',
    'frodo config-manager delete oauth-cimd-profiles -n Example --dry-run',
    'frodo config-manager delete oauth-cimd-profiles -y',
    'frodo config-manager delete oauth-issuers --dry-run',
    'frodo config-manager delete oauth-issuers -n Example --dry-run',
    'frodo config-manager delete oauth-issuers -y',
    'frodo config-manager delete applications -d',
    'frodo config-manager delete applications -n Example -d',
    'frodo config-manager delete custom-nodes -d',
    'frodo config-manager delete endpoints -d',
    'frodo config-manager delete scripts -d',
    'frodo config-manager delete scripts -p Example -d',
    'frodo config-manager delete themes -d',
    'frodo config-manager delete email-templates -d',
    'frodo config-manager delete secrets -d',
    'frodo config-manager delete terms-and-conditions -d',
    'frodo config-manager delete variables -d',
    'frodo config-manager delete applications -y',
    'frodo config-manager delete custom-nodes -y',
    'frodo config-manager delete endpoints -y',
    'frodo config-manager delete scripts -y',
    'frodo config-manager delete themes -y',
    'frodo config-manager delete email-templates -y',
    'frodo config-manager delete secrets -y',
    'frodo config-manager delete terms-and-conditions -y',
    'frodo config-manager delete variables -y',
    'frodo config-manager delete locales -d',
    'frodo config-manager delete locales -y',
    'frodo config-manager delete locales -n en',
    'frodo config-manager delete schedules --dry-run',
    'frodo config-manager delete schedules -y',
    'frodo config-manager delete schedules -n Example',
    'frodo config-manager delete schedules -n Example --dry-run',
    'frodo config-manager delete secret-mappings -d',
    'frodo config-manager delete secret-mappings -y',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
  });
});

describe('an empty secret name', () => {
  test.each([
    "frodo config-manager delete secrets -n ''",
    "frodo config-manager delete secrets -n '' -y",
    "frodo config-manager delete secrets -n '' -d",
    'frodo config-manager delete secrets --name=',
  ])('"%s" is an error before the login, not a delete of all secrets', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('The secret name (-n) must not be empty');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('the preview option of the oauth kinds and of schedules has no short form', () => {
  // an option that makes a command destructive has a long form only (frodo-cli#1264, P5 and P6)
  test.each([
    'frodo config-manager delete oauth-cimd-profiles -d',
    'frodo config-manager delete oauth-cimd-profiles -n Example -d',
    'frodo config-manager delete oauth-issuers -d',
    'frodo config-manager delete oauth-issuers -n Example -d',
    'frodo config-manager delete schedules -d',
    'frodo config-manager delete schedules -n Example -d',
  ])('"%s" is rejected as an unknown option before anything else', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain("unknown option '-d'");
    expect(stderr).not.toContain('Refusing to delete');
    // the usage that commander prints says "connection profile": look for the failed connection itself
    expect(stderr).not.toMatch(/ECONNREFUSED|ENOTFOUND/);
  });
});

describe('an empty CIMD profile name', () => {
  test.each([
    "frodo config-manager delete oauth-cimd-profiles -n ''",
    "frodo config-manager delete oauth-cimd-profiles -n '' -y",
    "frodo config-manager delete oauth-cimd-profiles -n '' --dry-run",
    'frodo config-manager delete oauth-cimd-profiles --name=',
  ])('"%s" is an error before the login, not a delete of all CIMD profiles', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('The CIMD profile name must not be empty');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('an empty trusted JWT issuer name', () => {
  test.each([
    "frodo config-manager delete oauth-issuers -n ''",
    "frodo config-manager delete oauth-issuers -n '' -y",
    "frodo config-manager delete oauth-issuers -n '' --dry-run",
    'frodo config-manager delete oauth-issuers --name=',
  ])('"%s" is an error before the login, not a delete of all trusted JWT issuers', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('The trusted JWT issuer name must not be empty');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('an empty locale name', () => {
  test.each([
    "frodo config-manager delete locales -n ''",
    "frodo config-manager delete locales -n '' -y",
    "frodo config-manager delete locales -n '' -d",
    'frodo config-manager delete locales --name=',
  ])('"%s" is an error before the login, not a delete of all locales', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('The locale name (-n) must not be empty');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('an empty schedule name', () => {
  test.each([
    "frodo config-manager delete schedules -n ''",
    "frodo config-manager delete schedules -n '' -y",
    "frodo config-manager delete schedules -n '' --dry-run",
    'frodo config-manager delete schedules --name=',
  ])('"%s" is an error before the login, not a delete of all schedules', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('The schedule name (-n) must not be empty');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('an empty name', () => {
  // an unset shell variable, as in -n "$VERSION", is a name that is not there:
  // it is not "all" and it is not asked about as if it were
  test('is not taken for a delete of all terms and conditions versions', async () => {
    const { stderr } = await run("frodo config-manager delete terms-and-conditions -n ''");

    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('all terms and conditions versions');
  });
});
