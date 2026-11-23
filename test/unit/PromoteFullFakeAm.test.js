import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import http from 'http';
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
 * `--full` of `config-manager promote run-promotion`, `run-dryrun-promotion`
 * and `rollback`, and the question that these commands ask first, through the
 * REAL CLI and the real library of this checkout against the fake tenant of
 * test/utils/FakeAm.mjs in a separate process, with no tenant and no recording.
 * The fake keeps the lock and serves the promotion status from a script, and
 * its request log shows what the command asked for and in which order.
 *
 * What the log proves, which the unit tests of the operation (library faked)
 * cannot: the order of the requests of a whole lifecycle (the state read, the
 * lock, the status check of the library, the promotion, the unlock), what is
 * sent in the body of the promotion (the platform is told not to unlock by
 * itself), and above all the contract of the lock: after every outcome that has
 * ended the last request is the unlock with the id of the lock the command took,
 * and while an operation still runs, or when the status cannot be read, no unlock
 * is sent at all.
 *
 * Nothing waits for real: the fake answers every read at once, so the loops of
 * the library never sleep, except in the timeout test, which waits one second.
 * The questions that need a terminal are in PromoteFullAsk.pty.test.js.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;
// a command that has not ended by then is killed, well before the timeout of the test
const MAX_RUN_MS = 90000;
const API = '/environment/promotion/';
const LOCK_ID = 'lock-of-the-test-0001';
const OTHER_LOCK_ID = 'lock-of-somebody-else';
const STATE = 'GET lock/state?localLockOnly=false';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const COMMANDS = [
  ['run-promotion', 'promote'],
  ['run-dryrun-promotion', 'promote'],
  ['rollback', 'rollback'],
];

const COMPLETED = { status: 'READY', message: 'Promotion completed' };
const MISSING = {
  status: 'ERROR',
  message: 'Missing ESVs required for promotion',
  missingESVs: ['esv-test-secret', 'esv-test-variable'],
};
const ENCRYPTED = {
  status: 'ERROR',
  message: 'Found encrypted values in the AM/IDM configuration',
  encryptedSecrets: [
    '* am/services/realm/root-alpha/socialidentityproviders/1.0/organizationconfig/default/oidcconfig/test.json:9',
  ],
};

