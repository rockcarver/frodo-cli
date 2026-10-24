import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// `frodo conn set` with no field named has nothing to set: it lists the
// settable fields and leaves the profile alone, instead of logging in and
// saving it unchanged under a success message.

const host = 'https://openam-example.example.com/am';
const launchPath = path.resolve('dist/launch.cjs');
const suite = fs.existsSync(launchPath) ? describe : describe.skip;

suite('frodo conn set with no field named', () => {
  let dir;
  let profilesPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-set-fields-'));
    profilesPath = path.join(dir, 'Connections.json');
    fs.writeFileSync(
      profilesPath,
      JSON.stringify({
        [host]: { tenant: host, alias: 'x', deploymentType: 'cloud' },
      })
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function run(args) {
    const result = spawnSync(process.execPath, [launchPath, 'conn', 'set', ...args], {
      encoding: 'utf8',
      timeout: 30000,
      input: '',
      env: {
        ...process.env,
        HOME: dir,
        NODE_OPTIONS: '',
        FRODO_NO_CACHE: 'true',
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
      },
    });
    return { ...result, output: `${result.stdout}${result.stderr}` };
  }

  test('1: with a host it lists the fields, says nothing changed and does not save', () => {
    const before = fs.readFileSync(profilesPath, 'utf8');

    const result = run(['x']);

    expect(result.status).toBe(0);
    // the host as it was typed: here the alias
    expect(result.output).toContain('No field was named, so x is unchanged.');
    expect(result.output).toContain('--preferred-credential');
    expect(result.output).not.toContain('Saved connection profile');
    expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
  });

  test('2: with no host it lists the fields', () => {
    const before = fs.readFileSync(profilesPath, 'utf8');

    const result = run([]);

    expect(result.status).toBe(0);
    expect(result.output).toContain('Settable connection profile fields:');
    expect(result.output).toContain('--preferred-credential');
    expect(result.output).not.toContain('No field was named');
    expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
  });

  test('3: naming a field still changes it and saves the profile', () => {
    const result = run(['x', '--preferred-credential', 'svcacct', '--no-validate']);

    expect(result.output).toContain('Saved connection profile');
    expect(JSON.parse(fs.readFileSync(profilesPath, 'utf8'))[host].defaultCredential).toBe('svcacct');
  });
});
