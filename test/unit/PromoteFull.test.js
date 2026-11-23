import { jest } from '@jest/globals';
import { Command } from 'commander';

/**
 * `--full` of `config-manager promote run-promotion`, `run-dryrun-promotion`
 * and `rollback`, and the question these commands ask before they start: how
 * the commands and the operations compose the library calls. The library is a
 * fake that records the order of its calls, so what is pinned here is the
 * sequence (state read, question, lock, operation, unlock) and the contract of
 * the lock:
 *
 * - it starts only when both environments are unlocked;
 * - after every outcome that has ended the lock is released by its id;
 * - while the platform still works on the operation, or when its status cannot
 *   be read, it is not released;
 * - after a failed lock request only a state `locked` is released.
 *
 * The same sequences run against the real library and the fake tenant in
 * PromoteFullFakeAm.test.js, and the questions that need a terminal in
 * PromoteFullAsk.pty.test.js.
 */

const LOCK_ID = 'lock-of-this-run';
const OTHER_ID = 'lock-of-another-run';

const calls = [];
const getTokens = jest.fn();
const readLockStatus = jest.fn();
const lockEnvironment = jest.fn();
const unlockEnvironment = jest.fn();
const readPromotionStatus = jest.fn();
const promoteConfiguration = jest.fn();
const rollbackPromotion = jest.fn();
const confirm = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
const verboseMessage = jest.fn();
let terminal = false;

