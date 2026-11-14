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

  const KEY =
    'P provisioning  A AI target  S SAML  O OIDC  F WS-Fed  T WS-Trust  B bookmark  * newest version, older ones exist';
  const cellsOf = (line) => line.split('│').map((cell) => cell.trim());
  const listOf = async (...args) =>
    frodo('app', 'template', 'list', ...args, '--templates', 'catalog.json');

  test('2: list --long reads the gzip file as the CDN serves it and has a row for each template with its newest version, a star when older versions exist, and a key line', async () => {
    const { code, out } = await frodo(
      'app',
      'template',
      'list',
      '--long',
      '--templates',
      'catalog.json.gz'
    );
    expect(code).toBe(0);
    const lines = out.trimEnd().split('\n');
    expect(cellsOf(lines[0])).toEqual([
      'Id',
      'Ver',
      'Updated',
      'Name',
      'Category',
      'Prov',
    ]);
    // the rows, a blank line, and the key; the fixture has templates no letter fits
    const rows = lines.slice(1, 1 + fixtureIds.length);
    expect(lines).toHaveLength(1 + fixtureIds.length + 2);
    expect(lines[lines.length - 2]).toBe('');
    expect(lines[lines.length - 1]).toBe(`${KEY}  ? not known`);
    const row = (id) => cellsOf(rows.find((line) => line.startsWith(id)));
    expect(row('azure.ad')).toEqual([
      'azure.ad',
      '3.4*',
      '2026-08-19',
      'Microsoft Entra',
      'Uncategorized',
      'P',
    ]);
    expect(row('saml')).toEqual([
      'saml',
      '1.3*',
      '2026-02-05',
      'SAML',
      'saml',
      'S',
    ]);
    expect(row('ai.target')).toEqual([
      'ai.target',
      '1.0',
      '2026-05-15',
      'AI Target (Demo)',
      'AI Services',
      'AP',
    ]);
    expect(
      row('bookmark').slice(1, 2).concat(row('bookmark').slice(5))
    ).toEqual(['1.0', 'B']);
    // 2.10 is newer than 2.3, and a date that is no date is printed as it is
    expect(row('ldap').slice(1, 3)).toEqual(['2.10*', 'sometime in 2023']);
    // nothing that fits says ?
    expect(row('odd')[5]).toBe('?');
    // no marker column, no plus without a tenant
    expect(out).not.toContain('+');
  });

  test('3: the table is as wide as its widest cells, and no row is wider or narrower, in the newest view and with every version', async () => {
    for (const args of [['--long'], ['--all-versions']]) {
      const { out } = await listOf(...args);
      const table = out.trimEnd().split('\n').slice(0, -2);
      const widths = new Set(table.map((line) => line.length));
      expect(widths.size).toBe(1);
      const columns = table.map((line) => line.split('│'));
      const widest = [0, 1, 2, 3, 4, 5].map((index) =>
        Math.max(...columns.map((cells) => cells[index].length))
      );
      expect([...widths][0]).toBe(widest.reduce((a, b) => a + b, 0) + 5);
      expect([...widths][0]).toBeLessThan(100);
    }
  });

  // set FRODO_TEST_LIVE_CATALOG to the decoded live catalog to check the real thing
  const liveCatalog = process.env.FRODO_TEST_LIVE_CATALOG;
  (liveCatalog ? test : test.skip)(
    '4: on the live catalog the table is 96 characters wide without a tenant, with 51 rows (125 with --all-versions) and no ?, and no id of a template looks like the id of a version',
    async () => {
      fs.copyFileSync(liveCatalog, path.join(home, 'live.json'));
      const run = (...args) =>
        frodo('app', 'template', 'list', ...args, '--templates', 'live.json');
      const { out } = await run('--long');
      const lines = out.trimEnd().split('\n');
      const table = lines.slice(0, 52);
      expect(table).toHaveLength(52);
      expect(Math.max(...table.map((line) => line.length))).toBe(96);
      expect(new Set(table.map((line) => line.length)).size).toBe(1);
      expect(lines.at(-1)).toBe(KEY);
      const prov = table.slice(1).map((line) => cellsOf(line)[5]);
      expect(new Set(prov)).toEqual(
        new Set(['P', 'AP', 'O', 'S', 'F', 'FT', 'B'])
      );
      // 21 of the 51 templates have older versions
      expect(
        table.slice(1).filter((line) => cellsOf(line)[1].endsWith('*'))
      ).toHaveLength(21);
      const ids = table.slice(1).map((line) => cellsOf(line)[0]);
      expect(ids.filter((id) => /^\d+_\d+-/.test(id))).toEqual([]);
      // every version has a row, newest first, and the three spellings are one table
      const all = await run('--all-versions');
      const allLines = all.out.trimEnd().split('\n');
      expect(allLines).toHaveLength(1 + 125 + 2);
      expect((await run('--long', '--all-versions')).out).toBe(all.out);
      const stars = allLines.filter((line) => cellsOf(line)[1]?.endsWith('*'));
      expect(stars).toHaveLength(21);
      // the star is on the first row of each of those templates
      for (const line of stars) {
        const id = cellsOf(line)[0];
        expect(allLines.find((other) => other.startsWith(id))).toBe(line);
      }
    }
  );

  test('5: --all-versions, --long --all-versions and --all-versions --long print the very same table, with a row for every version', async () => {
    const outputs = [];
    for (const args of [
      ['--all-versions'],
      ['--long', '--all-versions'],
      ['--all-versions', '--long'],
      ['-l', '--all-versions'],
    ]) {
      const { code, out } = await listOf(...args);
      expect(code).toBe(0);
      outputs.push(out);
    }
    expect(new Set(outputs).size).toBe(1);
    const lines = outputs[0].trimEnd().split('\n');
    expect(cellsOf(lines[0])).toEqual([
      'Id',
      'Ver',
      'Updated',
      'Name',
      'Category',
      'Prov',
    ]);
    // a row for each of the 11 versions, a blank line, the key
    expect(lines).toHaveLength(1 + 11 + 2);
    expect(lines.at(-2)).toBe('');
    expect(lines.at(-1)).toBe(`${KEY}  ? not known`);
    // not the table of the newest versions
    expect(outputs[0]).not.toBe((await listOf('--long')).out);
  });

  test('6: the ids come alphabetical and the versions of an id newest first, by the number and not by the date; the star is on the newest row of a template with older versions only', async () => {
    const { out } = await listOf('--all-versions');
    const rows = out.trimEnd().split('\n').slice(1, -2).map(cellsOf);
    expect(rows.map(([id, version]) => `${id} ${version}`)).toEqual([
      'ai.target 1.0',
      'azure.ad 3.4*',
      'azure.ad 3.3',
      'bookmark 1.0',
      'class.name 1.0',
      'escape 1.0',
      'ldap 2.10*',
      'ldap 2.3',
      'odd 1.0',
      'saml 1.3*',
      'saml 1.2',
    ]);
    // the dates of ldap point the other way: 2.10 is the oldest by its date
    expect(rows.filter(([id]) => id === 'ldap').map((row) => row[2])).toEqual([
      'sometime in 2023',
      '2024-06-03',
    ]);
  });

  test('7: the plain list has the id of each template and nothing else: no table, no mark, no key line', async () => {
    const { code, out } = await listOf();
    expect(code).toBe(0);
    expect(out.trim().split('\n')).toEqual(fixtureIds);
    for (const text of ['│', '*', '+', 'Prov', 'provisioning']) {
      expect(out).not.toContain(text);
    }
  });

  test('8: describe takes the newest version of the template -i names, whatever the case, and --json prints the whole entry of the version', async () => {
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

  test('9: -v describes another version, -n names the template by its display name, and --long adds the details', async () => {
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

  test('10: a failure exits 1: an unknown id, version or display name, the key of a version, a missing file, a file that is not a catalog', async () => {
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
      'Application template "3_4-azure-ad" not found. "frodo app template list" prints the ids. "3_4-azure-ad" looks like the id of a version, which is not an id: -i names the template and -v the version (for example -i azure.ad -v 3.4).'
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
      'Application template ldap has no version 2.1. Versions: 2.10, 2.3.'
    );
  });

  test('11: --templates and --channel cannot be combined, -i and -n cannot be combined, and one of -i and -n is required', async () => {
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

  test('12: download takes no connection: its help has no host, user or password', async () => {
    const { code, out } = await frodo('app', 'template', 'download', '--help');
    expect(code).toBe(0);
    expect(out).toContain('Usage: frodo app template download [options]');
    expect(out).not.toMatch(/\[host\]|--username|--password/);
    expect(out).toContain('-f, --file <file>');
  });
});

describe('frodo app template, with escapes in a catalog', () => {
  test('13: no command prints an escape sequence, the 8-bit CSI or a bidi override from any field of a template, and the template is still found by what is printed', async () => {
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
  test('14: download is refused with the advice to pass a file, and nothing is saved or kept', async () => {
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

  test('15: list without a file is refused the same way, and with a file it still works', async () => {
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

  test('16: describe from a file works air-gapped, from the CDN it does not', async () => {
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
