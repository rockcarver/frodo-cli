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
type Operation = {
  /** what it is called in a sentence */
  noun: string;
  /** what the question asks to do, as a verb phrase */
  what: string;
  statusType: 'promotion' | 'rollback';
  /** whether the platform can stop it for encrypted secrets, which a person may answer */
  canFindEncryptedSecrets: boolean;
};

const PROMOTION: Operation = {
  noun: 'promotion',
  what: 'run a promotion',
  statusType: 'promotion',
  canFindEncryptedSecrets: true,
};
const DRY_RUN: Operation = {
  noun: 'dry-run promotion',
  what: 'run a dry-run promotion',
  statusType: 'promotion',
  canFindEncryptedSecrets: true,
};
const ROLLBACK: Operation = {
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
 * @param {Operation} op the operation
 * @param {boolean} full whether the command also locks and unlocks the environments
 * @returns {string} the warning
 */
function warningFor(op: Operation, full: boolean): string {
  const host = state.getHost();
  const locks = full
    ? ' It locks both environments first and unlocks them when it has ended.'
    : '';
  switch (op) {
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
 * @param {Operation} op the operation
 * @param {boolean} full whether the command also locks and unlocks the environments
 * @param {boolean} yes whether `--yes` was given
 * @returns {Promise<boolean>} true if the operation may start; the reason was printed otherwise
 */
function mayStart(
  op: Operation,
  full: boolean,
  yes: boolean | undefined
): Promise<boolean> {
  return confirmProceed({
    what: op.what,
    yes,
    dryRunAvailable: false,
    warning: warningFor(op, full),
  });
}

/** A command of the promotion group for a message, on a line of its own. */
function commandLine(verb: string, options = ''): string {
  return `  ${c.command(`frodo config promote ${verb}${options} ${state.getHost()}`)}`;
}

/** The command that shows the lock state, on a line of its own. */
const checkLockCommand = () => commandLine('lock-status');

/** The command that shows where the promotion stands, on a line of its own. */
const checkStatusCommand = () => commandLine('status');

/** The command that releases the lock of a promotion by its id, on a line of its own. */
const unlockCommand = (lockId: string) =>
  commandLine('unlock', ` --id ${lockId}`);

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
 * @param {Operation} op the operation
 * @param {string[]} encryptedSecrets the encrypted secrets the platform found
 * @returns {Promise<boolean>} true if the person said to go on without fixing them
 */
async function mayIgnoreEncryptedSecrets(
  op: Operation,
  encryptedSecrets: string[]
): Promise<boolean> {
  const list = encryptedSecrets.join('\n');
  const advice = `Add environment secrets and variables (ESVs) for them to ${state.getHost()} and run the command again, or run it again with -I, --ignore-encrypted-secrets to go on without them.`;
  if (!canPrompt()) {
    printMessage(
      `The ${op.noun} stopped because the configuration holds encrypted secrets:\n${list}\nThere is no interactive terminal to ask whether to go on without them, and -y, --yes does not answer this question. ${advice}`,
      'error'
    );
    return false;
  }
  try {
    return await confirmProceed({
      what: `run the ${op.noun} again and ignore the encrypted secrets`,
      yes: false,
      dryRunAvailable: false,
      warning: `The ${op.noun} stopped because the configuration holds encrypted secrets:\n${list}\n${advice}`,
      declined: `The ${op.noun} was not run again; the environments are unlocked next.`,
    });
  } catch {
    // a question that is closed with Ctrl-C is a no, and the lock must still be released
    return false;
  }
}

/**
 * After a lock request that failed, or that did not return an id: say what the
 * environments are in, and release NOTHING. The only lock this command ever
 * releases is the one whose id came back from its own lock request; after a
 * failed request there is no such id, and a lock that exists now may as well be
 * somebody else's (the likeliest reason for a refused request is a lock that
 * somebody else holds). The state is read once and named, with the id and the
 * command that releases it.
 * @param {Operation} op the operation
 */
async function explainFailedLock(op: Operation): Promise<void> {
  let now: LockStatus | undefined;
  try {
    now = await readLockStatus(false);
  } catch {
    now = undefined;
  }
  if (!now) {
    printMessage(
      `The ${op.noun} did not start. The lock state cannot be read, so nothing was unlocked. Look at it with:\n${checkLockCommand()}`,
      'error'
    );
    return;
  }
  const ids = lockIdsOf(now);
  if (now.result === 'unlocked') {
    printMessage(
      `The ${op.noun} did not start. The environments are unlocked: nothing was locked.`,
      'warn'
    );
    return;
  }
  printMessage(
    `The ${op.noun} did not start. The environments are ${now.result}${ids.length ? ` (lock id ${ids.join(', ')})` : ''}. This command releases no lock that its own lock request did not return, and cannot tell whether this one is somebody else's, so nothing was unlocked. Look at:\n${checkLockCommand()}${ids.length ? `\nIf that lock is left over from the lock request of this command, release it with:\n${unlockCommand(ids[0])}` : ''}`,
    'error'
  );
}

/**
 * The lock that came back from the wait has another id than the lock request of
 * this command returned. The command cannot tell whose lock it is: somebody
 * else's, or a second lock request that the library sent while the first was not
 * yet visible and that got an id of its own. Nothing is started and nothing is
 * released; both ids are named with the command that releases a lock by its id.
 * @param {Operation} op the operation
 * @param {string} ownId the id that the lock request of this command returned
 * @param {string | undefined} foundId the id that the wait returned
 */
function explainForeignLock(
  op: Operation,
  ownId: string,
  foundId: string | undefined
): void {
  printMessage(
    `The ${op.noun} did not start. The lock that came back has another id than the one this command asked for (${foundId ?? 'no id'} instead of ${ownId}): this command cannot tell whose lock it is. Nothing was started and nothing was unlocked. Look at:\n${checkLockCommand()}\nA lock that is left over is released by its id:${foundId ? `\n${unlockCommand(foundId)}` : ''}\n${unlockCommand(ownId)}`,
    'error'
  );
}

/** How the operation of `--full` ended: `unfinished` is still running, or its state cannot be read. */
type OperationResult = 'done' | 'failed' | 'unfinished';

/** What became of the unlock of `--full`: `kept` is left on purpose. */
type UnlockResult = 'done' | 'failed' | 'kept';

/**
 * Run an operation between a lock and an unlock of the environments (`--full`).
 *
 * The lock contract:
 * - it starts only when both environments are unlocked and no operation runs,
 *   read right before the lock request (after the question); a lock that
 *   somebody else takes in the two round trips after that reading is not seen by
 *   this reading;
 * - the only lock it ever releases is the one whose id came back from its own
 *   lock request. It keeps that id across the wait and compares it with the id
 *   that the wait returns: another id is not the lock this command asked for,
 *   and then nothing is started and nothing is released. This comparison sees a
 *   lock that somebody else took in between only if the platform gives every
 *   lock request its own id. If the platform answers a lock request on a lock
 *   that is held with the id of the HELD lock, the comparison cannot see it, and
 *   the command would go on under that lock and release it. Whether the platform
 *   answers like that is not verified; the attended recording session is to
 *   probe it;
 * - it unlocks that lock after every outcome that has ended: success, an error
 *   of the platform, a refused request, an answer of no to the encrypted
 *   secrets;
 * - it does not unlock while the platform is still working on the operation (a
 *   `--timeout` that ended the wait leaves it running) or when the status cannot
 *   be read: the lock stays, on purpose, and the output says so and how to
 *   release it;
 * - after a lock request that failed it releases nothing: it names the state, the
 *   lock id and the command that releases it.
 * @param {object} options what to run
 * @param {Operation} options.op the operation
 * @param {boolean} options.yes whether `--yes` was given
 * @param {boolean} options.ignoreEncryptedSecrets whether to go on although the platform finds encrypted secrets
 * @param {(ignoreEncryptedSecrets: boolean) => Promise<string | object>} options.start starts the operation, waits for it to end and answers what the platform said; it throws when it fails
 * @returns {Promise<boolean>} true if the lock, the operation and the unlock all succeeded
 */
async function runBetweenLockAndUnlock({
  op,
  yes,
  ignoreEncryptedSecrets,
  start,
}: {
  op: Operation;
  yes?: boolean;
  ignoreEncryptedSecrets: boolean;
  start: (ignoreEncryptedSecrets: boolean) => Promise<string | object>;
}): Promise<boolean> {
  // Asked first and the state read after it: the person can take minutes to
  // answer, and the state that is read must be the state the lock is taken in.
  if (!(await mayStart(op, true, yes))) return false;

  let before: LockStatus;
  try {
    before = await readLockStatus(false);
  } catch (error) {
    printError(error);
    printMessage(
      `The lock state cannot be read. Nothing was sent: the ${op.noun} did not start.`,
      'error'
    );
    return false;
  }
  if (before.result !== 'unlocked') {
    const ids = lockIdsOf(before);
    printMessage(
      `Not starting the ${op.noun}: the environments are not unlocked (state ${before.result}${ids.length ? `, lock id ${ids.join(', ')}` : ''}). Nothing was sent. Another promotion or rollback may be running, or a lock was left behind. Look at:\n${checkLockCommand()}\n${checkStatusCommand()}${ids.length ? `\nA lock that was left behind is released with:\n${unlockCommand(ids[0])}` : ''}`,
      'error'
    );
    return false;
  }

  // an operation that runs is refused before anything is locked, so that
  // there is nothing to release for a run that never began (a status that
  // cannot be read does not end the run, as in the library)
  const running = await readStatusOrUndefined();
  if (running?.status === 'RUNNING') {
    printMessage(
      `Not starting the ${op.noun}: an operation is already running on ${state.getHost()} (status ${running.status}, type ${running.type ?? 'unknown'}, promotion id ${running.promotionId ?? 'unknown'}). Nothing was locked and nothing was sent. See where it stands with:\n${checkStatusCommand()}`,
      'error'
    );
    return false;
  }

  printMessage(
    `Locking both environments. If this command is stopped now, they may end up locked; this shows it:\n${checkLockCommand()}`,
    'info'
  );
  // The lock is requested without waiting, so that the answer carries the id of
  // THIS request. That id is kept across the wait and compared with the id that
  // the wait returns. The comparison catches a lock that somebody else took in
  // between only if the platform gives every lock request its own id: if it
  // answers a lock request on a held lock with the id of the HELD lock, the
  // comparison cannot see it (the window is the two round trips between the
  // reading of the state and this request; this platform behaviour is not
  // verified, the attended recording session is to probe it).
  let lockId: string | undefined;
  try {
    lockId = (await lockEnvironment(false)).promotionId;
  } catch (error) {
    printError(error);
  }
  if (!lockId) {
    await explainFailedLock(op);
    return false;
  }
  printMessage(
    `The lock request was accepted (lock id ${lockId}). It can take minutes. If this command is stopped before it has unlocked the environments again, they stay locked: release them with:\n${unlockCommand(lockId)}`,
    'warn'
  );
  try {
    const locked = await lockEnvironment(true);
    if (locked.promotionId !== lockId) {
      explainForeignLock(op, lockId, locked.promotionId);
      return false;
    }
  } catch (error) {
    printError(error);
    printMessage(
      `The ${op.noun} did not start. The lock request was accepted (lock id ${lockId}), but the wait for the lock failed: the environments may be locking or locked. Nothing was unlocked. Look at:\n${checkLockCommand()}\nIf the lock is left over, release it with:\n${unlockCommand(lockId)}`,
      'error'
    );
    return false;
  }

  let operationResult: OperationResult;
  let ignore = ignoreEncryptedSecrets;
  for (;;) {
    try {
      printMessage(await start(ignore), 'data');
      operationResult = 'done';
      break;
    } catch (error) {
      printError(error);
      const status = await readStatusOrUndefined();
      if (!status || isInProgress(status)) {
        operationResult = 'unfinished';
        break;
      }
      operationResult = 'failed';
      // an ERROR of an earlier run (another promotion id) is not ours to report
      const ours =
        status.status === 'ERROR' &&
        status.promotionId === lockId &&
        status.type === op.statusType;
      if (!ours) break;
      if (status.missingESVs?.length) {
        printMessage(
          `The ${op.noun} stopped: ${state.getHost()} lacks configuration that it needs. Add these secrets and variables there, then run the command again:\n${status.missingESVs.join('\n')}`,
          'error'
        );
        break;
      }
      if (
        op.canFindEncryptedSecrets &&
        status.encryptedSecrets?.length &&
        !ignore &&
        (await mayIgnoreEncryptedSecrets(op, status.encryptedSecrets))
      ) {
        ignore = true;
        continue;
      }
      break;
    }
  }

  let unlockResult: UnlockResult;
  if (operationResult === 'unfinished') {
    unlockResult = 'kept';
    printMessage(
      `The lock stays on purpose (lock id ${lockId}): the ${op.noun} may still be running, or its state cannot be read, and unlocking the environments under a running operation is not safe. See where it stands with:\n${checkStatusCommand()}\nWhen it has ended, release the lock with:\n${unlockCommand(lockId)}`,
      'error'
    );
  } else {
    try {
      await unlockEnvironment(lockId, true);
      unlockResult = 'done';
    } catch (error) {
      printError(error);
      unlockResult = 'failed';
      printMessage(
        `The environments are still locked (lock id ${lockId}). Release them with:\n${unlockCommand(lockId)}`,
        'error'
      );
    }
  }

  const ok = operationResult === 'done' && unlockResult === 'done';
  printMessage(
    `Lock: done. ${op.noun.charAt(0).toUpperCase()}${op.noun.slice(1)}: ${operationResult === 'unfinished' ? 'not finished' : operationResult}. Unlock: ${unlockResult === 'kept' ? 'kept on purpose' : unlockResult}.`,
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
        op: ROLLBACK,
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
  const op = dryRun ? DRY_RUN : PROMOTION;
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
        op,
        yes,
        ignoreEncryptedSecrets,
        start: (ignore) => start(true, ignore),
      });
    }
    if (!(await mayStart(op, false, yes))) return false;
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
