import { frodo } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../../utils/Console';

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
 * Convert minutes to milliseconds.
 * @param {number} minutes number of minutes, or undefined to leave the default of the library
 * @returns {number | undefined} number of milliseconds, or undefined
 */
function minutesToMilliseconds(minutes?: number): number | undefined {
  return minutes === undefined ? undefined : Math.round(minutes * 60 * 1000);
}

/**
 * Roll back the previous promotion.
 * @param {string} promoter Optional name of the person performing the rollback.
 * @param {string} description Optional description of the rollback.
 * @param {string} ticketReference Optional Zendesk ticket reference.
 * @param {boolean} unlockAfter Whether to unlock environments after rollback.
 * @param {boolean} wait Whether to wait for the rollback to complete.
 * @param {number} timeout Maximum time to wait in minutes. Default: the library default (45 minutes)
 * @returns {Promise<boolean>} True if the rollback request succeeds, or if waiting, the rollback completes successfully; false otherwise.
 */
export async function rollbackPromotion({
  promoter,
  description,
  ticketReference,
  unlockAfter = false,
  wait = false,
  timeout,
}: {
  promoter?: string;
  description?: string;
  ticketReference?: string;
  unlockAfter?: boolean;
  wait?: boolean;
  timeout?: number;
} = {}): Promise<boolean> {
  try {
    const response = await rollbackPromotionInLib(
      {
        unlockEnvironmentsAfterPromotion: unlockAfter,
        promoter,
        promotionDescription: description,
        zendeskTicketReference: ticketReference,
      },
      wait,
      undefined,
      minutesToMilliseconds(timeout)
    );
    printMessage(response, 'data');
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
 * @param {boolean} dryRun Whether to simulate the promotion.
 * @param {boolean} ignoreEncryptedSecrets Whether to ignore encrypted secrets.
 * @param {boolean} unlockAfter Whether to unlock environments after promotion.
 * @param {string} promoter Optional name of the person performing the promotion.
 * @param {string} description Optional description of the promotion.
 * @param {string} ticketReference Optional Zendesk ticket reference.
 * @param {boolean} wait Whether to wait for the promotion to complete.
 * @param {number} timeout Maximum time to wait in minutes. Default: the library default (45 minutes)
 * @returns {Promise<boolean>} True if the request succeeds, or if waiting, the promotion completes successfully; false otherwise.
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
}: {
  dryRun: boolean;
  ignoreEncryptedSecrets?: boolean;
  unlockAfter?: boolean;
  promoter?: string;
  description?: string;
  ticketReference?: string;
  wait?: boolean;
  timeout?: number;
}): Promise<boolean> {
  try {
    const response = await promoteConfiguration(
      {
        dryRun,
        ignoreEncryptedSecrets,
        unlockEnvironmentsAfterPromotion: unlockAfter,
        promoter,
        promotionDescription: description,
        zendeskTicketReference: ticketReference,
      },
      wait,
      undefined,
      minutesToMilliseconds(timeout)
    );
    printMessage(response, 'data');
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
