/**
 * The application template commands as a user runs them: the built CLI, a fresh
 * home folder, no tenant, no network (the catalog comes from a file). The ops
 * are tested in ApplicationTemplateOps.test.js with the library mocked; these
 * tests guard what only the real command tree shows:
 * - `list` and `describe` need no connection when no tenant is given, and
 *   `download` never takes one;
 * - `--templates` reads the JSON file and the gzip file as the CDN serves it;
 * - `list` shows the newest version of each template, `--all-versions` every
 *   version; `describe` finds a template by `-i` (id) or `-n` (display name),
 *   describes the newest version unless `-v` names another, and does not know
 *   the key the catalog keeps a version under;
 * - the exit code tells a failure, and `-i` and `-n` cannot be combined, nor
 *   `--templates` and `--channel`.
 * Run `npx tsdown` first: the test runs dist/launch.cjs.
 */
import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import {
  fixtureCatalog,
  fixtureIds,
  POISONABLE_FIELDS,
  poisonFixture,
  UNSAFE_OUTPUT,
} from '../utils/ApplicationTemplateFixtures.js';

const LAUNCH = path.join(process.cwd(), 'dist', 'launch.cjs');

const catalog = fixtureCatalog;

let home;

/** Runs the built CLI in the fresh home and answers its output and exit code. */
const runFrodo = (extraEnv, args) =>
  new Promise((resolve) => {
    cp.execFile(
      process.execPath,
      [LAUNCH, ...args],
      {
        cwd: home,
        env: {
          PATH: process.env.PATH,
          HOME: home,
          FRODO_NO_UPDATE_CHECK: '1',
          NO_COLOR: '1',
          ...extraEnv,
        },
      },
      (error, stdout, stderr) =>
        resolve({
          code: error ? (error.code ?? 1) : 0,
          out: stdout,
          err: stderr,
        })
    );
  });

