import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `frodo dcc session apply` and its `--wait` driven through the REAL CLI of
 * this checkout against the fake AM of test/utils/FakeAm.mjs in a separate
 * process, with no tenant and no recording. The fake serves the session API of
 * a Cloud tenant with scripted answers, and its request log shows what the
 * command asked for and in which order.
 *
 * What it proves that the unit tests of the operation (library stubbed, the
 * sleep stubbed) cannot: that the built command waits for real, 10 seconds
 * before each read of the state and goes round the loop until the state says
 * the session is applied; that it reads nothing without `--wait`; that the
 * `Status:` lines, the sentence and the document go to the streams they should;
 * and that a refused apply call, a tenant without the API and a state of ERROR
 * end with exit code 1.
 *
 * Only two tests really wait, because the command polls every 10 seconds and
 * has no option to shorten it: the one with two reads (20 seconds) and the one
 * with a state of ERROR (10 seconds). Everything else answers at once (the
 * apply call already says SESSION_APPLIED) or fails before the wait. What a
 * wait does with a status it does not know, with a state that cannot be read
 * and with `--json` is proved by the unit test of the operation, where the
 * sleep is stubbed.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;
// a command that has not ended by then is killed, well before the timeout of the test
const MAX_RUN_MS = 90000;
const SESSION = '/environment/direct-configuration/session/';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const APPLIED = { editable: false, status: 'SESSION_APPLIED' };

