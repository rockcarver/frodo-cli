import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The two questions of `config-manager promote run`, `rollback` and
 * `dry-run` that need a real terminal, answered through a
 * pseudo-terminal against the fake tenant:
 *
 * - the question before the command starts (these commands ask first, see
 *   https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0058-confirmation-and-the-experimental-label.md
 *   confirmation and the experimental label): a yes goes ahead, a no and a bare Enter (the default is no) send
 *   nothing to the promotion API, and with prompting turned off the command
 *   is refused as it is without a terminal;
 * - the question that `--full` asks when the platform stops for encrypted
 *   secrets: a yes runs the promotion again in the same lock with the
 *   encrypted secrets ignored, a no does not, and in both cases the lock is
 *   released; `-y` is not the answer to it.
 *
 * Without a terminal the same cases are in PromoteFullFakeAm.test.js.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const API = '/environment/promotion/';
const LOCK_ID = 'lock-of-the-terminal-test';
const COMPLETED = { status: 'READY', message: 'Promotion completed' };
const ENCRYPTED = {
  status: 'ERROR',
  message: 'Found encrypted values in the AM/IDM configuration',
  encryptedSecrets: ['* am/services/realm/root-alpha/x.json:9'],
};

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

suite('promote questions, on a real terminal', () => {
  let home;
  let fakeAm;
  let recordPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  /** Runs the command on a terminal and answers what happened. */
  async function onTerminal(promotion, args, actions, env = {}) {
    fakeAm = await startFakeAm({
      journey: 'service-account',
      recordPath,
      promotion: { lockId: LOCK_ID, ...promotion },
    });
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        FRODO_SA_ID: 'test-account',
        FRODO_SA_JWK: serviceAccountJwk,
        ...env,
      },
      args: [
        'config-manager',
        'promote',
        ...args,
        `http://127.0.0.1:${fakeAm.port}/am`,
        '--type',
        'cloud',
      ],
      actions,
    });
  }

  /** The calls of the promotion API, in order, as `METHOD path`. */
  const calls = () =>
    readRequests(recordPath)
      .filter(({ url }) => url.includes(API))
      .map(
        ({ method, url }) =>
          `${method} ${url.slice(url.indexOf(API) + API.length)}`
      );

  const promoteBodies = () =>
    readRequests(recordPath)
      .filter(
        ({ method, url }) => method === 'POST' && url.endsWith(`${API}promote`)
      )
      .map(({ body }) => JSON.parse(body));

  const QUESTION = {
    type: 'wait_plain',
    regex: 'Continue\\? \\(y/N\\)',
    timeoutMs: 30000,
  };
  const ENDED = { type: 'wait_exit', timeoutMs: 60000 };

  describe('the question before the command starts', () => {
    it('is asked with the target and the default answer no, and a yes starts the promotion', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [COMPLETED] }] },
        ['run'],
        [QUESTION, { type: 'send_line', text: 'y' }, ENDED]
      );

      expect(result.plainOutput).toContain('Run a promotion? Continue?');
      expect(result.plainOutput).toContain(
        `promotes the configuration of the lower environment to http://127.0.0.1:${fakeAm.port}/am`
      );
      expect(calls()).toEqual(['POST promote']);
      expect(result.exitCode).toBe(0);
    }, 120000);

    it('a no sends nothing to the promotion API and exits 1', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [COMPLETED] }] },
        ['run'],
        [QUESTION, { type: 'send_line', text: 'n' }, ENDED]
      );

      expect(calls()).toEqual([]);
      expect(result.plainOutput).toContain('Nothing was changed.');
      expect(result.exitCode).toBe(1);
    }, 120000);

    it('a bare Enter is a no: the default answer is no', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [COMPLETED] }] },
        ['run'],
        [QUESTION, { type: 'key', name: 'enter' }, ENDED]
      );

      expect(calls()).toEqual([]);
      expect(result.exitCode).toBe(1);
    }, 120000);

    it('the dry run asks as well, and says that it locks the environments with --full', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [COMPLETED] }] },
        ['dry-run', '--full'],
        [QUESTION, { type: 'send_line', text: 'n' }, ENDED]
      );

      expect(result.plainOutput).toContain(
        'Run a dry-run promotion? Continue?'
      );
      expect(result.plainOutput).toContain('locks both environments');
      expect(calls()).toEqual([]);
      expect(result.exitCode).toBe(1);
    }, 120000);

    it('the rollback asks as well', async () => {
      const result = await onTerminal(
        { rollback: [{ statuses: [COMPLETED] }] },
        ['rollback', '--full'],
        [QUESTION, { type: 'send_line', text: 'n' }, ENDED]
      );

      expect(result.plainOutput).toContain(
        'Roll back the previous promotion? Continue?'
      );
      expect(calls()).toEqual([]);
      expect(result.exitCode).toBe(1);
    }, 120000);

    it('with prompting turned off the command is refused as it is without a terminal, naming -y', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [COMPLETED] }] },
        ['run', '--full'],
        [ENDED],
        { FRODO_NO_PROMPT: '1' }
      );

      expect(result.plainOutput).toContain('-y/--yes');
      expect(readRequests(recordPath)).toEqual([]);
      expect(result.exitCode).toBe(1);
    }, 120000);
  });

  describe('the question about encrypted secrets of --full', () => {
    const ENCRYPTED_QUESTION = {
      type: 'wait_plain',
      regex: 'ignore the encrypted secrets\\? Continue\\? \\(y/N\\)',
      timeoutMs: 60000,
    };

    it('a yes, although -y was given, runs the promotion again with the encrypted secrets ignored, in the same lock, and unlocks', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [ENCRYPTED] }, { statuses: [COMPLETED] }] },
        ['run', '--full', '-y'],
        [ENCRYPTED_QUESTION, { type: 'send_line', text: 'y' }, ENDED]
      );

      expect(result.plainOutput).toContain(
        '* am/services/realm/root-alpha/x.json:9'
      );
      expect(
        promoteBodies().map((body) => body.ignoreEncryptedSecrets)
      ).toEqual([false, true]);
      expect(calls().filter((call) => call === 'POST lock')).toHaveLength(1);
      expect(calls()).toContain(`DELETE lock/${LOCK_ID}`);
      expect(result.exitCode).toBe(0);
    }, 180000);

    it('a no does not run it again, says so in its own words, unlocks, and exits 1', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [ENCRYPTED] }, { statuses: [COMPLETED] }] },
        ['run', '--full', '-y'],
        [ENCRYPTED_QUESTION, { type: 'send_line', text: 'n' }, ENDED]
      );

      expect(result.plainOutput).toContain(
        'The promotion was not run again; the environments are unlocked next.'
      );
      expect(result.plainOutput).not.toContain('Nothing was changed.');
      expect(promoteBodies()).toHaveLength(1);
      expect(calls()).toContain(`DELETE lock/${LOCK_ID}`);
      expect(result.exitCode).toBe(1);
    }, 180000);

    it('a bare Enter is a no', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [ENCRYPTED] }, { statuses: [COMPLETED] }] },
        ['run', '--full', '-y'],
        [ENCRYPTED_QUESTION, { type: 'key', name: 'enter' }, ENDED]
      );

      expect(promoteBodies()).toHaveLength(1);
      expect(calls()).toContain(`DELETE lock/${LOCK_ID}`);
      expect(result.exitCode).toBe(1);
    }, 180000);

    it('with prompting turned off it is not asked: the command fails, names -I, and unlocks', async () => {
      const result = await onTerminal(
        { promote: [{ statuses: [ENCRYPTED] }, { statuses: [COMPLETED] }] },
        ['run', '--full', '-y'],
        [ENDED],
        { FRODO_NO_PROMPT: '1' }
      );

      expect(result.plainOutput).toContain('-I, --ignore-encrypted-secrets');
      expect(promoteBodies()).toHaveLength(1);
      expect(calls()).toContain(`DELETE lock/${LOCK_ID}`);
      expect(result.exitCode).toBe(1);
    }, 180000);
  });
});
