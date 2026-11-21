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
    'frodo config-manager delete oauth-software-publishers',
    'frodo config-manager delete variables',
    'frodo config-manager delete schedules',
    'frodo config-manager delete secret-mappings',
    'frodo config-manager delete telemetry',
    'frodo config-manager delete tenant-config',
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

  test('the refusal of secret mappings says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete secret-mappings');

    expect(stderr).toContain('all secret mappings in the selected realms');
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

  test('the refusal of software publishers says what would have been deleted', async () => {
    const { stderr } = await run('frodo config-manager delete oauth-software-publishers');

    expect(stderr).toContain('all software publishers in the selected realms');
  });

  test('the refusal of applications says that the objects they own go too', async () => {
    const { stderr } = await run('frodo config-manager delete applications');

    expect(stderr).toContain('all applications and the objects they own');
  });
});

describe('what is not refused', () => {
  test.each([
    'frodo config-manager delete applications -n Example',
    'frodo config-manager delete oauth-cimd-profiles -i Example',
    'frodo config-manager delete oauth-issuers -i Example',
    'frodo config-manager delete oauth-software-publishers -i Example',
    'frodo config-manager delete custom-nodes -n Example',
    'frodo config-manager delete endpoints -i Example',
    'frodo config-manager delete scripts -n Example',
    'frodo config-manager delete themes -n Example',
    'frodo config-manager delete email-templates -i Example',
    'frodo config-manager delete secrets -i esv-example',
    'frodo config-manager delete terms-and-conditions -i 0.1',
    'frodo config-manager delete variables -i esv-example',
    'frodo config-manager delete oauth-cimd-profiles --dry-run',
    'frodo config-manager delete oauth-cimd-profiles -i Example --dry-run',
    'frodo config-manager delete oauth-cimd-profiles -y',
    'frodo config-manager delete oauth-issuers --dry-run',
    'frodo config-manager delete oauth-issuers -i Example --dry-run',
    'frodo config-manager delete oauth-issuers -y',
    'frodo config-manager delete oauth-software-publishers --dry-run',
    'frodo config-manager delete oauth-software-publishers -i Example --dry-run',
    'frodo config-manager delete oauth-software-publishers -y',
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
    'frodo config-manager delete locales -i en',
    'frodo config-manager delete schedules --dry-run',
    'frodo config-manager delete schedules -y',
    'frodo config-manager delete schedules -i Example',
    'frodo config-manager delete schedules -i Example --dry-run',
    'frodo config-manager delete secret-mappings --dry-run',
    'frodo config-manager delete secret-mappings -y',
    'frodo config-manager delete telemetry -y',
    'frodo config-manager delete telemetry -d',
    'frodo config-manager delete telemetry -c otlp -y',
    'frodo config-manager delete telemetry -c otlp -d',
    'frodo config-manager delete telemetry -c otlp -i Example',
    'frodo config-manager delete tenant-config -y',
    'frodo config-manager delete tenant-config --dry-run',
  ])('"%s" goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('Refusing to delete');
  });
});

describe('the dry run of the oauth types and of schedules has the short form -d', () => {
  // -d is the dry run on every command of the group that has one:
  // https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
  // (options of the configuration commands)
  test.each([
    'frodo config-manager delete oauth-cimd-profiles -d',
    'frodo config-manager delete oauth-cimd-profiles -i Example -d',
    'frodo config-manager delete oauth-issuers -d',
    'frodo config-manager delete oauth-issuers -i Example -d',
    'frodo config-manager delete oauth-software-publishers -d',
    'frodo config-manager delete oauth-software-publishers -i Example -d',
    'frodo config-manager delete schedules -d',
    'frodo config-manager delete schedules -i Example -d',
  ])('"%s" is a known option and goes on to the login', async (command) => {
    const { stderr } = await run(command);

    expect(stderr).not.toContain('unknown option');
    expect(stderr).not.toContain('Refusing to delete');
  });
});

