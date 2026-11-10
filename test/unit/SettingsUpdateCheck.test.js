import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';

const binaryPath = ensureFrodoArtifact();

let directory;
let env;
let file;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-update-check-cli-'));
  env = {
    ...process.env,
    HOME: directory,
    USERPROFILE: directory,
    FRODO_CONFIG_PATH: path.join(directory, '.frodo'),
    FRODO_NO_UPDATE_CHECK: '1',
    FRODO_NO_PROMPT: '1',
  };
  file = path.join(env.FRODO_CONFIG_PATH, 'UpdateCheck.json');
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

function run(...args) {
  return execFileSync(binaryPath, args, { env, encoding: 'utf8' });
}

test('show, disable and enable report persisted state and effective sources', () => {
  expect(run('settings', 'update-check', 'show')).toContain(
    'Source: environment variable (FRODO_NO_UPDATE_CHECK)'
  );
  expect(fs.existsSync(file)).toBe(false);

  expect(run('settings', 'update-check', 'disable')).toContain(
    'Source: setting and environment variable (FRODO_NO_UPDATE_CHECK)'
  );
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ enabled: false });

  delete env.FRODO_NO_UPDATE_CHECK;
  expect(run('settings', 'update-check', 'show')).toContain(
    'Automatic update check is disabled. Source: setting.'
  );

  env.FRODO_NO_UPDATE_CHECK = '1';
  expect(run('settings', 'update-check', 'enable')).toContain(
    'Automatic update check is disabled. Source: environment variable'
  );
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ enabled: true });
});

test.each(['-v', '--version'])(
  '%s still prints installed versions with only the persisted opt-out',
  (flag) => {
    run('settings', 'update-check', 'disable');
    delete env.FRODO_NO_UPDATE_CHECK;
    const contents = fs.readFileSync(file, 'utf8');
    const output = run(flag);
    expect(output).toContain('cli: v');
    expect(output).toContain('lib: v');
    expect(output).toContain('node: v');
    expect(output).not.toContain('Newer version(s) available');
    expect(fs.readFileSync(file, 'utf8')).toBe(contents);
    expect(fs.existsSync(path.join(env.HOME, '.frodo', 'Versions.json'))).toBe(
      false
    );
  }
);

test('enabled and invalid settings report checks on without rewriting the setting', () => {
  fs.mkdirSync(env.FRODO_CONFIG_PATH);
  fs.writeFileSync(
    path.join(env.HOME, '.frodo', 'Versions.json'),
    JSON.stringify({
      last_checked: Math.floor(Date.now() / 1000),
      github: '0.0.0',
      npm: '0.0.0',
    })
  );
  delete env.FRODO_NO_UPDATE_CHECK;
  expect(run('settings', 'update-check', 'show')).toContain(
    'Automatic update check is enabled. Source: setting'
  );
  expect(fs.existsSync(file)).toBe(false);
  fs.writeFileSync(file, 'not json');
  expect(run('settings', 'update-check', 'show')).toContain(
    'Automatic update check is enabled. Source: setting'
  );
  expect(fs.readFileSync(file, 'utf8')).toBe('not json');
});

test('failure to persist reports an error and exits nonzero', () => {
  fs.mkdirSync(file, { recursive: true });
  const result = spawnSync(
    binaryPath,
    ['settings', 'update-check', 'disable'],
    { env, encoding: 'utf8' }
  );
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('EISDIR');
});
