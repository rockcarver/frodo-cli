/**
 * The guard of the `config delete` commands (cli record 0037), through
 * the real CLI and without a tenant. Without a terminal, a delete of more than
 * one object is refused before the login, so these runs never reach the host
 * (it cannot be reached): the refusal is the only thing that happens. A single
 * named target and a dry run are not refused, so they go on to the login and
 * fail on the host instead.
 */
import cp from 'child_process';
import { promisify } from 'util';
import { EXPECTED_SELECTORS } from '../../unit/ConfigManagerSelectorRows.js';

const exec = promisify(cp.exec);
const HOST = 'http://127.0.0.1:9/am';

async function run(command, env = {}) {
  try {
    const { stdout, stderr } = await exec(`${command} ${HOST}`, {
      env: { ...process.env, FRODO_TEST: '0', ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('a delete of more than one object without a terminal and without --yes', () => {
  test.each([
    'frodo config delete applications',
    'frodo config delete connector-definitions',
    'frodo config delete connector-mappings',
    'frodo config delete cors',
    'frodo config delete cors --deep',
    'frodo config delete oauth-cimd-profiles',
    'frodo config delete custom-nodes',
    'frodo config delete endpoints',
    'frodo config delete scripts',
    'frodo config delete scripts -p Example',
    'frodo config delete scripts -p Example -p Other',
    'frodo config delete themes',
    'frodo config delete email-templates',
    'frodo config delete locales',
    'frodo config delete secrets',
    'frodo config delete terms-and-conditions',
    'frodo config delete oauth-issuers',
    'frodo config delete oauth-software-publishers',
    'frodo config delete variables',
    'frodo config delete schedules',
    'frodo config delete secret-mappings',
    'frodo config delete telemetry',
    'frodo config delete tenant-config',
    'frodo config delete journeys',
    'frodo config delete services',
  ])('"%s" is refused before the login', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete');
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    // the host was never reached; the word "connector" is in the messages of one command, so it is not "connect"
    expect(stderr).not.toMatch(/ECONNREFUSED|connect(?!or)/i);
  });

  // "connector server" holds the letters "connect", which the case above takes for a login that was tried: this one looks for the failure itself
  test.each([
    'frodo config delete remote-servers',
  ])('"%s" is refused before the login', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete all connector servers');
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(/ECONNREFUSED|Error getting tokens/);
  });

  test('the refusal says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete scripts -p Example -p Other');

    expect(stderr).toContain('all eligible scripts that start with "Example" or "Other"');
  });

  test('the refusal of themes names the realms', async () => {
    const { stderr } = await run('frodo config delete themes');

    expect(stderr).toContain('all themes in the selected realms');
  });

  test('the refusal of email templates says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete email-templates');

    expect(stderr).toContain('all email templates');
  });

  test('the refusal of locales says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete locales');

    expect(stderr).toContain('all locales');
  });

  test('the refusal of schedules says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete schedules');

    expect(stderr).toContain('all schedules');
  });

  test('the refusal of secret mappings says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete secret-mappings');

    expect(stderr).toContain('all secret mappings in the selected realms');
  });

  test('the refusal of secrets says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete secrets');

    expect(stderr).toContain('all secrets');
  });

  test('the refusal of terms and conditions says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete terms-and-conditions');

    expect(stderr).toContain('all terms and conditions versions');
  });

  test('the refusal of variables says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete variables');

    expect(stderr).toContain('all variables');
  });

  test('the refusal of CIMD profiles says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete oauth-cimd-profiles');

    expect(stderr).toContain('all CIMD profiles in the selected realms');
  });

  test('the refusal of trusted JWT issuers says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete oauth-issuers');

    expect(stderr).toContain('all trusted JWT issuers in the selected realms');
  });

  test('the refusal of software publishers says what would have been deleted', async () => {
    const { stderr } = await run('frodo config delete oauth-software-publishers');

    expect(stderr).toContain('all software publishers in the selected realms');
  });

  test('the refusal of applications says that the objects they own go too', async () => {
    const { stderr } = await run('frodo config delete applications');

    expect(stderr).toContain('all applications and the objects they own');
  });
});

