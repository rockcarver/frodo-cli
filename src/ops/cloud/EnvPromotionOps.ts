import { frodo, state } from '@rockcarver/frodo-lib';
import { confirmProceed } from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { printError, printMessage } from '../../utils/Console';
import { canPrompt } from '../../utils/interactive/PromptGateState';
import { secondsToMilliseconds } from '../../utils/SecondsOption';

const {
  readPromotionStatus,
  runProvisionalPromotionReport,
  runProvisionalRollbackReport,
  readPromotionReport,
  readPromotionReports,
  readLastPromotionReport,
  lockEnvironment,
  unlockEnvironment,
  rollbackPromotion: rollbackPromotionInLib,
  promoteConfiguration,
  readLockStatus,
} = frodo.cloud.env.promotion;

type LockStatus = Awaited<ReturnType<typeof readLockStatus>>;
type PromotionStatus = Awaited<ReturnType<typeof readPromotionStatus>>;

/**
 * The three operations of the promotion group that start something on the
 * platform. `statusType` is the type that the status of the platform reports
 * while it works on one of them (a dry run is reported as a promotion).
 */
type Kind = {
  /** what it is called in a sentence */
  noun: string;
  /** what the question asks to do, as a verb phrase */
  what: string;
  statusType: 'promotion' | 'rollback';
  /** whether the platform can stop it for encrypted secrets, which a person may answer */
  canFindEncryptedSecrets: boolean;
};

const PROMOTION: Kind = {
  noun: 'promotion',
  what: 'run a promotion',
  statusType: 'promotion',
  canFindEncryptedSecrets: true,
};
const DRY_RUN: Kind = {
  noun: 'dry-run promotion',
  what: 'run a dry-run promotion',
  statusType: 'promotion',
  canFindEncryptedSecrets: true,
};
const ROLLBACK: Kind = {
  noun: 'rollback',
  what: 'roll back the previous promotion',
  statusType: 'rollback',
  canFindEncryptedSecrets: false,
};

/**
 * Check promotion status.
 * @returns {Promise<boolean>} True if the status was retrieved successfully, false otherwise.
 */
