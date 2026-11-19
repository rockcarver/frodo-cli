import cp from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

const exec = promisify(cp.execFile);

// Runs this checkout's build, never a `frodo` found on PATH (cli record 0011).
// Skipped on Windows: the CLI binary shim is a shell script.
const suite = process.platform === 'win32' ? describe.skip : describe;

suite('async command failures set the exit code', () => {
  let home;
  let recordPath;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'async-command-failure-'));
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      journey: 'password',
      recordPath,
      failRequests: [
        { method: 'GET', path: '/realm-config/authentication' },
        { method: 'PUT', path: '/realm-config/authentication' },
        { method: 'DELETE', path: '/keys/' },
      ],
      logApiKeys: [{ api_key_id: 'test-key', name: 'test-key' }],
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it.each([
    [
      'authn export',
      ['authn', 'export'],
      'GET',
      '/realm-config/authentication',
    ],
    [
      'authn import',
      ['authn', 'import'],
      'PUT',
      '/realm-config/authentication',
    ],
    [
      'log key delete -i',
      ['log', 'key', 'delete', '-i', 'test-key'],
      'DELETE',
      '/keys/test-key',
    ],
    [
      'log key delete -a',
      ['log', 'key', 'delete', '-a', '-y'],
      'DELETE',
      '/keys/test-key',
    ],
  ])(
    '%s exits 1 after an HTTP 500',
    async (_name, command, method, endpoint) => {
      const isAuthn = command[0] === 'authn';
      const file = path.join(home, 'settings.json');
      fs.writeFileSync(file, JSON.stringify({ authentication: {} }));
      const args = [
        ...command,
        `http://127.0.0.1:${fakeAm.port}/am`,
        ...(isAuthn ? ['alpha'] : []),
        'test-user',
        'test-password',
        '-m',
        isAuthn ? 'classic' : 'cloud',
        '--no-prompt',
        ...(isAuthn ? ['-f', file] : []),
      ];
      let result;
      try {
        result = await exec(binaryPath, args, {
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'connections.json'),
            FRODO_NO_CACHE: 'true',
            FRODO_MOCK: '',
          },
          timeout: 30000,
        });
      } catch (error) {
        result = error;
      }
      const requests = fs
        .readFileSync(recordPath, 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
      expect(
        requests.some(
          (request) =>
            request.method === method && request.url.includes(endpoint)
        )
      ).toBe(true);
      expect(`${result.stdout}${result.stderr}`).toContain(
        'fake tenant operation failed'
      );
      expect(result.code).toBe(1);
    }
  );
});