describe('what is not refused', () => {
  test.each([
    'frodo config delete applications -n Example',
    'frodo config delete oauth-cimd-profiles -i Example',
    'frodo config delete oauth-issuers -i Example',
    'frodo config delete oauth-software-publishers -i Example',
    'frodo config delete custom-nodes -n Example',
    'frodo config delete endpoints -i Example',
    'frodo config delete scripts -n Example',
    'frodo config delete themes -n Example',
    'frodo config delete email-templates -i Example',
    'frodo config delete secrets -i esv-example',
    'frodo config delete terms-and-conditions -i 0.1',
    'frodo config delete variables -i esv-example',
    'frodo config delete oauth-cimd-profiles --dry-run',
    'frodo config delete oauth-cimd-profiles -i Example --dry-run',
    'frodo config delete oauth-cimd-profiles -y',
    'frodo config delete oauth-issuers --dry-run',
    'frodo config delete oauth-issuers -i Example --dry-run',
    'frodo config delete oauth-issuers -y',
    'frodo config delete oauth-software-publishers --dry-run',
    'frodo config delete oauth-software-publishers -i Example --dry-run',
    'frodo config delete oauth-software-publishers -y',
    'frodo config delete applications -d',
    'frodo config delete applications -n Example -d',
    'frodo config delete custom-nodes -d',
    'frodo config delete endpoints -d',
    'frodo config delete scripts -d',
    'frodo config delete scripts -p Example -d',
    'frodo config delete themes -d',
    'frodo config delete email-templates -d',
    'frodo config delete secrets -d',
    'frodo config delete terms-and-conditions -d',
    'frodo config delete variables -d',
    'frodo config delete applications -y',
    'frodo config delete connector-definitions -d',
    'frodo config delete connector-definitions -y',
    'frodo config delete connector-mappings -d',
    'frodo config delete connector-mappings -y',
    'frodo config delete cors -d',
    'frodo config delete cors -y',
    'frodo config delete cors --deep -d',
    'frodo config delete cors --deep -y',
    'frodo config delete custom-nodes -y',
    'frodo config delete endpoints -y',
    'frodo config delete scripts -y',
    'frodo config delete themes -y',
    'frodo config delete email-templates -y',
    'frodo config delete secrets -y',
    'frodo config delete terms-and-conditions -y',
    'frodo config delete variables -y',
    'frodo config delete locales -d',
    'frodo config delete locales -y',
    'frodo config delete locales -i en',
    'frodo config delete remote-servers -y',
    'frodo config delete remote-servers --dry-run',
    'frodo config delete remote-servers -n rcs',
    'frodo config delete schedules --dry-run',
    'frodo config delete schedules -y',
    'frodo config delete schedules -i Example',
    'frodo config delete schedules -i Example --dry-run',
    'frodo config delete secret-mappings --dry-run',
    'frodo config delete secret-mappings -y',
    'frodo config delete telemetry -y',
    'frodo config delete telemetry -d',
    'frodo config delete telemetry -c otlp -y',
    'frodo config delete telemetry -c otlp -d',
    'frodo config delete telemetry -c otlp -i Example',
    'frodo config delete tenant-config -y',
    'frodo config delete tenant-config --dry-run',
    'frodo config delete journeys -d',
    'frodo config delete journeys -y',
    'frodo config delete services -d',
    'frodo config delete services -y',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
  });
});

describe('a delete of connector definitions', () => {
  // the word "connector" is in every message of the command, so the check that the host was never reached
  // names the error that an unreachable host gives, and not the word "connect"
  const NOT_REACHED = /ECONNREFUSED/;

  test('a delete of all of them is refused before the login without a terminal and without -y, and says what goes', async () => {
    const { code, stderr } = await run('frodo config delete connector-definitions');

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete all connector definitions without confirmation');
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(NOT_REACHED);
  });

  test.each([
    'frodo config delete connector-definitions -i Azure --force',
    'frodo config delete connector-definitions -n Azure --force',
  ])('"%s" changes nothing but the connector definition, yet is refused before the login without -y', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain("Refusing to delete connector definition 'Azure' although other objects may name it");
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(NOT_REACHED);
  });

  test.each([
    'frodo config delete connector-definitions -i Azure',
    'frodo config delete connector-definitions -n Azure',
    'frodo config delete connector-definitions --name Azure',
    'frodo config delete connector-definitions -i Azure -d',
    'frodo config delete connector-definitions -i Azure --force -d',
    'frodo config delete connector-definitions -i Azure --force -y',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('unknown option');
  });

  test.each([
    'frodo config delete connector-definitions --force',
    'frodo config delete connector-definitions --force -y',
    'frodo config delete connector-definitions --force -d',
  ])('"%s" is refused before the login: --force applies to a named connector definition only', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('--force applies to a named connector definition only');
    expect(stderr).not.toMatch(NOT_REACHED);
  });
});