const frodo = (...args) => runFrodo({}, args);
/** The same run with air-gapped mode on (cli#1307): no request to a host that was not named. */
const airGapped = (...args) => runFrodo({ FRODO_AIRGAPPED: '1' }, args);

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-template-cmds-'));
  fs.writeFileSync(path.join(home, 'catalog.json'), JSON.stringify(catalog));
  fs.writeFileSync(
    path.join(home, 'catalog.json.gz'),
    gzipSync(gzipSync(JSON.stringify(catalog)))
  );
  // the saml template with an escape that starts a color, the 8-bit CSI and a
  // bidi override in every field the library hands over without a check
  fs.writeFileSync(
    path.join(home, 'poisoned.json'),
    JSON.stringify(poisonFixture(POISONABLE_FIELDS))
  );
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe('frodo app template, without a tenant', () => {
  test('1: list prints the id of each template of the catalog file once, needs no login and exits 0', async () => {
    const { code, out } = await frodo(
      'app',
      'template',
      'list',
      '--templates',
      'catalog.json'
    );
    expect(code).toBe(0);
    // the library sorts by template name; the newest version is listed, no key
    expect(out.trim().split('\n')).toEqual(fixtureIds);
  });

  test('2: list --long reads the gzip file as the CDN serves it and has a row for each template with its newest version and the number of versions', async () => {
    const { code, out } = await frodo(
      'app',
      'template',
      'list',
      '--long',
      '--templates',
      'catalog.json.gz'
    );
    expect(code).toBe(0);
    const lines = out.trim().split('\n');
    expect(lines[0]).toMatch(
      /^Id +│Display name +│Category +│Provides +│Connector +│Latest│Versions│Updated *$/
    );
    expect(lines).toHaveLength(1 + fixtureIds.length);
    const row = (id) => lines.find((line) => line.startsWith(id));
    const cells = (line) => line.split('│').map((cell) => cell.trim());
    expect(cells(row('azure.ad'))).toEqual([
      'azure.ad',
      'Microsoft Entra',
      'Uncategorized',
      'provisioning',
      'MSGraphAPI',
      '3.4',
      '2',
      '2026-08-19',
    ]);
    expect(cells(row('saml'))[3]).toBe('SSO: SAML');
    expect(cells(row('ai.target'))[3]).toBe('target+provisioning');
    // 2.10 is newer than 2.3, and a date that is no date is printed as it is
    expect(cells(row('ldap')).slice(5)).toEqual([
      '2.10',
      '2',
      'sometime in 2023',
    ]);
  });

  test('3: list --all-versions has an id and a version for each version, with the newest marked', async () => {
    const { code, out } = await frodo(
      'app',
      'template',
      'list',
      '--all-versions',
      '--templates',
      'catalog.json'
    );
    expect(code).toBe(0);
    const lines = out.trim().split('\n');
    expect(lines[0].split('│').map((cell) => cell.trim())).toEqual([
      'Id',
      'Version',
      'Newest',
    ]);
    const rows = lines
      .slice(1)
      .map((line) => line.split('│').map((cell) => cell.trim()));
    expect(rows.filter(([id]) => id === 'azure.ad')).toEqual([
      ['azure.ad', '3.3', ''],
      ['azure.ad', '3.4', 'yes'],
    ]);
    expect(rows.filter(([id]) => id === 'ldap').map((row) => row[1])).toEqual([
      '2.3',
      '2.10',
    ]);
    expect(out).not.toMatch(/\d_\d+-/);
  });

  test('4: describe takes the newest version of the template -i names, whatever the case, and --json prints the whole entry of the version', async () => {
    const newest = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      'AZURE-AD',
      '--templates',
      'catalog.json'
    );
    expect(newest.code).toBe(0);
    expect(newest.out).toContain('Id: azure.ad');
    expect(newest.out).toContain('Version: 3.4 (newest)');
    expect(newest.out).toContain('Basic configuration (2, * required)');
    const older = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      'azure.ad',
      '-v',
      '3.3',
      '--json',
      '--templates',
      'catalog.json'
    );
    expect(JSON.parse(older.out)).toMatchObject({
      id: 'azure.ad',
      templateVersion: '3.3',
    });
  });

  test('5: -v describes another version, -n names the template by its display name, and --long adds the details', async () => {
    const version = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      'azure.ad',
      '-v',
      '3.3',
      '--templates',
      'catalog.json'
    );
    expect(version.code).toBe(0);
    expect(version.out).toContain('Version: 3.3 (the newest is 3.4)');
    const named = await frodo(
      'app',
      'template',
      'describe',
      '-n',
      'microsoft entra',
      '--long',
      '--templates',
      'catalog.json'
    );
    expect(named.code).toBe(0);
    expect(named.out).toContain('Id: azure.ad');
    expect(named.out).toContain('Properties of User');
    expect(named.out).toContain('memberOf');
    expect(named.out).not.toMatch(/\d_\d+-/);
  });

  test('6: a failure exits 1: an unknown id, version or display name, the key of a version, a missing file, a file that is not a catalog', async () => {
    fs.writeFileSync(path.join(home, 'bad.json'), '{"not":"a catalog"}');
    for (const args of [
      ['describe', '-i', 'nope', '--templates', 'catalog.json'],
      [
        'describe',
        '-i',
        'azure.ad',
        '-v',
        '9.9',
        '--templates',
        'catalog.json',
      ],
      ['describe', '-n', 'Nope', '--templates', 'catalog.json'],
      ['describe', '-i', '3_4-azure-ad', '--templates', 'catalog.json'],
      ['list', '--templates', 'missing.json'],
      ['list', '--templates', 'bad.json'],
    ]) {
      const { code, out, err } = await frodo('app', 'template', ...args);
      expect(code).toBe(1);
      expect(`${out}${err}`.length).toBeGreaterThan(0);
    }
    const key = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      '3_4-azure-ad',
      '--templates',
      'catalog.json'
    );
    expect(`${key.out}${key.err}`).toContain(
      'Application template "3_4-azure-ad" not found'
    );
    const version = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      'ldap',
      '-v',
      '2.1',
      '--templates',
      'catalog.json'
    );
    expect(`${version.out}${version.err}`).toContain(
      'Application template ldap has no version 2.1. Versions: 2.3, 2.10.'
    );
  });

  test('7: --templates and --channel cannot be combined, -i and -n cannot be combined, and one of -i and -n is required', async () => {
    const both = await frodo(
      'app',
      'template',
      'list',
      '--templates',
      'catalog.json',
      '--channel',
      'development'
    );
    expect(both.code).toBe(1);
    expect(both.err).toContain('cannot be used with option');
    const twoNames = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      'saml',
      '-n',
      'SAML',
      '--templates',
      'catalog.json'
    );
    expect(twoNames.code).toBe(1);
    expect(twoNames.err).toContain('cannot be used with option');
    for (const args of [
      ['--templates', 'catalog.json'],
      ['-v', '3.3', '--templates', 'catalog.json'],
    ]) {
      const none = await frodo('app', 'template', 'describe', ...args);
      expect(none.code).toBe(1);
      expect(none.err).toContain("one of '-i, --template-id");
    }
  });

  test('8: download takes no connection: its help has no host, user or password', async () => {
    const { code, out } = await frodo('app', 'template', 'download', '--help');
    expect(code).toBe(0);
    expect(out).toContain('Usage: frodo app template download [options]');
    expect(out).not.toMatch(/\[host\]|--username|--password/);
    expect(out).toContain('-f, --file <file>');
  });
});

