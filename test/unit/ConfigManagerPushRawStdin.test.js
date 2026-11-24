import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `frodo config-manager push raw --stdin` reads its configuration from a
 * pipe. It used to read it with `readJsonFile(process.stdin.fd)`, a
 * synchronous read of fd 0, and once anything in the process has touched
 * `process.stdin` (the first access makes libuv switch fd 0 to non-blocking)
 * that read throws EAGAIN whenever the producer of the pipe is slower than
 * the CLI: `Error reading file 0 / EAGAIN: resource temporarily
 * unavailable, read`. Same root cause as the MFA code prompt
 * (frodo-cli#887, MfaPrompt.pty.test.js); the fix is the shared reader in
 * src/utils/StdinSync.ts.
 *
 * This drives the REAL CLI of this checkout against a fake AM
 * (test/utils/FakeAm.mjs, journey `password`: a login that succeeds, in a
 * separate process) and feeds the pipe from this process, slowly. The CLI
 * logs in, reads and parses the config, and then stops at a deterministic
 * message from the import itself ("URL paths that start with x are not
 * supported" for the path `x/y`): that message is how these tests know the
 * JSON got through. No tenant, no secrets, no master key, no terminal; a
 * temporary HOME and TMPDIR keep it away from real profiles and let it check
 * that nothing is left behind.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;
// The producer starts writing only after the CLI has logged in and is
// waiting on stdin, which takes a couple of seconds; this leaves a margin.
const SLOW_MS = 4500;
const IMPORT_REACHED = 'Error in importRawConfig with relative url: x/y';

suite('config-manager push raw --stdin on a pipe', () => {
  let home;
  let tmp;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-rawstdin-home-'));
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-rawstdin-tmp-'));
    fakeAm = await startFakeAm({ journey: 'password' });
  });

  afterEach(() => {
    fakeAm.stop();
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /**
   * Runs the command with `pieces` written to its stdin, each after its
   * delay (ms since the start), then the pipe is closed.
   */
  function pushRaw(pieces) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          'config-manager',
          'push',
          'raw',
          '--stdin',
          '--path',
          'x/y',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'root',
          'someone@example.com',
          'secret',
        ],
        {
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            TMPDIR: tmp,
            TMP: tmp,
            TEMP: tmp,
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            NODE_OPTIONS: '',
            NO_COLOR: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
      child.stdin.on('error', () => {}); // the CLI may exit before the last write
      const last = Math.max(...pieces.map((piece) => piece.afterMs));
      for (const { afterMs, data } of pieces) {
        setTimeout(() => child.stdin.write(data), afterMs);
      }
      setTimeout(() => child.stdin.end(), last + 50);
    });
  }

  const noLeftovers = () => expect(fs.readdirSync(tmp)).toEqual([]);

  it(
    'waits for a producer that is slower than the CLI instead of failing with EAGAIN',
    async () => {
      const { output } = await pushRaw([
        { afterMs: SLOW_MS, data: '{"_id":"x","value":1}' },
      ]);
      expect(output).not.toMatch(/EAGAIN|Error reading file/);
      expect(output).toContain(IMPORT_REACHED);
      noLeftovers();
    },
    TIMEOUT
  );

  it(
    'reads a pipe that already holds the whole config',
    async () => {
      const { output } = await pushRaw([
        { afterMs: 0, data: '{"_id":"x","value":1}' },
      ]);
      expect(output).not.toMatch(/EAGAIN|Error reading file/);
      expect(output).toContain(IMPORT_REACHED);
      noLeftovers();
    },
    TIMEOUT
  );

  it(
    'reads a large config that arrives in slow pieces, even when a multi-byte character is split between them',
    async () => {
      const body = Buffer.from(
        JSON.stringify({ _id: 'x', text: 'é'.repeat(100000) }),
        'utf8'
      );
      // Cut inside a two-byte character and again after 64 KiB.
      const cuts = [SLOW_MS, SLOW_MS + 700, SLOW_MS + 1400];
      const first = body.indexOf(0xc3, 1000) + 1; // between the bytes of an é
      const second = 70000;
      const pieces = [
        { afterMs: cuts[0], data: body.subarray(0, first) },
        { afterMs: cuts[1], data: body.subarray(first, second) },
        { afterMs: cuts[2], data: body.subarray(second) },
      ];
      const { output } = await pushRaw(pieces);
      expect(output).not.toMatch(
        /EAGAIN|Error reading file|Error reading JSON/
      );
      expect(output).toContain(IMPORT_REACHED);
      noLeftovers();
    },
    TIMEOUT
  );

  it(
    'still resolves placeholders in the piped config, as it does for a config file',
    async () => {
      const { output } = await pushRaw([
        { afterMs: 0, data: '{"_id":"x","value":"${NO_SUCH_PLACEHOLDER}"}' },
      ]);
      expect(output).toContain(
        'No value found for placeholder "NO_SUCH_PLACEHOLDER"'
      );
      expect(output).not.toMatch(/EAGAIN/);
      noLeftovers();
    },
    TIMEOUT
  );

  it(
    'reports piped text that is not JSON as a stdin problem and cleans up',
    async () => {
      const { output } = await pushRaw([
        { afterMs: 0, data: 'this is not json' },
      ]);
      expect(output).toContain('Error reading JSON from stdin');
      expect(output).not.toMatch(/EAGAIN/);
      expect(output).not.toContain(IMPORT_REACHED);
      noLeftovers();
    },
    TIMEOUT
  );
});