describe('a delete of connector mappings', () => {
  // the word "connector" is in every message of the command, so the check that the host was never reached
  // names the error that an unreachable host gives, and not the word "connect"
  const NOT_REACHED = /ECONNREFUSED/;

  test('a delete of all of them is refused before the login without a terminal and without -y, and says what goes', async () => {
    const { code, stderr } = await run('frodo config delete connector-mappings');

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete all connector mappings without confirmation');
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(NOT_REACHED);
  });

  test.each([
    'frodo config delete connector-mappings -i mapA --force',
    'frodo config delete connector-mappings -n mapA --force',
  ])('"%s" is refused before the login without -y, as every forced delete is', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain("Refusing to delete connector mapping 'mapA' although other objects may name it");
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(NOT_REACHED);
  });

  test.each([
    'frodo config delete connector-mappings -i mapA',
    'frodo config delete connector-mappings -n mapA',
    'frodo config delete connector-mappings --name mapA',
    'frodo config delete connector-mappings -i mapA -d',
    'frodo config delete connector-mappings -i mapA --force -d',
    'frodo config delete connector-mappings -i mapA --force -y',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('unknown option');
  });

  test.each([
    'frodo config delete connector-mappings --force',
    'frodo config delete connector-mappings --force -y',
    'frodo config delete connector-mappings --force -d',
  ])('"%s" is refused before the login: --force applies to a named connector mapping only', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('--force applies to a named connector mapping only');
    expect(stderr).not.toMatch(NOT_REACHED);
  });

  test.each([
    'frodo config delete connector-mappings -i "" -y',
    'frodo config delete connector-mappings -n "" -y',
    'frodo config delete connector-mappings --name "" -y',
    'frodo config delete connector-mappings --connector-mapping-id= -y',
  ])('"%s" is refused while the command line is parsed: an empty name never means all', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('An empty value never selects all objects');
    expect(stderr).not.toMatch(NOT_REACHED);
  });
});