suite('dcc session apply through the CLI', () => {
  let home;
  let work;
  let logDir;
  let recordPath;
  const fakes = [];

  beforeAll(() => {
    ensureFrodoArtifact();
    // the fakes outlive a test, so the log they append to does too
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-dcc-log-'));
    recordPath = path.join(logDir, 'requests.jsonl');
  });

  afterAll(() => {
    for (const fake of fakes) fake.stop();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-dcc-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-dcc-work-'));
    fs.rmSync(recordPath, { force: true });
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a fake AM that serves the session API and is stopped when the suite ends. */
  async function fake(directConfiguration, options = {}) {
    const started = await startFakeAm({
      journey: 'service-account',
      recordPath,
      directConfiguration,
      ...options,
    });
    fakes.push(started);
    return started;
  }

  /**
   * Runs `frodo dcc session <args>` against the fake, without a terminal, and
   * answers its exit code, both outputs and how long it ran. A command that is
   * still running after MAX_RUN_MS is killed with its launcher (the exit code is
   * then null), so that a command that never ends fails the test instead of
   * running on after it.
   */
  function session(server, args) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const child = cp.spawn(
        binaryPath,
        [
          'dcc',
          'session',
          ...args,
          `http://127.0.0.1:${server.port}/am`,
          '--type',
          'cloud',
        ],
        {
          cwd: work,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            FRODO_HOST: '',
            FRODO_REALM: '',
            FRODO_USERNAME: '',
            FRODO_PASSWORD: '',
            FRODO_CREDENTIAL: '',
            FRODO_SA_ID: 'test-account',
            FRODO_SA_JWK: serviceAccountJwk,
            NODE_OPTIONS: '',
            NO_COLOR: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          // its own process group, so that a stopped command takes the Node process of its launcher with it
          detached: true,
        }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      const guard = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // it ended on its own just now
        }
      }, MAX_RUN_MS);
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(guard);
        resolve({
          code,
          stdout,
          stderr,
          seconds: (Date.now() - started) / 1000,
        });
      });
    });
  }

  /** The calls of the session API, in order, as `METHOD /path`. */
  const sessionCalls = () =>
    readRequests(recordPath)
      .filter(({ url }) => url.includes(SESSION))
      .map(({ method, url }) => `${method} ${url.slice(url.indexOf(SESSION))}`);

  describe('apply without --wait', () => {
    it(
      'sends one apply call, reads no state, says so on stderr, and exits 0',
      async () => {
        const server = await fake({ apply: { editable: false } });

        const { code, stdout, stderr } = await session(server, ['apply']);

        expect(sessionCalls()).toEqual([`PUT ${SESSION}apply`]);
        expect(stderr).toContain('Configuration applied and direct');
        expect(stdout).toBe('');
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'exits 1 when the tenant still reports the session as active',
      async () => {
        const server = await fake({ apply: { editable: true } });

        const { code, stderr } = await session(server, ['apply']);

        expect(sessionCalls()).toEqual([`PUT ${SESSION}apply`]);
        expect(stderr).toContain('still active');
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      'exits 1 when the apply call is refused',
      async () => {
        const server = await fake(
          { apply: { editable: false } },
          { failRequests: [{ method: 'PUT', path: `${SESSION}apply` }] }
        );

        const { code, stdout } = await session(server, ['apply']);

        expect(sessionCalls()).toEqual([`PUT ${SESSION}apply`]);
        expect(stdout).toBe('');
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('a tenant that does not serve the session API', () => {
    it.each([[['apply']], [['apply', '--wait']]])(
      '%j exits 1 with the error of the 404 and waits for nothing',
      async (args) => {
        const server = await fake(undefined);

        const { code, stdout, stderr } = await session(server, args);

        expect(sessionCalls()).toEqual([`PUT ${SESSION}apply`]);
        expect(stderr).toContain('Status: 404');
        expect(stdout).toBe('');
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('apply --wait', () => {
    it(
      'needs no wait when the apply call already answers SESSION_APPLIED: no state read, the sentence on stderr, exit 0',
      async () => {
        const server = await fake({ apply: APPLIED });

        const { code, stdout, stderr } = await session(server, [
          'apply',
          '--wait',
        ]);

        expect(sessionCalls()).toEqual([`PUT ${SESSION}apply`]);
        expect(stderr).toContain('Configuration applied and direct');
        expect(stderr).not.toContain('Status:');
        expect(stdout).toBe('');
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      '--json leaves one document on stdout, the final state, and no sentence',
      async () => {
        const server = await fake({ apply: APPLIED });

        const { code, stdout, stderr } = await session(server, [
          'apply',
          '--wait',
          '--json',
        ]);

        expect(sessionCalls()).toEqual([`PUT ${SESSION}apply`]);
        expect(stdout).toBe("{ editable: false, status: 'SESSION_APPLIED' }\n");
        expect(stderr).not.toContain('Configuration applied');
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'exits 1 when the apply call is refused, and waits for nothing',
      async () => {
        const server = await fake(
          { apply: { editable: false }, states: [APPLIED] },
          { failRequests: [{ method: 'PUT', path: `${SESSION}apply` }] }
        );

        const { code, stdout } = await session(server, ['apply', '--wait']);

        expect(sessionCalls()).toEqual([`PUT ${SESSION}apply`]);
        expect(stdout).toBe('');
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      'waits for real: 10 seconds before each read, goes round the loop until SESSION_APPLIED, then says so and exits 0',
      async () => {
        const server = await fake({
          apply: { editable: false },
          states: [{ editable: false, status: 'PENDING' }, APPLIED],
        });

        const { code, stdout, stderr, seconds } = await session(server, [
          'apply',
          '-w',
        ]);

        expect(sessionCalls()).toEqual([
          `PUT ${SESSION}apply`,
          `GET ${SESSION}state`,
          `GET ${SESSION}state`,
        ]);
        expect(stderr).toContain('Status: PENDING');
        expect(stderr.indexOf('Status: PENDING')).toBeLessThan(
          stderr.indexOf('Status: SESSION_APPLIED')
        );
        expect(stderr).toContain('Configuration applied and direct');
        expect(stdout).toBe('');
        expect(code).toBe(0);
        // it slept before each read, and it slept the full interval each time
        expect(seconds).toBeGreaterThanOrEqual(19.5);
      },
      TIMEOUT
    );

    it(
      'a state of ERROR ends the wait with the message and exit code 1, after one read',
      async () => {
        const server = await fake({
          apply: { editable: false },
          states: [{ editable: false, status: 'ERROR' }, APPLIED],
        });

        const { code, stdout, stderr } = await session(server, [
          'apply',
          '--wait',
        ]);

        expect(sessionCalls()).toEqual([
          `PUT ${SESSION}apply`,
          `GET ${SESSION}state`,
        ]);
        expect(stderr).toContain('Status: ERROR');
        expect(stderr).toContain(
          'Direct Configuration session encountered an error.'
        );
        expect(stderr).not.toContain('Configuration applied');
        expect(stdout).toBe('');
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('the other session commands send one call and wait for nothing', () => {
    it.each([
      ['init', 'PUT', 'init'],
      ['abort', 'PUT', 'abort'],
      ['state', 'GET', 'state'],
    ])(
      '%s',
      async (verb, method, call) => {
        const server = await fake({});

        const { code } = await session(server, [verb, '--json']);

        expect(sessionCalls()).toEqual([`${method} ${SESSION}${call}`]);
        expect(code).toBe(0);
      },
      TIMEOUT
    );
  });
});
