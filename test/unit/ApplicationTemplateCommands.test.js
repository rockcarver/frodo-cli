/**
 * The application template commands as a user runs them: the built CLI, a fresh
 * home folder, no tenant, no network (the catalog comes from a file). The ops
 * are tested in ApplicationTemplateOps.test.js with the library mocked; these
 * tests guard what only the real command tree shows:
 * - `list` and `describe` need no connection when no tenant is given, and
 *   `download` never takes one;
 * - `--templates` reads the JSON file and the gzip file as the CDN serves it,
 *   `-i` finds the version and the exit code tells a failure;
 * - `--templates` and `--channel` cannot be combined.
 * Run `npx tsdown` first: the test runs dist/launch.cjs.
 */
import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gzipSync } from 'zlib';

const LAUNCH = path.join(process.cwd(), 'dist', 'launch.cjs');

const catalog = {
  AppTemplates: {
    consumer: {
      Saml: {
        '1_2-saml': {
          id: 'saml',
          templateVersion: '1.2',
          displayName: 'SAML',
          templateType: 'SAML',
          description: 'SAML applications enable single sign-on.',
          dateUpdated: '09-09-2024',
        },
        '1_3-saml': {
          id: 'saml',
          templateVersion: '1.3',
          displayName: 'SAML',
          templateType: 'SAML',
          dateUpdated: '10-10-2025',
        },
      },
    },
    enterprise: {
      AzureAD: {
        '3_3-azure-ad': {
          id: 'azure.ad',
          templateVersion: '3.3',
          displayName: 'Azure AD',
          templateType: 'Enterprise',
          dateUpdated: '01-01-2025',
        },
      },
    },
  },
};

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
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe('frodo app template, without a tenant', () => {
  test('1: list prints the ids of the catalog file, needs no login and exits 0', async () => {
    const { code, out } = await frodo(
      'app',
      'template',
      'list',
      '--templates',
      'catalog.json'
    );
    expect(code).toBe(0);
    // the library sorts by template name, then by version
    expect(out.trim().split('\n')).toEqual([
      '3_3-azure-ad',
      '1_2-saml',
      '1_3-saml',
    ]);
  });

  test('2: list --long reads the gzip file as the CDN serves it and marks the newest version of a template', async () => {
    const { code, out } = await frodo(
      'app',
      'template',
      'list',
      '--long',
      '--templates',
      'catalog.json.gz'
    );
    expect(code).toBe(0);
    const row = (id) => out.split('\n').find((line) => line.startsWith(id));
    expect(row('1_2-saml')).not.toMatch(/yes/);
    expect(row('1_3-saml')).toMatch(/yes/);
    expect(row('3_3-azure-ad')).toContain('Azure AD');
  });

  test('3: describe finds a version by its id, whatever the case, and --json prints the whole template', async () => {
    const summary = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      '1_2-SAML',
      '--templates',
      'catalog.json'
    );
    expect(summary.code).toBe(0);
    expect(summary.out).toContain('Id: 1_2-saml');
    expect(summary.out).toContain('Newest version: no');
    const whole = await frodo(
      'app',
      'template',
      'describe',
      '-i',
      '1_2-saml',
      '--json',
      '--templates',
      'catalog.json'
    );
    expect(JSON.parse(whole.out)).toMatchObject({
      id: 'saml',
      templateVersion: '1.2',
    });
  });

  test('4: a failure exits 1: an unknown id, a missing file, a file that is not a catalog', async () => {
    fs.writeFileSync(path.join(home, 'bad.json'), '{"not":"a catalog"}');
    for (const args of [
      ['describe', '-i', 'nope', '--templates', 'catalog.json'],
      ['list', '--templates', 'missing.json'],
      ['list', '--templates', 'bad.json'],
    ]) {
      const { code, out, err } = await frodo('app', 'template', ...args);
      expect(code).toBe(1);
      expect(`${out}${err}`.length).toBeGreaterThan(0);
    }
  });

  test('5: --templates and --channel cannot be combined, and -i is required', async () => {
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
    const noId = await frodo(
      'app',
      'template',
      'describe',
      '--templates',
      'catalog.json'
    );
    expect(noId.code).toBe(1);
    expect(noId.err).toContain("required option '-i, --template-id");
  });

  test('6: download takes no connection: its help has no host, user or password', async () => {
    const { code, out } = await frodo('app', 'template', 'download', '--help');
    expect(code).toBe(0);
    expect(out).toContain('Usage: frodo app template download [options]');
    expect(out).not.toMatch(/\[host\]|--username|--password/);
    expect(out).toContain('-f, --file <file>');
  });
});

describe('frodo app template, with air-gapped mode on', () => {
  test('7: download is refused with the advice to pass a file, and nothing is saved or kept', async () => {
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

  test('8: list without a file is refused the same way, and with a file it still works', async () => {
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
    expect(served.out.trim().split('\n')).toEqual([
      '3_3-azure-ad',
      '1_2-saml',
      '1_3-saml',
    ]);
  });

  test('9: describe from a file works air-gapped, from the CDN it does not', async () => {
    const served = await airGapped(
      'app',
      'template',
      'describe',
      '-i',
      '1_3-saml',
      '--templates',
      'catalog.json'
    );
    expect(served.code).toBe(0);
    expect(served.out).toContain('Newest version: yes');
    const refused = await airGapped(
      'app',
      'template',
      'describe',
      '-i',
      '1_3-saml'
    );
    expect(refused.code).toBe(1);
  });
});