describe('a delete of a named journey', () => {
  // the realm comes from the environment: a named journey needs one
  const env = { FRODO_REALM: 'alpha' };

  test.each([
    'frodo config delete journeys -i ZionLogin --force',
    'frodo config delete journeys -i ZionLogin --force --keep-links',
  ])('"%s" changes the objects that name the journey: it is refused before the login without -y', async (command) => {
    const { code, stderr } = await run(command, env);

    expect(code).toBe(1);
    expect(stderr).toContain("Refusing to delete journey 'ZionLogin' and change the objects that name it");
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });

  test.each([
    'frodo config delete journeys -i ZionLogin',
    'frodo config delete journeys -n ZionLogin',
    'frodo config delete journeys --name ZionLogin',
    'frodo config delete journeys -i ZionLogin -d',
    'frodo config delete journeys -i ZionLogin --force -d',
    'frodo config delete journeys -i ZionLogin --force -y',
    'frodo config delete journeys -i ZionLogin --force --keep-links -y',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command, env);

    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('unknown option');
  });

  test.each([
    ['frodo config delete journeys --force -y', 'applies to a named journey only'],
    ['frodo config delete journeys --keep-links -y', 'applies to a named journey only'],
    ['frodo config delete journeys -i ZionLogin --keep-links', '--keep-links applies together with --force only'],
  ])('"%s" is refused before the login', async (command, message) => {
    const { code, stderr } = await run(command, env);

    expect(code).toBe(1);
    expect(stderr).toContain(message);
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });

  test('without a realm it is an error before the login', async () => {
    const { code, stderr } = await run('frodo config delete journeys -i ZionLogin --force -y');

    expect(code).toBe(1);
    expect(stderr).toContain('The -i, --journey-id option requires a realm argument');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('a delete of services', () => {
  // the realm comes from the environment: a named service needs one
  const env = { FRODO_REALM: 'alpha' };

  test('a delete of all is refused before the login without a terminal and without -y, and names the realms it would touch', async () => {
    const { code, stderr } = await run('frodo config delete services');

    expect(code).toBe(1);
    expect(stderr).toContain('Refusing to delete all services in the selected realms without confirmation');
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toContain('Error getting tokens');
  });

  test.each([
    'frodo config delete services -i email',
    'frodo config delete services -n email',
    'frodo config delete services --name email',
    'frodo config delete services --service-id email',
    'frodo config delete services -i email -d',
  ])('"%s" with a realm names one service: it is not asked about, not refused, and goes on to the login', async (command) => {
    const { stderr } = await run(command, env);

    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('unknown option');
    expect(stderr).toContain('Error getting tokens');
  });

  test('without a realm a named delete is an error before the login, and prints the error only', async () => {
    const { code, stdout, stderr } = await run('frodo config delete services -i email -y');

    expect(code).toBe(1);
    expect(stderr).toContain('The -i, --service-id option requires a realm argument');
    expect(stderr).not.toContain('Error getting tokens');
    // not the help of the command
    expect(stdout).not.toContain('Usage:');
    expect(stderr).not.toContain('Usage:');
  });
});

describe('a delete of CORS configurations', () => {
  test('a delete of all is refused before the login without a terminal and without -y, and names -y and --dry-run', async () => {
    const { code, stderr } = await run('frodo config delete cors');

    expect(code).toBe(1);
    expect(stderr).toContain(
      'Refusing to delete all CORS configurations without confirmation: there is no interactive terminal to ask.'
    );
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toContain('Error getting tokens');
  });

  test('with --deep the refusal says that the IDM CORS filter is reset too', async () => {
    const { code, stderr } = await run('frodo config delete cors --deep');

    expect(code).toBe(1);
    expect(stderr).toContain(
      'Refusing to delete all CORS configurations and reset the IDM CORS filter to its default values without confirmation'
    );
    expect(stderr).not.toContain('Error getting tokens');
  });

  test.each([
    'frodo config delete cors -i cors',
    'frodo config delete cors -n cors',
    'frodo config delete cors --name cors',
    'frodo config delete cors --cors-id cors',
    'frodo config delete cors -i cors -d',
  ])('"%s" names one configuration: it is not asked about, not refused, and goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('unknown option');
    expect(stderr).toContain('Error getting tokens');
  });

  test.each([
    'frodo config delete cors -i cors --deep',
    'frodo config delete cors -n cors --deep -y',
    'frodo config delete cors --name cors --deep -d',
    'frodo config delete cors --cors-id cors --deep',
  ])('"%s" is refused while the command line is parsed, before the guard and the login', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain(
      "error: option '--deep' cannot be used with option '-i, --cors-id <id>'"
    );
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('Error getting tokens');
  });
});

describe('the refusal of journeys says that the journeys of the login go too', () => {
  test('the refusal names the journeys of the login and the orphaned nodes', async () => {
    const { stderr } = await run('frodo config delete journeys');

    expect(stderr).toContain('all journeys (the journeys that the realm uses for login included) and all orphaned nodes in the selected realms');
  });
});

describe('a delete of connector servers', () => {
  // the words of the product are "connector server", so "connect" alone says nothing about a login: look for the failure
  const NOT_CONNECTED = /ECONNREFUSED|Error getting tokens/;

  test.each([
    'frodo config delete remote-servers -i rcs --force',
    'frodo config delete remote-servers -i rcs --force --keep-links',
  ])('"%s" changes the server clusters that list the connector server: it is refused before the login without -y', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain("Refusing to delete connector server 'rcs'");
    expect(stderr).toContain('-y/--yes');
    expect(stderr).toContain('--dry-run');
    expect(stderr).not.toMatch(NOT_CONNECTED);
  });

  test.each([
    'frodo config delete remote-servers -i rcs',
    'frodo config delete remote-servers -n rcs',
    'frodo config delete remote-servers --name rcs',
    'frodo config delete remote-servers --server-id rcs',
    'frodo config delete remote-servers -i rcs -d',
    'frodo config delete remote-servers -i rcs --force -d',
    'frodo config delete remote-servers -i rcs --force -y',
    'frodo config delete remote-servers -i rcs --force --keep-links -y',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('unknown option');
  });

  test.each([
    ['frodo config delete remote-servers --force -y', 'applies to a named connector server only'],
    ['frodo config delete remote-servers --keep-links -y', 'applies to a named connector server only'],
    ['frodo config delete remote-servers -i rcs --keep-links', '--keep-links applies together with --force only'],
    ["frodo config delete remote-servers -i '  '", 'must not be empty'],
  ])('"%s" is refused before the login', async (command, message) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain(message);
    expect(stderr).not.toMatch(NOT_CONNECTED);
  });
});

