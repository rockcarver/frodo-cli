import { execFileSync, spawn, spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';

// The air-gap switch of the built CLI (cli#1307): `frodo settings airgap
// show|enable|disable`, the environment variable FRODO_AIRGAPPED, and what the
// switch does to the update check. Every run gets its own empty home: nothing
// here touches the real one.

const binaryPath = ensureFrodoArtifact();

let directory;
let env;
let file;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-air-gap-cli-'));
  env = {
    ...process.env,
    HOME: directory,
    USERPROFILE: directory,
    FRODO_CONFIG_PATH: path.join(directory, '.frodo'),
    FRODO_NO_PROMPT: '1',
  };
  delete env.FRODO_AIRGAPPED;
  delete env.FRODO_NO_UPDATE_CHECK;
  delete env.HTTPS_PROXY;
  delete env.HTTP_PROXY;
  file = path.join(env.FRODO_CONFIG_PATH, 'AirGap.json');
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

function run(...args) {
  return execFileSync(binaryPath, args, {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('show, enable and disable report the persisted state and the effective sources', () => {
  expect(run('settings', 'airgap', 'show')).toContain(
    'Air-gapped mode is disabled. Source: setting (default: disabled).'
  );
  expect(fs.existsSync(file)).toBe(false);

  env.FRODO_AIRGAPPED = '1';
  expect(run('settings', 'airgap', 'show')).toContain(
    'Air-gapped mode is enabled. Source: environment variable (FRODO_AIRGAPPED).'
  );
  expect(fs.existsSync(file)).toBe(false);

  expect(run('settings', 'airgap', 'enable')).toContain(
    'Source: setting and environment variable (FRODO_AIRGAPPED)'
  );
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ enabled: true });

  delete env.FRODO_AIRGAPPED;
  expect(run('settings', 'airgap', 'show')).toContain(
    'Air-gapped mode is enabled. Source: setting.'
  );

  env.FRODO_AIRGAPPED = 'on';
  expect(run('settings', 'airgap', 'disable')).toContain(
    'Air-gapped mode is enabled. Source: environment variable (FRODO_AIRGAPPED)'
  );
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
    enabled: false,
  });

  delete env.FRODO_AIRGAPPED;
  expect(run('settings', 'airgap', 'show')).toContain(
    'Air-gapped mode is disabled.'
  );
});

test('an invalid or disabled setting means off and is not rewritten, and show still succeeds', () => {
  fs.mkdirSync(env.FRODO_CONFIG_PATH);
  for (const contents of ['not json', '{"enabled":"true"}', '[]']) {
    fs.writeFileSync(file, contents);
    expect(run('settings', 'airgap', 'show')).toContain(
      'Air-gapped mode is disabled.'
    );
    expect(fs.readFileSync(file, 'utf8')).toBe(contents);
  }
});

test.each(['enable', 'disable'])(
  'failure to persist reports an error and exits nonzero (%s)',
  (verb) => {
    fs.mkdirSync(file, { recursive: true });
    const result = spawnSync(binaryPath, ['settings', 'airgap', verb], {
      env,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('EISDIR');
  }
);

test('the setting lives in the directory FRODO_CONFIG_PATH names, not in ~/.frodo', () => {
  env.FRODO_CONFIG_PATH = path.join(directory, 'custom-config');
  run('settings', 'airgap', 'enable');
  expect(
    JSON.parse(
      fs.readFileSync(path.join(env.FRODO_CONFIG_PATH, 'AirGap.json'), 'utf8')
    )
  ).toEqual({ enabled: true });
  expect(fs.existsSync(path.join(env.HOME, '.frodo', 'AirGap.json'))).toBe(
    false
  );
});

test('the update check says that air-gapped mode is the reason it is off; its own switches keep their meaning', () => {
  expect(run('settings', 'update-check', 'show')).toContain(
    'Automatic update check is enabled.'
  );
  env.FRODO_AIRGAPPED = '1';
  expect(run('settings', 'update-check', 'show')).toContain(
    'Automatic update check is disabled. Source: air-gapped mode (environment variable (FRODO_AIRGAPPED)).'
  );
  delete env.FRODO_AIRGAPPED;
  run('settings', 'airgap', 'enable');
  expect(run('settings', 'update-check', 'show')).toContain(
    'Automatic update check is disabled. Source: air-gapped mode (setting).'
  );
  // the update-check switches still work on their own and are named too
  env.FRODO_NO_UPDATE_CHECK = '1';
  expect(run('settings', 'update-check', 'show')).toContain(
    'environment variable (FRODO_NO_UPDATE_CHECK) and air-gapped mode (setting)'
  );
  run('settings', 'airgap', 'disable');
  delete env.FRODO_NO_UPDATE_CHECK;
  expect(run('settings', 'update-check', 'show')).toContain(
    'Automatic update check is enabled.'
  );
});

test.each(['-v', '--version'])(
  '%s still prints the installed versions in air-gapped mode, and the version cache is left alone',
  (flag) => {
    env.FRODO_AIRGAPPED = '1';
    // the version cache lives in ~/.frodo, and HOME is the empty home of this test
    fs.mkdirSync(path.join(env.HOME, '.frodo'), { recursive: true });
    const cachePath = path.join(env.HOME, '.frodo', 'Versions.json');
    const cache = JSON.stringify({
      last_checked: Math.floor(Date.now() / 1000),
      github: '999.0.0',
      npm: '999.0.0',
    });
    fs.writeFileSync(cachePath, cache);
    const output = run(flag);
    expect(output).toContain('cli: v');
    expect(output).toContain('lib: v');
    expect(output).toContain('node: v');
    expect(output).not.toContain('Newer version(s) available');
    expect(output).not.toContain('A new version of frodo is available');
    expect(fs.readFileSync(cachePath, 'utf8')).toBe(cache);
  }
);

/**
 * A proxy that refuses every CONNECT and records the host it was asked for:
 * what reaches it is what frodo tried to request.
 */
async function withRecordingProxy(body) {
  const attempts = [];
  const proxy = http.createServer((req, res) => {
    attempts.push(req.url);
    res.writeHead(502).end();
  });
  proxy.on('connect', (req, socket) => {
    attempts.push(req.url);
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  try {
    return await body(`http://127.0.0.1:${proxy.address().port}`, attempts);
  } finally {
    await new Promise((resolve) => proxy.close(resolve));
  }
}

function runAsync(args, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, args, {
      env: { ...env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (status) => resolve({ status, out }));
  });
}

describe('no request leaves the machine while the switch is on', () => {
  test('control: with the switch off the update check does reach for GitHub and npm', async () => {
    await withRecordingProxy(async (proxyUrl, attempts) => {
      const result = await runAsync(['-v'], { HTTPS_PROXY: proxyUrl });
      expect(result.status).toBe(0);
      expect(attempts.join(' ')).toMatch(/api\.github\.com/);
      expect(attempts.join(' ')).toMatch(/registry\.npmjs\.org/);
    });
  });

  test.each([
    ['the environment variable', { FRODO_AIRGAPPED: '1' }, false],
    ['the persisted setting', {}, true],
  ])(
    '%s: no attempt at all, and the versions are still printed',
    async (_name, extraEnv, persist) => {
      if (persist) run('settings', 'airgap', 'enable');
      await withRecordingProxy(async (proxyUrl, attempts) => {
        const result = await runAsync(['-v'], {
          HTTPS_PROXY: proxyUrl,
          HTTP_PROXY: proxyUrl,
          ...extraEnv,
        });
        expect(result.status).toBe(0);
        expect(result.out).toContain('cli: v');
        expect(attempts).toEqual([]);
      });
    }
  );
});
