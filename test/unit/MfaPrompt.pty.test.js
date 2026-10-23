import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');
const fakeAmPath = fileURLToPath(
  new URL('../utils/FakeAm.mjs', import.meta.url)
);

/**
 * The MFA code prompt on a real terminal (frodo-cli#887, frodo-lib#783):
 * `frodo conn save <host> <user> <password>` against a tenant that asks for a
 * verification code failed with `EAGAIN: resource temporarily unavailable,
 * read` right after "Enter verification code:", because the prompt read fd 0
 * synchronously and something had already touched `process.stdin` (which
 * makes libuv set fd 0 non-blocking).
 *
 * This drives the REAL CLI of this checkout through a pseudo-terminal
 * against a fake AM (test/utils/FakeAm.mjs, a separate process: the PTY
 * driver blocks this process's event loop) that scripts the journey
 * user/password -> verification code -> session. No tenant, no secrets, no
 * master key; a temporary HOME keeps it away from real profiles.
 *
 * Needs python3 with `pty` (Linux, macOS); skipped on Windows, where the
 * harness has no PTY.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const TIMEOUT = 120000;
const CODE = '123456';
// The terminal-background query the CLI sends when it auto-detects the theme
// (OSC 11). It is one thing that touches process.stdin; the bug does not need it.
const OSC_11_QUERY = '\x1b]11;?';

async function startFakeAm(recordPath) {
  const child = cp.spawn(process.execPath, [fakeAmPath], {
    env: { ...process.env, FAKE_AM_RECORD: recordPath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = out.match(/PORT=(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      reject(new Error(`fake AM exited early with code ${code}`))
    );
  });
  return { port, stop: () => child.kill('SIGTERM') };
}

/** `frodo ...` outside a terminal, in the given home (for pre-setting preferences). */
function frodoQuiet(home, args) {
  cp.execFileSync(binaryPath, args, {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      FRODO_TEST: '',
      FRODO_NO_CACHE: 'true',
      NODE_OPTIONS: '',
    },
    stdio: 'pipe',
  });
}

suite('MFA code prompt on a real terminal', () => {
  let home;
  let recordPath;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = createShellTestHome();
    recordPath = path.join(
      os.tmpdir(),
      `frodo-fake-am-${process.pid}-${Date.now()}.jsonl`
    );
    fakeAm = await startFakeAm(recordPath);
  });

  afterEach(() => {
    fakeAm.stop();
    removeShellTestHome(home);
    fs.rmSync(recordPath, { force: true });
  });

  function typeTheCode() {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      args: [
        'conn',
        'save',
        `http://127.0.0.1:${fakeAm.port}/am`,
        'someone@example.com',
        'secret',
      ],
      actions: [
        {
          type: 'wait_plain',
          regex: 'Enter verification code:',
          timeoutMs: 30000,
        },
        // The failure was immediate, so a prompt that survives this pause is
        // really waiting for input.
        { type: 'sleep', ms: 800 },
        { type: 'send_line', text: CODE },
        // The fake AM ends the journey with a failing session lookup, so the
        // CLI's last words are the same whether or not the code got through.
        { type: 'wait_plain', regex: 'Error getting tokens', timeoutMs: 30000 },
        { type: 'sleep', ms: 300 },
      ],
    });
  }

  function authenticatePosts() {
    return fs
      .readFileSync(recordPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((r) => r.method === 'POST' && r.url.includes('/authenticate'));
  }

  function expectCodeReachedTheTenant(result) {
    expect(result.plainOutput).toContain('Enter verification code:');
    expect(result.plainOutput).not.toContain('EAGAIN');
    // user/password step, then the verification code step, then the code
    const posts = authenticatePosts();
    expect(posts).toHaveLength(3);
    const codeStep = JSON.parse(posts[2].body);
    expect(codeStep.callbacks[0].input[0].value).toBe(CODE);
  }

  test(
    'accepts the code typed at the prompt',
    () => {
      expectCodeReachedTheTenant(typeTheCode());
    },
    TIMEOUT
  );

  test(
    'does not depend on the terminal-background query: still works with auto-detection off and a theme persisted',
    () => {
      frodoQuiet(home, ['settings', 'theme', 'autodetect', 'off']);
      frodoQuiet(home, ['settings', 'theme', 'background', 'dark']);
      const result = typeTheCode();
      expect(result.rawOutput).not.toContain(OSC_11_QUERY);
      expectCodeReachedTheTenant(result);
    },
    TIMEOUT
  );
});