describe('the dry run of the oauth types and of schedules has the short form -d', () => {
  // -d is the dry run on every command of the group that has one:
  // https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
  // (options of the configuration commands)
  test.each([
    'frodo config delete oauth-cimd-profiles -d',
    'frodo config delete oauth-cimd-profiles -i Example -d',
    'frodo config delete oauth-issuers -d',
    'frodo config delete oauth-issuers -i Example -d',
    'frodo config delete oauth-software-publishers -d',
    'frodo config delete oauth-software-publishers -i Example -d',
    'frodo config delete schedules -d',
    'frodo config delete schedules -i Example -d',
  ])('"%s" is a known option and goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('unknown option');
    expect(stderr).not.toContain('Refusing to delete');
  });
});

describe('a named secret mapping', () => {
  test.each([
    'frodo config delete secret-mappings -i am.example.secret.id',
    'frodo config delete secret-mappings -i am.example.secret.id --dry-run',
  ])('"%s" needs a realm: it is an error before the login', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('requires a realm argument');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('the root realm and secret mappings', () => {
  test.each([
    'frodo config delete secret-mappings -y',
    'frodo config delete secret-mappings --dry-run',
    'frodo config delete secret-mappings -i am.example.secret.id',
  ])('"%s" with the root realm is an error before the login, not a silent success', async (command) => {
    let result;
    try {
      const { stdout, stderr } = await exec(`${command} ${HOST}`, {
        env: { ...process.env, FRODO_TEST: '0', FRODO_REALM: '/' },
      });
      result = { code: 0, stdout, stderr };
    } catch (error) {
      result = { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The root realm has no secret mappings to delete');
    expect(result.stderr).not.toContain('Refusing to delete');
    expect(result.stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });
});

describe('a telemetry category that does not exist', () => {
  test.each([
    'frodo config delete telemetry -c OTLP -y',
    'frodo config delete telemetry -c foo -y',
    'frodo config delete telemetry -c foo -d',
    "frodo config delete telemetry -c ''",
  ])('"%s" is an error before the login, with the valid categories named', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('Allowed choices are otlp, splunk');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|ENOTFOUND/);
  });
});

describe('a telemetry exporter id that is blank or has no category', () => {
  test.each([
    "frodo config delete telemetry -c otlp -i '  '",
    "frodo config delete telemetry -c otlp -n '  '",
    "frodo config delete telemetry -i '  '",
  ])('"%s" is an error before the login, not a delete of all exporters', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('The telemetry exporter id (-i) must not be empty');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|ENOTFOUND/);
  });

  test('"frodo config delete telemetry -i Example" needs a category, before the login', async () => {
    const { code, stderr } = await run('frodo config delete telemetry -i Example');

    expect(code).toBe(1);
    expect(stderr).toContain('Named telemetry config requires category');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|ENOTFOUND/);
  });
});

describe('a delete that names one object, for every command and every spelling of the selector', () => {
  // https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
  // (options of the configuration commands): -i, --<type>-id selects by identifier and -n, --<type>-name by a name that
  // can change; -n and --name stay as aliases. Named, a delete never asks and never needs -y (a command that can delete more than the one object it names asks first, https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md): it goes on
  // to the login, and the login fails on the host that cannot be reached.
  const rows = EXPECTED_SELECTORS.filter((row) => row.command.includes(' delete '));
  const typeOf = (row) => row.command.split(' ').pop();
  // a named telemetry exporter needs its category, a named secret mapping, journey or service needs a realm
  const extraOf = (row) => (typeOf(row) === 'telemetry' ? ' -c otlp' : '');
  const envOf = (row) => (['secretstore-mappings', 'journeys', 'services'].includes(typeOf(row)) ? { FRODO_REALM: 'alpha' } : {});
  const selectorsOf = (row) => [
    ['-i', 'x'],
    [row.id, 'x'],
    [`${row.id}=x`],
    ...(row.name === null
      ? row.aliases.includes('-n')
        ? [['-n', 'x']]
        : []
      : [['-n', 'x'], [row.name, 'x']]),
    ...(row.aliases.includes('--name') ? [['--name', 'x']] : []),
  ];
  const emptiesOf = (row) => [
    ['-i', "''"],
    [row.id, "''"],
    [`${row.id}=`],
    ...(row.name === null
      ? row.aliases.includes('-n')
        ? [['-n', "''"]]
        : []
      : [['-n', "''"], [row.name, "''"], [`${row.name}=`]]),
    ...(row.aliases.includes('--name') ? [['--name', "''"], ['--name=']] : []),
  ];

  test('has the 22 delete rows', () => {
    expect(rows).toHaveLength(22);
  });

  test.each(rows.map((row) => [typeOf(row), row]))(
    '%s: is not refused and not asked about, without a terminal and without -y, and goes on to the login',
    async (type, row) => {
      const runs = await Promise.all(
        selectorsOf(row).map(async (args) => ({
          typed: args.join(' '),
          ...(await run(
            `frodo config delete ${type}${extraOf(row)} ${args.join(' ')}`,
            envOf(row)
          )),
        }))
      );

      for (const { typed, stderr } of runs) {
        expect([typed, stderr.includes('Refusing to delete')]).toEqual([typed, false]);
        expect([typed, stderr.includes('unknown option')]).toEqual([typed, false]);
        // it reached the login, which fails (there is no connection profile in a fresh home)
        expect([typed, stderr.includes('Error getting tokens')]).toEqual([typed, true]);
      }
    }
  );

  test.each(rows.map((row) => [typeOf(row), row]))(
    '%s: an empty value of the selector, in every spelling, is an error before the login and before the guard, even with -y',
    async (type, row) => {
      const runs = await Promise.all(
        emptiesOf(row).map(async (args) => ({
          typed: args.join(' '),
          ...(await run(
            `frodo config delete ${type}${extraOf(row)} ${args.join(' ')} -y`,
            envOf(row)
          )),
        }))
      );

      for (const { typed, code, stderr } of runs) {
        expect([typed, code]).toEqual([typed, 1]);
        expect([typed, stderr.includes('An empty value never selects all objects')]).toEqual([typed, true]);
        expect([typed, stderr.includes('Refusing to delete')]).toEqual([typed, false]);
        expect([typed, stderr.includes('Error getting tokens')]).toEqual([typed, false]);
      }
    }
  );

  test.each(rows.map((row) => [typeOf(row), row]))(
    '%s: without a selector it is refused as before, with the same line for a name that is given',
    async (type, row) => {
      const bulk = await run(`frodo config delete ${type}${extraOf(row)}`, envOf(row));

      // the refusal of a delete that names nothing is the one of a command that can delete more than the one object it names (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md)
      expect(bulk.code).toBe(1);
      expect(bulk.stderr).toContain('Refusing to delete');
      expect(bulk.stderr).toContain('-y/--yes');
      expect(bulk.stderr).not.toContain('Error getting tokens');
    }
  );
});

describe('a blank id of the commands that check it is an error before the login', () => {
  test.each([
    ["frodo config delete secrets -i '  '", 'The secret id (-i) must not be empty'],
    ["frodo config delete oauth-cimd-profiles -n '  '", 'The CIMD profile id (-i) must not be empty'],
    ["frodo config delete oauth-issuers -i '  '", 'The trusted JWT issuer id (-i) must not be empty'],
    ["frodo config delete oauth-software-publishers -i '  '", 'The software publisher id (-i) must not be empty'],
    ["frodo config delete locales -i '  '", 'The locale id (-i) must not be empty'],
    ["frodo config delete schedules --name '  '", 'The schedule id (-i) must not be empty'],
    ["frodo config delete secret-mappings -n ' '", 'The secret mapping id (-i) must not be empty'],
    ["frodo config delete services -i '  '", 'The service id (-i) must not be empty'],
    ["frodo config delete cors -i '  '", 'The CORS configuration id (-i) must not be empty'],
    ["frodo config delete cors -n ' ' -y", 'The CORS configuration id (-i) must not be empty'],
  ])('"%s" says that the id must not be empty, and is not a delete of all objects', async (command, message) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain(message);
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('Error getting tokens');
  });
});

describe('the prefix of delete scripts', () => {
  test.each([
    "frodo config delete scripts -p ''",
    "frodo config delete scripts -p '' -y",
    "frodo config delete scripts --prefix= -y",
  ])('"%s" is refused before the login: an empty prefix would match every script', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('An empty value never selects all objects');
    expect(stderr).toContain("option '-p, --prefix <prefix>'");
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('Error getting tokens');
  });

  test('"-i" and "-p" cannot be combined, before the login', async () => {
    const { code, stderr } = await run('frodo config delete scripts -i x -p Example -y');

    expect(code).toBe(1);
    expect(stderr).toContain('cannot be used with option');
    expect(stderr).not.toContain('Error getting tokens');
  });
});