describe('a named secret mapping', () => {
  test.each([
    'frodo config-manager delete secret-mappings -i am.example.secret.id',
    'frodo config-manager delete secret-mappings -i am.example.secret.id --dry-run',
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
    'frodo config-manager delete secret-mappings -y',
    'frodo config-manager delete secret-mappings --dry-run',
    'frodo config-manager delete secret-mappings -i am.example.secret.id',
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
    'frodo config-manager delete telemetry -c OTLP -y',
    'frodo config-manager delete telemetry -c foo -y',
    'frodo config-manager delete telemetry -c foo -d',
    "frodo config-manager delete telemetry -c ''",
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
    "frodo config-manager delete telemetry -c otlp -i '  '",
    "frodo config-manager delete telemetry -c otlp -n '  '",
    "frodo config-manager delete telemetry -i '  '",
  ])('"%s" is an error before the login, not a delete of all exporters', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('The telemetry exporter id (-i) must not be empty');
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toMatch(/ECONNREFUSED|ENOTFOUND/);
  });

  test('"frodo config-manager delete telemetry -i Example" needs a category, before the login', async () => {
    const { code, stderr } = await run('frodo config-manager delete telemetry -i Example');

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
  // a named telemetry exporter needs its category, a named secret mapping needs a realm
  const extraOf = (row) => (typeOf(row) === 'telemetry' ? ' -c otlp' : '');
  const envOf = (row) => (typeOf(row) === 'secret-mappings' ? { FRODO_REALM: 'alpha' } : {});
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

  test('has the 16 delete rows', () => {
    expect(rows).toHaveLength(16);
  });

  test.each(rows.map((row) => [typeOf(row), row]))(
    '%s: is not refused and not asked about, without a terminal and without -y, and goes on to the login',
    async (type, row) => {
      const runs = await Promise.all(
        selectorsOf(row).map(async (args) => ({
          typed: args.join(' '),
          ...(await run(
            `frodo config-manager delete ${type}${extraOf(row)} ${args.join(' ')}`,
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
            `frodo config-manager delete ${type}${extraOf(row)} ${args.join(' ')} -y`,
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
      const bulk = await run(`frodo config-manager delete ${type}${extraOf(row)}`, envOf(row));

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
    ["frodo config-manager delete secrets -i '  '", 'The secret id (-i) must not be empty'],
    ["frodo config-manager delete oauth-cimd-profiles -n '  '", 'The CIMD profile id (-i) must not be empty'],
    ["frodo config-manager delete oauth-issuers -i '  '", 'The trusted JWT issuer id (-i) must not be empty'],
    ["frodo config-manager delete oauth-software-publishers -i '  '", 'The software publisher id (-i) must not be empty'],
    ["frodo config-manager delete locales -i '  '", 'The locale id (-i) must not be empty'],
    ["frodo config-manager delete schedules --name '  '", 'The schedule id (-i) must not be empty'],
    ["frodo config-manager delete secret-mappings -n ' '", 'The secret mapping id (-i) must not be empty'],
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
    "frodo config-manager delete scripts -p ''",
    "frodo config-manager delete scripts -p '' -y",
    "frodo config-manager delete scripts --prefix= -y",
  ])('"%s" is refused before the login: an empty prefix would match every script', async (command) => {
    const { code, stderr } = await run(command);

    expect(code).toBe(1);
    expect(stderr).toContain('An empty value never selects all objects');
    expect(stderr).toContain("option '-p, --prefix <prefix>'");
    expect(stderr).not.toContain('Refusing to delete');
    expect(stderr).not.toContain('Error getting tokens');
  });

  test('"-i" and "-p" cannot be combined, before the login', async () => {
    const { code, stderr } = await run('frodo config-manager delete scripts -i x -p Example -y');

    expect(code).toBe(1);
    expect(stderr).toContain('cannot be used with option');
    expect(stderr).not.toContain('Error getting tokens');
  });
});