suite('config-manager promote --full through the CLI', () => {
  let home;
  let work;
  let logDir;
  let recordPath;
  const fakes = [];

  beforeAll(() => {
    ensureFrodoArtifact();
    // the fakes outlive a test, so the log they append to does too
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-promote-log-'));
    recordPath = path.join(logDir, 'requests.jsonl');
  });

  afterAll(() => {
    for (const fake of fakes) fake.stop();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-promote-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-promote-work-'));
    fs.rmSync(recordPath, { force: true });
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a fake tenant with the promotion API scripted; it is stopped when the suite ends. */
  async function fake(promotion = {}, options = {}) {
    const started = await startFakeAm({
      journey: 'service-account',
      recordPath,
      promotion: { lockId: LOCK_ID, ...promotion },
      ...options,
    });
    fakes.push(started);
    return started;
  }

  /**
   * Runs `frodo config-manager promote <command> <args>` against the fake,
   * without a terminal, and answers its exit code and both outputs. A command
   * that is still running after MAX_RUN_MS is killed with its launcher (the exit
   * code is then null).
   */
  function promote(server, command, args) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          'config-manager',
          'promote',
          command,
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
            FRODO_NO_UPDATE_CHECK: '1',
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
        resolve({ code, stdout, stderr });
      });
    });
  }

  /** The calls of the promotion API, in order, as `METHOD path` (the base left out). */
  const calls = () =>
    readRequests(recordPath)
      .filter(({ url }) => url.includes(API))
      .map(
        ({ method, url }) =>
          `${method} ${url.slice(url.indexOf(API) + API.length)}`
      );

  /** The body of the calls of one kind, parsed. */
  const bodies = (method, route) =>
    readRequests(recordPath)
      .filter(
        (request) =>
          request.method === method && request.url.endsWith(`${API}${route}`)
      )
      .map(({ body }) => JSON.parse(body));

  /** What the lock of the fake says now (this adds one read to the log, so read the log first). */
  function lockNow(server) {
    return new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${server.port}${API}lock/state`, (response) => {
          let text = '';
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () => resolve(JSON.parse(text).result));
        })
        .on('error', reject);
    });
  }

  /**
   * The order of the requests of a whole lifecycle. When the promotion fails,
   * the command reads the status once more to find out whether it is still
   * running, before it decides about the lock.
   */
  const lifecycle = (start, { failed = false } = {}) => [
    STATE, // the state read of the command: the environments must be unlocked
    STATE, // the library reads it again before it asks for the lock
    'POST lock',
    STATE, // the lock answered `locking`: one read says `locked`
    'GET promote', // the library refuses to start while an operation runs
    `POST ${start}`,
    'GET promote', // the first read of the wait
    ...(failed ? ['GET promote'] : []), // the command reads it again after the failure
    STATE, // the library reads the state before it asks for the unlock
    `DELETE lock/${LOCK_ID}`,
    STATE, // the unlock answered `unlocking`: one read says `unlocked`
  ];

  describe('the whole lifecycle', () => {
    it.each(COMMANDS)(
      '%s --full -y: state, lock, operation, unlock, in that order, exit 0, and the platform is told not to unlock',
      async (command, start) => {
        const server = await fake({
          [start]: [{ statuses: [COMPLETED] }],
        });

        const { code, stderr } = await promote(server, command, [
          '--full',
          '-y',
        ]);

        expect(calls()).toEqual(lifecycle(start));
        const [sent] = bodies('POST', start);
        expect(sent.unlockEnvironmentsAfterPromotion).toBe(false);
        expect(sent.dryRun).toBe(
          command === 'rollback'
            ? undefined
            : command === 'run-dryrun-promotion'
        );
        expect(stderr).toContain(`lock id ${LOCK_ID}`);
        expect(stderr).toContain('frodo config-manager promote unlock-tenants');
        expect(stderr).toMatch(/Lock: done\. .*: done\. Unlock: done\./);
        expect(code).toBe(0);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );

    it(
      '--full overrides -u: the platform is still told not to unlock, and the command unlocks',
      async () => {
        const server = await fake({ promote: [{ statuses: [COMPLETED] }] });

        const { code } = await promote(server, 'run-promotion', [
          '--full',
          '-u',
          '-y',
        ]);

        expect(
          bodies('POST', 'promote')[0].unlockEnvironmentsAfterPromotion
        ).toBe(false);
        expect(calls().at(-2)).toBe(`DELETE lock/${LOCK_ID}`);
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'passes -I on to the request',
      async () => {
        const server = await fake({ promote: [{ statuses: [COMPLETED] }] });

        const { code } = await promote(server, 'run-promotion', [
          '--full',
          '-I',
          '-y',
        ]);

        expect(bodies('POST', 'promote')[0].ignoreEncryptedSecrets).toBe(true);
        expect(code).toBe(0);
      },
      TIMEOUT
    );
  });

  describe('the question before anything starts', () => {
    it.each(
      COMMANDS.flatMap(([command]) => [
        [command, []],
        [command, ['--full']],
      ])
    )(
      '%s %j without a terminal and without -y is refused before the login: nothing is requested, exit 1',
      async (command, args) => {
        const server = await fake();

        const { code, stderr } = await promote(server, command, args);

        expect(readRequests(recordPath)).toEqual([]);
        expect(stderr).toContain('Refusing to');
        expect(stderr).toContain('-y/--yes');
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      'a run without --full sends the promotion and nothing else, as before',
      async () => {
        const server = await fake({
          lock: { result: 'locked', promotionId: LOCK_ID },
          promote: [{ statuses: [COMPLETED] }],
        });

        const { code } = await promote(server, 'run-promotion', ['-y']);

        expect(calls()).toEqual(['POST promote']);
        expect(bodies('POST', 'promote')[0]).toEqual({
          dryRun: false,
          ignoreEncryptedSecrets: false,
          unlockEnvironmentsAfterPromotion: false,
        });
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'a run with --wait and without --full reads the status first and takes no lock',
      async () => {
        const server = await fake({
          lock: { result: 'locked', promotionId: LOCK_ID },
          promote: [{ statuses: [COMPLETED] }],
        });

        const { code } = await promote(server, 'run-promotion', ['-w', '-y']);

        expect(calls()).toEqual(['GET promote', 'POST promote', 'GET promote']);
        expect(code).toBe(0);
      },
      TIMEOUT
    );
  });

  describe('the environments are not unlocked at the start', () => {
    it.each([['locked'], ['locking'], ['unlocking']])(
      'state %s: refused with the state and the lock id, nothing is sent after the state read, exit 1',
      async (result) => {
        const server = await fake({
          lock: { result, promotionId: OTHER_LOCK_ID },
        });

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(calls()).toEqual([STATE]);
        expect(stderr).toContain(`state ${result}`);
        expect(stderr).toContain(`lock id ${OTHER_LOCK_ID}`);
        expect(stderr).toContain(
          `promote unlock-tenants --id ${OTHER_LOCK_ID}`
        );
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe(result);
      },
      TIMEOUT
    );

    it(
      'a lock state that cannot be read: nothing is sent after it, exit 1',
      async () => {
        const server = await fake(
          {},
          { failRequests: [{ method: 'GET', path: '/promotion/lock/state' }] }
        );

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(calls()).toEqual([STATE]);
        expect(stderr).toContain('Nothing was sent');
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('missing ESVs', () => {
    it.each(COMMANDS)(
      '%s --full names the missing ESVs, unlocks, exit 1',
      async (command, start) => {
        const server = await fake({
          [start]: [{ statuses: [MISSING] }],
        });

        const { code, stderr } = await promote(server, command, [
          '--full',
          '-y',
        ]);

        expect(calls()).toEqual(lifecycle(start, { failed: true }));
        expect(stderr).toContain('esv-test-secret');
        expect(stderr).toContain('esv-test-variable');
        expect(stderr).toContain('Unlock: done.');
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );

    it(
      'an ERROR of another promotion is not reported as the missing ESVs of this one, but the lock is still released',
      async () => {
        const server = await fake({
          promote: [
            {
              statuses: [
                {
                  ...MISSING,
                  missingESVs: ['esv-of-an-earlier-run'],
                  promotionId: OTHER_LOCK_ID,
                },
              ],
            },
          ],
        });

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(stderr).not.toContain('esv-of-an-earlier-run');
        expect(calls().at(-2)).toBe(`DELETE lock/${LOCK_ID}`);
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );

    it(
      'an ERROR of a rollback is not reported as the missing ESVs of a promotion',
      async () => {
        const server = await fake({
          promote: [
            {
              statuses: [
                {
                  ...MISSING,
                  missingESVs: ['esv-of-a-rollback'],
                  type: 'rollback',
                },
              ],
            },
          ],
        });

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(stderr).not.toContain('esv-of-a-rollback');
        expect(calls().at(-2)).toBe(`DELETE lock/${LOCK_ID}`);
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('encrypted secrets', () => {
    it.each(['run-promotion', 'run-dryrun-promotion'])(
      '%s --full -y without a terminal: -y does not answer the question, the command fails, names -I, and unlocks',
      async (command) => {
        const server = await fake({
          promote: [{ statuses: [ENCRYPTED] }],
        });

        const { code, stderr } = await promote(server, command, [
          '--full',
          '-y',
        ]);

        // one request to promote: nothing is retried
        expect(calls().filter((call) => call === 'POST promote')).toHaveLength(
          1
        );
        expect(stderr).toContain('encrypted secrets');
        expect(stderr).toContain('-I, --ignore-encrypted-secrets');
        expect(stderr).toContain('no interactive terminal');
        expect(calls().at(-2)).toBe(`DELETE lock/${LOCK_ID}`);
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );

    it(
      '--full -I -y goes through the encrypted secrets in one request',
      async () => {
        const server = await fake({
          promote: [{ statuses: [COMPLETED] }],
        });

        const { code } = await promote(server, 'run-promotion', [
          '--full',
          '-I',
          '-y',
        ]);

        expect(calls()).toEqual(lifecycle('promote'));
        expect(bodies('POST', 'promote')).toHaveLength(1);
        expect(bodies('POST', 'promote')[0].ignoreEncryptedSecrets).toBe(true);
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'a rollback that finds encrypted secrets is not asked about them: it fails and unlocks',
      async () => {
        const server = await fake({
          rollback: [{ statuses: [ENCRYPTED] }],
        });

        const { code, stderr } = await promote(server, 'rollback', [
          '--full',
          '-y',
        ]);

        expect(stderr).not.toContain('-I, --ignore-encrypted-secrets');
        expect(calls().at(-2)).toBe(`DELETE lock/${LOCK_ID}`);
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('an operation that is still running', () => {
    it(
      'a --timeout that ends the wait leaves the lock on purpose: no unlock is sent, the output says so and names the lock, exit 1',
      async () => {
        const server = await fake({
          promote: [
            {
              statuses: [{ status: 'RUNNING', message: 'Promotion running' }],
            },
          ],
        });

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '--timeout',
          '1',
          '-y',
        ]);

        expect(calls().some((call) => call.startsWith('DELETE'))).toBe(false);
        expect(stderr).toContain('The lock stays on purpose');
        expect(stderr).toContain(`lock id ${LOCK_ID}`);
        expect(stderr).toContain(`promote unlock-tenants --id ${LOCK_ID}`);
        expect(stderr).toContain('check-promotion-status');
        expect(stderr).toContain('Promotion: not finished. Unlock: kept on purpose.');
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('locked');
      },
      TIMEOUT
    );

    it(
      'an operation that already runs when the lock is taken is not started and its lock is not touched: no promotion request, no unlock, exit 1',
      async () => {
        const server = await fake({
          status: {
            status: 'RUNNING',
            message: 'Start promotion',
            promotionId: OTHER_LOCK_ID,
            type: 'promotion',
          },
          promote: [{ statuses: [COMPLETED] }],
        });

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(calls().some((call) => call === 'POST promote')).toBe(false);
        expect(calls().some((call) => call.startsWith('DELETE'))).toBe(false);
        expect(stderr).toContain('already running');
        expect(stderr).toContain('The lock stays on purpose');
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      'a status that cannot be read after the failure leaves the lock: no unlock is sent, exit 1',
      async () => {
        const server = await fake(
          { promote: [{ statuses: [COMPLETED] }] },
          { failRequests: [{ method: 'GET', path: '/promotion/promote' }] }
        );

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '--timeout',
          '1',
          '-y',
        ]);

        expect(calls().some((call) => call.startsWith('DELETE'))).toBe(false);
        expect(stderr).toContain('The lock stays on purpose');
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('locked');
      },
      TIMEOUT
    );
  });

  describe('other failures', () => {
    it(
      'an ERROR of the platform with no cause the command knows: reported, unlocked, exit 1',
      async () => {
        const server = await fake({
          promote: [
            { statuses: [{ status: 'ERROR', message: 'Something broke' }] },
          ],
        });

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(stderr).toContain('Something broke');
        expect(calls().at(-2)).toBe(`DELETE lock/${LOCK_ID}`);
        expect(stderr).toMatch(/Promotion: failed\. Unlock: done\./);
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );

    it(
      'a refused promotion request: unlocked, exit 1',
      async () => {
        const server = await fake({ promote: [{ request: 'refuse' }] });

        const { code } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(calls()).toContain('POST promote');
        expect(calls().at(-2)).toBe(`DELETE lock/${LOCK_ID}`);
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );

    it(
      'an unlock that fails after the promotion went well: says how to release the lock, exit 1',
      async () => {
        const server = await fake({
          promote: [{ statuses: [COMPLETED] }],
          unlockRequest: 'refuse',
        });

        const { code, stderr } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(calls()).toContain(`DELETE lock/${LOCK_ID}`);
        expect(stderr).toContain('The environments are still locked');
        expect(stderr).toContain(`promote unlock-tenants --id ${LOCK_ID}`);
        expect(stderr).toMatch(/Promotion: done\. Unlock: failed\./);
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('locked');
      },
      TIMEOUT
    );
  });

  describe('a lock request that fails', () => {
    it(
      'refused with no lock taken: nothing is unlocked, no promotion request, exit 1',
      async () => {
        const server = await fake({ lockRequest: 'refuse' });

        const { code } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(calls()).toEqual([STATE, STATE, 'POST lock', STATE]);
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );

    it(
      'refused after the lock was taken: the state is `locked`, so it is released by its id, exit 1',
      async () => {
        const server = await fake({ lockRequest: 'refuse-but-lock' });

        const { code } = await promote(server, 'run-promotion', [
          '--full',
          '-y',
        ]);

        expect(calls()).not.toContain('POST promote');
        expect(calls()).toContain(`DELETE lock/${LOCK_ID}`);
        expect(code).toBe(1);
        expect(await lockNow(server)).toBe('unlocked');
      },
      TIMEOUT
    );
  });
});