describe('frodo app template, with escapes in a catalog', () => {
  test('9: no command prints an escape sequence, the 8-bit CSI or a bidi override from any field of a template, and the template is still found by what is printed', async () => {
    // what the user sees (and types) is the text without the characters
    const id = 'saml [31m';
    const name = 'SAML [31m';
    const commands = [
      ['list'],
      ['list', '--long'],
      ['list', '--all-versions'],
      ['list', '--long', '--all-versions'],
      ['describe', '-i', id],
      ['describe', '-i', id, '--long'],
      ['describe', '-n', name, '--long'],
      ['describe', '-i', id, '-v', 'no such version'],
    ];
    for (const args of commands) {
      const { code, out, err } = await frodo(
        'app',
        'template',
        ...args,
        '--templates',
        'poisoned.json'
      );
      expect(`${out}${err}`).not.toMatch(UNSAFE_OUTPUT);
      // the failure on purpose is the last command
      expect(code).toBe(args.includes('no such version') ? 1 : 0);
    }
    const described = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      id,
      '--templates',
      'poisoned.json'
    );
    expect(described.out).toContain('Id: saml [31m');
    expect(described.out).toContain('Group: Sa [31m ml (consumer)');
  });
});

describe('frodo app template, with air-gapped mode on', () => {
  test('10: download is refused with the advice to pass a file, and nothing is saved or kept', async () => {
    const { code, out, err } = await airGapped('app', 'template', 'download');
    expect(code).toBe(1);
    const text = `${out}${err}`;
    expect(text).toContain('Air-gapped mode is on');
    // the advice of the switch and the advice of the command
    expect(text).toContain('FRODO_AIRGAPPED');
    expect(text).toContain('--templates <file>');
    expect(fs.existsSync(path.join(home, 'appTemplates.json'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.frodo', 'AppTemplates'))).toBe(
      false
    );
  });

  test('11: list without a file is refused the same way, and with a file it still works', async () => {
    const refused = await airGapped('app', 'template', 'list');
    expect(refused.code).toBe(1);
    expect(`${refused.out}${refused.err}`).toContain('--templates <file>');
    const served = await airGapped(
      'app',
      'template',
      'list',
      '--templates',
      'catalog.json'
    );
    expect(served.code).toBe(0);
    expect(served.out.trim().split('\n')).toEqual(fixtureIds);
  });

  test('12: describe from a file works air-gapped, from the CDN it does not', async () => {
    const served = await airGapped(
      'app',
      'template',
      'describe',
      '-i',
      'saml',
      '--templates',
      'catalog.json'
    );
    expect(served.code).toBe(0);
    expect(served.out).toContain('Version: 1.3 (newest)');
    const refused = await airGapped(
      'app',
      'template',
      'describe',
      '-i',
      'saml'
    );
    expect(refused.code).toBe(1);
  });
});