export async function checkPromotionStatus(): Promise<boolean> {
  try {
    const response = await readPromotionStatus();
    printMessage(response, 'data');
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Check promotion reports. The latest report if no option is given.
 * @param {string} reportId Optional ID of a specific promotion report.
 * @param {boolean} list Whether to list all promotion reports.
 * @param {boolean} provisional Whether to retrieve the provisional promotion report.
 * @param {boolean} provisionalRollback Whether to retrieve the provisional rollback report.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function checkPromotionReports({
  reportId,
  list = false,
  provisional = false,
  provisionalRollback = false,
}: {
  reportId?: string;
  list?: boolean;
  provisional?: boolean;
  provisionalRollback?: boolean;
} = {}): Promise<boolean> {
  try {
    let response;
    if (provisional) {
      response = await runProvisionalPromotionReport();
    } else if (provisionalRollback) {
      response = await runProvisionalRollbackReport();
    } else if (reportId) {
      response = await readPromotionReport(reportId);
    } else if (list) {
      response = await readPromotionReports();
    } else {
      response = await readLastPromotionReport();
    }
    printMessage(response, 'data');
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Convert the seconds of `--timeout` to the milliseconds the library takes.
 * @param {number} seconds number of seconds, or undefined to leave the default of the library
 * @returns {number | undefined} number of milliseconds, or undefined
 */
function timeoutMilliseconds(seconds?: number): number | undefined {
  return seconds === undefined ? undefined : secondsToMilliseconds(seconds);
}

/**
 * What the question before an operation tells the person, above the question.
 * @param {Kind} kind the operation
 * @param {boolean} full whether the command also locks and unlocks the environments
 * @returns {string} the warning
 */
function warningFor(kind: Kind, full: boolean): string {
  const host = state.getHost();
  const locks = full
    ? ' It locks both environments first and unlocks them when it has ended.'
    : '';
  switch (kind) {
    case PROMOTION:
      return `This promotes the configuration of the lower environment to ${host}: all differences between the two environments are carried over. It runs for several minutes.${locks}`;
    case DRY_RUN:
      return `A dry-run promotion to ${host} changes no configuration, but it runs for several minutes.${locks}`;
    default:
      return `This rolls the configuration of ${host} back to what it was before the previous promotion. It runs for several minutes.${locks}`;
  }
}

/**
 * Ask whether the operation may start (the shared question of the guard: a
 * terminal is asked and the default answer is no, `yes` skips it, and without a
 * terminal and without `yes` it is refused).
 * @param {Kind} kind the operation
 * @param {boolean} full whether the command also locks and unlocks the environments
 * @param {boolean} yes whether `--yes` was given
 * @returns {Promise<boolean>} true if the operation may start; the reason was printed otherwise
 */
function mayStart(
  kind: Kind,
  full: boolean,
  yes: boolean | undefined
): Promise<boolean> {
  return confirmProceed({
    what: kind.what,
    yes,
    dryRunAvailable: false,
    warning: warningFor(kind, full),
  });
}

/** A command of the promotion group for a message, on a line of its own. */
function commandLine(verb: string, options = ''): string {
  return `  ${c.command(`frodo config-manager promote ${verb}${options} ${state.getHost()}`)}`;
}

/** The command that shows the lock state, on a line of its own. */
const checkLockCommand = () => commandLine('check-locked-status');

/** The command that shows where the promotion stands, on a line of its own. */
const checkStatusCommand = () => commandLine('check-promotion-status');

/** The command that releases the lock of a promotion by its id, on a line of its own. */
const unlockCommand = (lockId: string) =>
  commandLine('unlock-tenants', ` --id ${lockId}`);

/** The ids of the locks that a lock status names, without repeats. */
function lockIdsOf(lock: LockStatus): string[] {
  return [
    ...new Set(
      [lock.promotionId, lock.lowerEnv?.promotionId, lock.upperEnv?.promotionId]
        .filter(Boolean)
        .map(String)
    ),
  ];
}

/**
 * Read the status of the promotion for the decision what to do with the lock.
 * @returns {Promise<PromotionStatus | undefined>} the status, or undefined when it cannot be read
 */
async function readStatusOrUndefined(): Promise<PromotionStatus | undefined> {
  try {
    return await readPromotionStatus();
  } catch {
    return undefined;
  }
}

/**
 * The platform is working: the status says it runs, or is locking or unlocking.
 * While it does, the lock is not ours to release.
 * @param {PromotionStatus} status the status of the promotion
 * @returns {boolean} true if an operation is in progress
 */
function isInProgress(status: PromotionStatus): boolean {
  return ['RUNNING', 'LOCKING', 'UNLOCKING'].includes(status.status);
}

/**
 * Ask a person whether to go on with the operation although the configuration
 * holds encrypted secrets. This is another consent than the one for the start
 * of the command, so `--yes` does not answer it. Without a terminal nobody can
 * be asked, and the command says what to pass to answer it in advance.
 * @param {Kind} kind the operation
 * @param {string[]} encryptedSecrets the encrypted secrets the platform found
 * @returns {Promise<boolean>} true if the person said to go on without fixing them
 */
async function mayIgnoreEncryptedSecrets(
  kind: Kind,
  encryptedSecrets: string[]
): Promise<boolean> {
  const list = encryptedSecrets.join('\n');
  const advice = `Add environment secrets and variables (ESVs) for them to ${state.getHost()} and run the command again, or run it again with -I, --ignore-encrypted-secrets to go on without them.`;
  if (!canPrompt()) {
    printMessage(
      `The ${kind.noun} stopped because the configuration holds encrypted secrets:\n${list}\nThere is no interactive terminal to ask whether to go on without them, and -y, --yes does not answer this question. ${advice}`,
      'error'
    );
    return false;
  }
  try {
    return await confirmProceed({
      what: `run the ${kind.noun} again and ignore the encrypted secrets`,
      yes: false,
      dryRunAvailable: false,
      warning: `The ${kind.noun} stopped because the configuration holds encrypted secrets:\n${list}\n${advice}`,
    });
  } catch {
    // a question that is closed with Ctrl-C is a no, and the lock must still be released
    return false;
  }
}

/**
 * After a lock request that failed: the environments were unlocked a moment
 * ago, so a lock that exists now is only released when the state is `locked`
 * (the request may have taken the lock before it failed). Any other state is
 * left alone: it is not ours.
 * @param {Kind} kind the operation
 */
async function releaseAfterFailedLock(kind: Kind): Promise<void> {
  let now: LockStatus | undefined;
  try {
    now = await readLockStatus(false);
  } catch {
    now = undefined;
  }
  if (!now) {
    printMessage(
      `The ${kind.noun} did not start. The lock state cannot be read, so nothing was unlocked. Look at it with:\n${checkLockCommand()}`,
      'error'
    );
    return;
  }
  if (now.result !== 'locked' || !now.promotionId) {
    printMessage(
      `The ${kind.noun} did not start. The environments are ${now.result}; nothing was unlocked.`,
      'warn'
    );
    return;
  }
  try {
    await unlockEnvironment(now.promotionId, true);
    printMessage(
      `The ${kind.noun} did not start. The lock request failed after the environments were locked, and they are unlocked again (lock id ${now.promotionId}).`,
      'warn'
    );
  } catch (error) {
    printError(error);
    printMessage(
      `The ${kind.noun} did not start. The environments are still locked (lock id ${now.promotionId}). Release them with:\n${unlockCommand(now.promotionId)}`,
      'error'
    );
  }
}

/** How the operation of `--full` ended: `unfinished` is still running, or its state cannot be read. */
type OperationResult = 'done' | 'failed' | 'unfinished';

/** What became of the unlock of `--full`: `kept` is left on purpose. */
type UnlockResult = 'done' | 'failed' | 'kept';

/**
 * Run an operation between a lock and an unlock of the environments (`--full`).
 *
 * The lock contract:
 * - it starts only when both environments are unlocked (read right before the
 *   lock request, after the question), so the lock it takes is its own and the
 *   unlock at the end does not release the lock of somebody else;
 * - it unlocks after every outcome that has ended: success, an error of the
 *   platform, a refused request, an answer of no to the encrypted secrets;
 * - it does not unlock while the platform is still working on the operation (a
 *   `--timeout` that ended the wait leaves it running) or when the status cannot
 *   be read: the lock stays, on purpose, and the output says so and how to
 *   release it;
 * - after a lock request that failed it unlocks only a state that is `locked`.
 * @param {object} options what to run
 * @param {Kind} options.kind the operation
 * @param {boolean} options.yes whether `--yes` was given
 * @param {boolean} options.ignoreEncryptedSecrets whether to go on although the platform finds encrypted secrets
 * @param {(ignoreEncryptedSecrets: boolean) => Promise<string | object>} options.start starts the operation, waits for it to end and answers what the platform said; it throws when it fails
 * @returns {Promise<boolean>} true if the lock, the operation and the unlock all succeeded
 */
async function runBetweenLockAndUnlock({
  kind,
  yes,
  ignoreEncryptedSecrets,
  start,
}: {
  kind: Kind;
  yes?: boolean;
  ignoreEncryptedSecrets: boolean;
  start: (ignoreEncryptedSecrets: boolean) => Promise<string | object>;
}): Promise<boolean> {
  // Asked first and the state read after it: the person can take minutes to
  // answer, and the state that is read must be the state the lock is taken in.
  if (!(await mayStart(kind, true, yes))) return false;

  let before: LockStatus;
  try {
    before = await readLockStatus(false);
  } catch (error) {
    printError(error);
    printMessage(
      `The lock state cannot be read. Nothing was sent: the ${kind.noun} did not start.`,
      'error'
    );
    return false;
  }
  if (before.result !== 'unlocked') {
    const ids = lockIdsOf(before);
    printMessage(
      `Not starting the ${kind.noun}: the environments are not unlocked (state ${before.result}${ids.length ? `, lock id ${ids.join(', ')}` : ''}). Nothing was sent. Another promotion or rollback may be running, or a lock was left behind. Look at:\n${checkLockCommand()}\n${checkStatusCommand()}${ids.length ? `\nA lock that was left behind is released with:\n${unlockCommand(ids[0])}` : ''}`,
      'error'
    );
    return false;
  }

  let lockId: string | undefined;
  try {
    lockId = (await lockEnvironment(true)).promotionId;
  } catch (error) {
    printError(error);
  }
  if (!lockId) {
    await releaseAfterFailedLock(kind);
    return false;
  }
  printMessage(
    `Locked both environments (lock id ${lockId}). If this command is stopped before it has unlocked them, release the lock with:\n${unlockCommand(lockId)}`,
    'info'
  );

  let operation: OperationResult;
  let ignore = ignoreEncryptedSecrets;
  for (;;) {
    try {
      printMessage(await start(ignore), 'data');
      operation = 'done';
      break;
    } catch (error) {
      printError(error);
      const status = await readStatusOrUndefined();
      if (!status || isInProgress(status)) {
        operation = 'unfinished';
        break;
      }
      operation = 'failed';
      // an ERROR of an earlier run (another promotion id) is not ours to report
      const ours =
        status.status === 'ERROR' &&
        status.promotionId === lockId &&
        status.type === kind.statusType;
      if (!ours) break;
      if (status.missingESVs?.length) {
        printMessage(
          `The ${kind.noun} stopped: ${state.getHost()} lacks configuration that it needs. Add these secrets and variables there, then run the command again:\n${status.missingESVs.join('\n')}`,
          'error'
        );
        break;
      }
      if (
        kind.canFindEncryptedSecrets &&
        status.encryptedSecrets?.length &&
        !ignore &&
        (await mayIgnoreEncryptedSecrets(kind, status.encryptedSecrets))
      ) {
        ignore = true;
        continue;
      }
      break;
    }
  }

  let unlock: UnlockResult;
  if (operation === 'unfinished') {
    unlock = 'kept';
    printMessage(
      `The lock stays on purpose (lock id ${lockId}): the ${kind.noun} may still be running, or its state cannot be read, and unlocking the environments under a running operation is not safe. See where it stands with:\n${checkStatusCommand()}\nWhen it has ended, release the lock with:\n${unlockCommand(lockId)}`,
      'error'
    );
  } else {
    try {
      await unlockEnvironment(lockId, true);
      unlock = 'done';
    } catch (error) {
      printError(error);
      unlock = 'failed';
      printMessage(
        `The environments are still locked (lock id ${lockId}). Release them with:\n${unlockCommand(lockId)}`,
        'error'
      );
    }
  }

  const ok = operation === 'done' && unlock === 'done';
  printMessage(
    `Lock: done. ${kind.noun.charAt(0).toUpperCase()}${kind.noun.slice(1)}: ${operation === 'unfinished' ? 'not finished' : operation}. Unlock: ${unlock === 'kept' ? 'kept on purpose' : unlock}.`,
    ok ? 'info' : 'error'
  );
  return ok;
}

/**
 * Roll back the previous promotion.
 *
 * With `full` the rollback runs between a lock and an unlock of the
 * environments and waits for each step (see `runBetweenLockAndUnlock` for the
 * lock contract); `unlockAfter` and `wait` are then implied, and the platform is
 * asked not to unlock by itself, because the command does.
 * @param {string} promoter Optional name of the person performing the rollback.
 * @param {string} description Optional description of the rollback.
 * @param {string} ticketReference Optional Zendesk ticket reference.
 * @param {boolean} unlockAfter Whether to unlock environments after rollback.
 * @param {boolean} wait Whether to wait for the rollback to complete.
 * @param {number} timeout Maximum time to wait in seconds. Default: the library default (2700 seconds, 45 minutes). With full it bounds the rollback only.
 * @param {boolean} full Whether to lock the environments, roll back and unlock them, waiting for each step.
 * @param {boolean} yes Whether `--yes` was given: the question before the rollback starts is not asked.
 * @returns {Promise<boolean>} True if the rollback request succeeds, or if waiting, the rollback completes successfully; with full, if the lock, the rollback and the unlock all succeed. False otherwise.
 */
export async function rollbackPromotion({
  promoter,
  description,
  ticketReference,
  unlockAfter = false,
  wait = false,
  timeout,
  full = false,
  yes = false,
}: {
  promoter?: string;
  description?: string;
  ticketReference?: string;
  unlockAfter?: boolean;
  wait?: boolean;
  timeout?: number;
  full?: boolean;
  yes?: boolean;
} = {}): Promise<boolean> {
  const start = async (waitForIt: boolean) =>
    rollbackPromotionInLib(
      {
        unlockEnvironmentsAfterPromotion: full ? false : unlockAfter,
        promoter,
        promotionDescription: description,
        zendeskTicketReference: ticketReference,
      },
      waitForIt,
      undefined,
      timeoutMilliseconds(timeout)
    );
  try {
    if (full) {
      return await runBetweenLockAndUnlock({
        kind: ROLLBACK,
        yes,
        ignoreEncryptedSecrets: false,
        start: () => start(true),
      });
    }
    if (!(await mayStart(ROLLBACK, false, yes))) return false;
    printMessage(await start(wait), 'data');
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Lock tenants and wait until they are locked.
 * @returns {Promise<boolean>} True if tenants were successfully locked, false otherwise.
 */
export async function lockTenants(): Promise<boolean> {
  try {
    // Poll interval is 60s for config-manager, but the UI uses 10s. 60s is very long, so we use 10s instead.
    const lockStatus = await lockEnvironment(true);
    printMessage(
      {
        status: lockStatus.result,
        promotionId: lockStatus.promotionId,
      },
      'data'
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Unlock tenants and wait until they are unlocked.
 * @param {string} promotionId Optional promotion ID associated with the lock. If not specified, it is read from the environment lock status.
 * @returns {Promise<boolean>}  True if tenants were successfully unlocked, false otherwise.
 */
export async function unlockTenants(promotionId?: string): Promise<boolean> {
  try {
    // Poll interval is 60s for config-manager, but the UI uses 10s. 60s is very long, so we use 10s instead.
    const lockStatus = await unlockEnvironment(promotionId, true);
    printMessage(
      {
        status: lockStatus.result,
      },
      'data'
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Run a configuration promotion or dry-run promotion.
 *
 * With `full` the promotion runs between a lock and an unlock of the
 * environments and waits for each step (see `runBetweenLockAndUnlock` for the
 * lock contract); `unlockAfter` and `wait` are then implied, and the platform is
 * asked not to unlock by itself, because the command does. When the platform
 * stops for encrypted secrets, a person at a terminal is asked whether to go on
 * without fixing them (`yes` does not answer that question).
 * @param {boolean} dryRun Whether to simulate the promotion.
 * @param {boolean} ignoreEncryptedSecrets Whether to ignore encrypted secrets.
 * @param {boolean} unlockAfter Whether to unlock environments after promotion.
 * @param {string} promoter Optional name of the person performing the promotion.
 * @param {string} description Optional description of the promotion.
 * @param {string} ticketReference Optional Zendesk ticket reference.
 * @param {boolean} wait Whether to wait for the promotion to complete.
 * @param {number} timeout Maximum time to wait in seconds. Default: the library default (2700 seconds, 45 minutes). With full it bounds the promotion only.
 * @param {boolean} full Whether to lock the environments, promote and unlock them, waiting for each step.
 * @param {boolean} yes Whether `--yes` was given: the question before the promotion starts is not asked.
 * @returns {Promise<boolean>} True if the request succeeds, or if waiting, the promotion completes successfully; with full, if the lock, the promotion and the unlock all succeed. False otherwise.
 */
export async function runPromotion({
  dryRun,
  ignoreEncryptedSecrets = false,
  unlockAfter = false,
  promoter,
  description,
  ticketReference,
  wait = false,
  timeout,
  full = false,
  yes = false,
}: {
  dryRun: boolean;
  ignoreEncryptedSecrets?: boolean;
  unlockAfter?: boolean;
  promoter?: string;
  description?: string;
  ticketReference?: string;
  wait?: boolean;
  timeout?: number;
  full?: boolean;
  yes?: boolean;
}): Promise<boolean> {
  const kind = dryRun ? DRY_RUN : PROMOTION;
  const start = async (waitForIt: boolean, ignore: boolean) =>
    promoteConfiguration(
      {
        dryRun,
        ignoreEncryptedSecrets: ignore,
        unlockEnvironmentsAfterPromotion: full ? false : unlockAfter,
        promoter,
        promotionDescription: description,
        zendeskTicketReference: ticketReference,
      },
      waitForIt,
      undefined,
      timeoutMilliseconds(timeout)
    );
  try {
    if (full) {
      return await runBetweenLockAndUnlock({
        kind,
        yes,
        ignoreEncryptedSecrets,
        start: (ignore) => start(true, ignore),
      });
    }
    if (!(await mayStart(kind, false, yes))) return false;
    printMessage(await start(wait, ignoreEncryptedSecrets), 'data');
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Check the lock status of tenants.
 * @param {boolean} localLockOnly Whether to show only the requested environment's lock status.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function checkLockedStatus(
  localLockOnly: boolean = false
): Promise<boolean> {
  try {
    const response = await readLockStatus(localLockOnly);
    printMessage(response, 'data');
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
