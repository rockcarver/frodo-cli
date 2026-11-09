import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// `frodo settings config-manager-layout` shows or sets the layout that a NEW
// config-manager tree gets (decision record 0042). It only changes the per-user
// setting in ~/.frodo/Settings.json; a tree keeps the layout of its own marker.
// Each run gets its own HOME, so the settings of whoever runs the tests are never
// read or written.

const launchPath = path.resolve('dist/launch.cjs');
const suite = fs.existsSync(launchPath) ? describe : describe.skip;

suite('frodo settings config-manager-layout', () => {
  let home;
  let tree;
  let settingsPath;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-layout-home-'));
    tree = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-layout-tree-'));
    settingsPath = path.join(home, '.frodo', 'Settings.json');
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(tree, { recursive: true, force: true });
  });

  function run(args) {
    const result = spawnSync(
      process.execPath,
      [launchPath, 'settings', 'config-manager-layout', ...args],
      {
        encoding: 'utf8',
        timeout: 30000,
        input: '',
        cwd: tree,
        env: {
          ...process.env,
          HOME: home,
          NODE_OPTIONS: '',
          FRODO_NO_CACHE: 'true',
          FRODO_NO_UPDATE_CHECK: 'true',
        },
      }
    );
    return { ...result, output: `${result.stdout}${result.stderr}` };
  }

  const stored = () => JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  test('1: with no option it shows the default, folders, and writes nothing', () => {
    const result = run([]);

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      'A new config-manager tree gets the folders layout'
    );
    expect(result.output).toContain('frodo-config-manager.json');
    expect(fs.existsSync(settingsPath)).toBe(false);
  });

  test('2: --kind-paths is stored and shown by the next run, --folders sets it back', () => {
    const set = run(['--kind-paths']);
    expect(set.status).toBe(0);
    expect(set.output).toContain(
      'New config-manager trees will use the kind-paths layout.'
    );
    expect(stored().configManagerApplicationLayout).toBe('kind-paths');

    const show = run([]);
    expect(show.status).toBe(0);
    expect(show.output).toContain(
      'A new config-manager tree gets the kind-paths layout'
    );

    const back = run(['--folders']);
    expect(back.status).toBe(0);
    expect(stored().configManagerApplicationLayout).toBe('folders');
  });

  test('3: it keeps the other settings', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ guidedMode: true }));

    expect(run(['--kind-paths']).status).toBe(0);

    expect(stored()).toEqual({
      guidedMode: true,
      configManagerApplicationLayout: 'kind-paths',
    });
  });

  test('4: both options together are refused and nothing is written', () => {
    const result = run(['--folders', '--kind-paths']);

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/cannot be used with option/);
    expect(fs.existsSync(settingsPath)).toBe(false);
  });

  test('5: a tree is not touched: its own marker decides', () => {
    const marker = path.join(tree, 'frodo-config-manager.json');
    const content = JSON.stringify({
      applications: 'folders',
      formatVersion: 1,
    });
    fs.writeFileSync(marker, content);

    expect(run(['--kind-paths']).status).toBe(0);

    expect(fs.readFileSync(marker, 'utf8')).toBe(content);
    expect(fs.readdirSync(tree)).toEqual(['frodo-config-manager.json']);
  });
});