/** A library function that notes its call in `calls` before it answers like the mock says. */
function noted(name, mock) {
  return (...args) => {
    calls.push(name);
    return mock(...args);
  };
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
    cloud: {
      env: {
        promotion: {
          readLockStatus: noted('readLockStatus', readLockStatus),
          lockEnvironment: noted('lockEnvironment', lockEnvironment),
          unlockEnvironment: noted('unlockEnvironment', unlockEnvironment),
          readPromotionStatus: noted(
            'readPromotionStatus',
            readPromotionStatus
          ),
          promoteConfiguration: noted(
            'promoteConfiguration',
            promoteConfiguration
          ),
          rollbackPromotion: noted('rollbackPromotion', rollbackPromotion),
        },
      },
    },
  },
  state: { getHost: () => 'https://openam-matrix.example.com/am' },
}));
jest.unstable_mockModule('@inquirer/confirm', () => ({
  default: (...args) => {
    calls.push('question');
    return confirm(...args);
  },
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => terminal,
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
      this.exitOverride();
      this.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    }

    handleDefaultArgsAndOpts() {}
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const dir = '../../src/cli/config-manager/config-manager-promote/';
const { default: setupRunPromotion } = await import(
  `${dir}config-manager-promote-run-promotion`
);
const { default: setupRunDryrunPromotion } = await import(
  `${dir}config-manager-promote-run-dryrun-promotion`
);
const { default: setupRollback } = await import(
  `${dir}config-manager-promote-rollback`
);

async function run(setup, args) {
  process.exitCode = 0;
  let error;
  try {
    await setup().parseAsync(args, { from: 'user' });
  } catch (e) {
    error = e;
  }
  const exitCode = process.exitCode;
  process.exitCode = 0;
  return { exitCode, error };
}

/** Everything the command printed, as one text per type. */
const printed = (type) =>
  printMessage.mock.calls
    .filter(([, t]) => t === type)
    .map(([message]) => String(message))
    .join('\n');
const errors = () => printed('error');

const UNLOCKED = { result: 'unlocked' };
const LOCKED = { result: 'locked', promotionId: LOCK_ID };
const READY = { status: 'READY', promotionId: LOCK_ID, message: 'completed' };

/** The status of a promotion that ended in ERROR, for the type of the command. */
const failure = (type, extra) => ({
  status: 'ERROR',
  promotionId: LOCK_ID,
  type,
  message: 'it failed',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  terminal = false;
  getTokens.mockResolvedValue(true);
  readLockStatus.mockResolvedValue(UNLOCKED);
  lockEnvironment.mockResolvedValue(LOCKED);
  unlockEnvironment.mockResolvedValue({ result: 'unlocked' });
  promoteConfiguration.mockResolvedValue({ result: 'promotion started' });
  rollbackPromotion.mockResolvedValue({ result: 'rollback started' });
  readPromotionStatus.mockResolvedValue(READY);
  confirm.mockResolvedValue(true);
});

const COMMANDS = [
  ['run-promotion', setupRunPromotion, 'promoteConfiguration', 'promotion'],
  [
    'run-dryrun-promotion',
    setupRunDryrunPromotion,
    'promoteConfiguration',
    'promotion',
  ],
  ['rollback', setupRollback, 'rollbackPromotion', 'rollback'],
];

describe.each(COMMANDS)('%s', (name, setup, operationName, statusType) => {
  const operation = () =>
    operationName === 'rollbackPromotion'
      ? rollbackPromotion
      : promoteConfiguration;
  /** The calls to the platform, in order, without the status reads that follow a failure. */
  const lifecycle = [
    'readLockStatus',
    'lockEnvironment',
    operationName,
    'unlockEnvironment',
  ];
  /** The operation fails: the status is read once more to find out what to do with the lock. */
  const afterFailure = [
    'readLockStatus',
    'lockEnvironment',
    operationName,
    'readPromotionStatus',
    'unlockEnvironment',
  ];

  describe('--full', () => {
    test('reads the state, locks, runs the operation, unlocks: in that order, with the id of the lock, exit 0', async () => {
      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(calls).toEqual(lifecycle);
      expect(readLockStatus).toHaveBeenCalledWith(false);
      expect(lockEnvironment).toHaveBeenCalledWith(true);
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
      expect(printed('info')).toContain(`lock id ${LOCK_ID}`);
      expect(printed('info')).toContain('Lock: done.');
      expect(printed('info')).toContain('Unlock: done.');
      expect(exitCode).toBe(0);
    });

    test('waits for the operation without --wait, and tells the platform not to unlock by itself, with and without -u', async () => {
      for (const extra of [[], ['-u']]) {
        jest.clearAllMocks();
        const { exitCode } = await run(setup, ['--full', '-y', ...extra]);

        expect(exitCode).toBe(0);
        expect(operation()).toHaveBeenCalledWith(
          expect.objectContaining({ unlockEnvironmentsAfterPromotion: false }),
          true,
          undefined,
          undefined
        );
      }
    });

    test('--timeout bounds the operation only, in milliseconds, and is allowed without --wait', async () => {
      const { exitCode } = await run(setup, ['--full', '-y', '--timeout', '2']);

      expect(exitCode).toBe(0);
      expect(operation()).toHaveBeenCalledWith(
        expect.any(Object),
        true,
        undefined,
        2000
      );
      // the lock and the unlock keep the library's own timeout
      expect(lockEnvironment).toHaveBeenCalledWith(true);
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
    });

    test('--timeout without --wait and without --full is refused before anything is sent', async () => {
      const { exitCode } = await run(setup, ['-y', '--timeout', '2']);

      expect(exitCode).toBe(1);
      expect(printMessage).toHaveBeenCalledWith(
        '--timeout requires --wait or --full.',
        'error'
      );
      expect(getTokens).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    });

    test.each(['locked', 'locking', 'unlocking', 'error'])(
      'the environments are %s at the start: refused with the state and the lock id, nothing is sent, exit 1',
      async (result) => {
        readLockStatus.mockResolvedValue({
          result,
          promotionId: OTHER_ID,
          lowerEnv: { promotionId: OTHER_ID, state: result },
        });

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(calls).toEqual(['readLockStatus']);
        expect(errors()).toContain(`state ${result}`);
        expect(errors()).toContain(`lock id ${OTHER_ID}`);
        expect(errors()).toContain('Nothing was sent');
        expect(exitCode).toBe(1);
      }
    );

    test('a lock state that cannot be read: refused, nothing else is sent, exit 1', async () => {
      readLockStatus.mockRejectedValue(new Error('no answer'));

      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(calls).toEqual(['readLockStatus']);
      expect(errors()).toContain('The lock state cannot be read');
      expect(exitCode).toBe(1);
    });

    describe('a lock request that fails', () => {
      beforeEach(() => {
        lockEnvironment.mockRejectedValue(new Error('lock refused'));
      });

      test('with the environments still unlocked nothing is unlocked and the operation does not start, exit 1', async () => {
        const { exitCode } = await run(setup, ['--full', '-y']);

        // the state is read again after the failure, and left alone
        expect(calls).toEqual([
          'readLockStatus',
          'lockEnvironment',
          'readLockStatus',
        ]);
        expect(exitCode).toBe(1);
      });

      test('with the environments `locked` the lock is released by its id, and the operation does not start, exit 1', async () => {
        readLockStatus
          .mockResolvedValueOnce(UNLOCKED)
          .mockResolvedValue(LOCKED);

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(calls).toEqual([
          'readLockStatus',
          'lockEnvironment',
          'readLockStatus',
          'unlockEnvironment',
        ]);
        expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
        expect(exitCode).toBe(1);
      });

      test.each(['locking', 'unlocking', 'error'])(
        'with the environments %s nothing is unlocked: that is not a lock this command can tell is its own',
        async (result) => {
          readLockStatus
            .mockResolvedValueOnce(UNLOCKED)
            .mockResolvedValue({ result, promotionId: OTHER_ID });

          const { exitCode } = await run(setup, ['--full', '-y']);

          expect(unlockEnvironment).not.toHaveBeenCalled();
          // the lock it may have left behind is named, with how to release it
          expect(printed('warn')).toContain(`lock id ${OTHER_ID}`);
          expect(printed('warn')).toContain(`unlock-tenants --id ${OTHER_ID}`);
          expect(exitCode).toBe(1);
        }
      );

      test('with a state that cannot be read nothing is unlocked, and the output says how to look at it, exit 1', async () => {
        readLockStatus
          .mockResolvedValueOnce(UNLOCKED)
          .mockRejectedValue(new Error('no answer'));

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(unlockEnvironment).not.toHaveBeenCalled();
        expect(errors()).toContain('check-locked-status');
        expect(exitCode).toBe(1);
      });

      test('a lock that answers without an id is treated as a failed lock', async () => {
        lockEnvironment.mockReset();
        lockEnvironment.mockResolvedValue({ result: 'locked' });

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(operation()).not.toHaveBeenCalled();
        expect(exitCode).toBe(1);
      });
    });

    test('an operation that fails with a status that is not running: the lock is released by its id, exit 1', async () => {
      operation().mockRejectedValue(new Error('request refused'));

      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(calls).toEqual(afterFailure);
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
      expect(printError).toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    describe('missing ESVs', () => {
      beforeEach(() => {
        operation().mockRejectedValue(new Error('failed'));
        readPromotionStatus.mockResolvedValue(
          failure(statusType, {
            missingESVs: ['esv-test-secret', 'esv-test-variable'],
          })
        );
      });

      test('are listed with the environment that lacks them, the lock is released, exit 1', async () => {
        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(calls).toEqual(afterFailure);
        expect(errors()).toContain('esv-test-secret');
        expect(errors()).toContain('esv-test-variable');
        expect(errors()).toContain('https://openam-matrix.example.com/am');
        expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
        expect(exitCode).toBe(1);
      });

      test('of another promotion are not reported as ours, but the lock is released all the same', async () => {
        readPromotionStatus.mockResolvedValue(
          failure(statusType, {
            promotionId: OTHER_ID,
            missingESVs: ['esv-of-an-earlier-run'],
          })
        );

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(errors()).not.toContain('esv-of-an-earlier-run');
        expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
        expect(exitCode).toBe(1);
      });

      test('of the other type of operation are not reported as ours', async () => {
        readPromotionStatus.mockResolvedValue(
          failure(statusType === 'rollback' ? 'promotion' : 'rollback', {
            missingESVs: ['esv-of-the-other-type'],
          })
        );

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(errors()).not.toContain('esv-of-the-other-type');
        expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
        expect(exitCode).toBe(1);
      });
    });

    describe('while the platform still works', () => {
      test.each(['RUNNING', 'LOCKING', 'UNLOCKING'])(
        'a status %s after the failure (a timeout): the lock is NOT released, the output names it and says how to release it, exit 1',
        async (status) => {
          operation().mockRejectedValue(new Error('timed out'));
          readPromotionStatus.mockResolvedValue({ ...READY, status });

          const { exitCode } = await run(setup, ['--full', '-y', '-T', '1']);

          expect(calls).toEqual([
            'readLockStatus',
            'lockEnvironment',
            operationName,
            'readPromotionStatus',
          ]);
          expect(unlockEnvironment).not.toHaveBeenCalled();
          expect(errors()).toContain('The lock stays on purpose');
          expect(errors()).toContain(`lock id ${LOCK_ID}`);
          expect(errors()).toContain(`unlock-tenants --id ${LOCK_ID}`);
          expect(errors()).toContain('check-promotion-status');
          expect(printed('error')).toContain('Unlock: kept on purpose.');
          expect(exitCode).toBe(1);
        }
      );

      test('a status that cannot be read after the failure: the lock is NOT released, exit 1', async () => {
        operation().mockRejectedValue(new Error('timed out'));
        readPromotionStatus.mockRejectedValue(new Error('no answer'));

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(unlockEnvironment).not.toHaveBeenCalled();
        expect(errors()).toContain('The lock stays on purpose');
        expect(exitCode).toBe(1);
      });
    });

    describe('the unlock', () => {
      test('fails after an operation that went well: says how to release the lock, exit 1', async () => {
        unlockEnvironment.mockRejectedValue(new Error('unlock refused'));

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(printError).toHaveBeenCalled();
        expect(errors()).toContain('The environments are still locked');
        expect(errors()).toContain(`unlock-tenants --id ${LOCK_ID}`);
        expect(printed('error')).toContain('Unlock: failed.');
        expect(exitCode).toBe(1);
      });

      test('is tried once, not retried', async () => {
        unlockEnvironment.mockRejectedValue(new Error('unlock refused'));

        await run(setup, ['--full', '-y']);

        expect(unlockEnvironment).toHaveBeenCalledTimes(1);
      });
    });

    describe('the question', () => {
      test('without -y and without a terminal is refused before the login, nothing is sent, exit 1', async () => {
        const { exitCode } = await run(setup, ['--full']);

        expect(getTokens).not.toHaveBeenCalled();
        expect(calls).toEqual([]);
        expect(errors()).toContain('-y/--yes');
        expect(exitCode).toBe(1);
      });

      test('with a terminal is asked once, with a default of no, before anything is sent', async () => {
        terminal = true;

        const { exitCode } = await run(setup, ['--full']);

        expect(calls).toEqual(['question', ...lifecycle]);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(confirm.mock.calls[0][0].default).toBe(false);
        expect(exitCode).toBe(0);
      });

      test('a no with a terminal sends nothing and exits 1', async () => {
        terminal = true;
        confirm.mockResolvedValue(false);

        const { exitCode } = await run(setup, ['--full']);

        expect(calls).toEqual(['question']);
        expect(exitCode).toBe(1);
      });

      test('-y with a terminal is not asked', async () => {
        terminal = true;

        const { exitCode } = await run(setup, ['--full', '-y']);

        expect(calls).toEqual(lifecycle);
        expect(confirm).not.toHaveBeenCalled();
        expect(exitCode).toBe(0);
      });
    });
  });

  describe('without --full', () => {
    test('sends the request and nothing else: no state read, no lock, no unlock', async () => {
      const { exitCode } = await run(setup, ['-y']);

      expect(calls).toEqual([operationName]);
      expect(operation()).toHaveBeenCalledWith(
        expect.any(Object),
        false,
        undefined,
        undefined
      );
      expect(exitCode).toBe(0);
    });

    test('a failed request is reported and exits 1, and nothing is unlocked', async () => {
      operation().mockRejectedValue(new Error('request refused'));

      const { exitCode } = await run(setup, ['-y']);

      expect(calls).toEqual([operationName]);
      expect(printError).toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    test('without -y and without a terminal is refused before the login, nothing is sent, exit 1', async () => {
      const { exitCode } = await run(setup, []);

      expect(getTokens).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(errors()).toContain('Refusing to');
      expect(errors()).toContain('-y/--yes');
      expect(exitCode).toBe(1);
    });

    test('with a terminal is asked, and a no sends nothing and exits 1', async () => {
      terminal = true;
      confirm.mockResolvedValue(false);

      const { exitCode } = await run(setup, []);

      expect(calls).toEqual(['question']);
      expect(exitCode).toBe(1);
    });

    test('--wait with a terminal: a yes sends the request that waits', async () => {
      terminal = true;

      const { exitCode } = await run(setup, ['--wait']);

      expect(calls).toEqual(['question', operationName]);
      expect(exitCode).toBe(0);
    });
  });
});

describe.each(COMMANDS.filter(([, , , type]) => type === 'promotion'))(
  '%s: encrypted secrets',
  (name, setup) => {
    const encrypted = failure('promotion', {
      encryptedSecrets: ['* am/services/x.json:9'],
    });
    const ofCommand = () =>
      promoteConfiguration.mock.calls.map(([config]) => config);

    beforeEach(() => {
      promoteConfiguration
        .mockReset()
        .mockRejectedValueOnce(new Error('failed'))
        .mockResolvedValue({ result: 'promotion started' });
      readPromotionStatus.mockResolvedValue(encrypted);
    });

    test('without a terminal: -y does not answer, the command fails, names -I and the list, and releases the lock, exit 1', async () => {
      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(promoteConfiguration).toHaveBeenCalledTimes(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(errors()).toContain('* am/services/x.json:9');
      expect(errors()).toContain('-I, --ignore-encrypted-secrets');
      expect(errors()).toContain('does not answer this question');
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
      expect(exitCode).toBe(1);
    });

    test('with a terminal a yes runs it again with the encrypted secrets ignored, in the same lock, and unlocks, exit 0', async () => {
      terminal = true;

      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(
        ofCommand().map((config) => config.ignoreEncryptedSecrets)
      ).toEqual([false, true]);
      expect(lockEnvironment).toHaveBeenCalledTimes(1);
      expect(unlockEnvironment).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0][0].default).toBe(false);
      expect(exitCode).toBe(0);
    });

    test('with a terminal -y is not what answers it: the question is asked although -y was given', async () => {
      terminal = true;

      await run(setup, ['--full', '-y']);

      expect(confirm).toHaveBeenCalledTimes(1);
    });

    test('with a terminal a no does not run it again, releases the lock, exit 1', async () => {
      terminal = true;
      confirm.mockResolvedValue(false);

      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(promoteConfiguration).toHaveBeenCalledTimes(1);
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
      expect(exitCode).toBe(1);
    });

    test('with a terminal a question that is closed with Ctrl-C is a no, and the lock is released', async () => {
      terminal = true;
      confirm.mockRejectedValue(new Error('User force closed the prompt'));

      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(promoteConfiguration).toHaveBeenCalledTimes(1);
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
      expect(exitCode).toBe(1);
    });

    test('a second failure of the repeated run is not asked about again: it fails and releases the lock', async () => {
      terminal = true;
      promoteConfiguration
        .mockReset()
        .mockRejectedValue(new Error('failed again'));

      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(promoteConfiguration).toHaveBeenCalledTimes(2);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
      expect(exitCode).toBe(1);
    });

    test('with -I from the start the first request already ignores them', async () => {
      promoteConfiguration.mockReset().mockResolvedValue({ result: 'ok' });

      const { exitCode } = await run(setup, ['--full', '-y', '-I']);

      expect(
        ofCommand().map((config) => config.ignoreEncryptedSecrets)
      ).toEqual([true]);
      expect(exitCode).toBe(0);
    });

    test('an ERROR of another promotion is not asked about', async () => {
      terminal = true;
      readPromotionStatus.mockResolvedValue({
        ...encrypted,
        promotionId: OTHER_ID,
      });

      const { exitCode } = await run(setup, ['--full', '-y']);

      expect(confirm).not.toHaveBeenCalled();
      expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
      expect(exitCode).toBe(1);
    });
  }
);

describe('rollback: encrypted secrets', () => {
  test('a rollback is not asked about encrypted secrets: it fails and releases the lock', async () => {
    terminal = true;
    rollbackPromotion.mockRejectedValue(new Error('failed'));
    readPromotionStatus.mockResolvedValue(
      failure('rollback', { encryptedSecrets: ['* am/services/x.json:9'] })
    );

    const { exitCode } = await run(setupRollback, ['--full', '-y']);

    expect(confirm).not.toHaveBeenCalled();
    expect(rollbackPromotion).toHaveBeenCalledTimes(1);
    expect(unlockEnvironment).toHaveBeenCalledWith(LOCK_ID, true);
    expect(exitCode).toBe(1);
  });
});

describe('what is passed on', () => {
  test('the promoter, the description and the ticket reference of a promotion reach the request', async () => {
    await run(setupRunPromotion, [
      '--full',
      '-y',
      '-P',
      'Jane Doe',
      '--description',
      'Release 7',
      '-t',
      'TKT-1',
    ]);

    expect(promoteConfiguration).toHaveBeenCalledWith(
      {
        dryRun: false,
        ignoreEncryptedSecrets: false,
        unlockEnvironmentsAfterPromotion: false,
        promoter: 'Jane Doe',
        promotionDescription: 'Release 7',
        zendeskTicketReference: 'TKT-1',
      },
      true,
      undefined,
      undefined
    );
  });

  test('the dry run asks for a dry run', async () => {
    await run(setupRunDryrunPromotion, ['--full', '-y']);

    expect(promoteConfiguration.mock.calls[0][0].dryRun).toBe(true);
  });
});
