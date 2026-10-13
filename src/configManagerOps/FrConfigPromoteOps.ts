import { frodo } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';

const {
  readPromotionStatus,
  runProvisionalPromotionReport,
  runProvisionalRollbackReport,
  readPromotionReport,
  readPromotionReports,
  readLastPromotionReport,
  lockEnvironment,
  unlockEnvironment,
  rollbackPromotion,
  promoteConfiguration,
  readLockStatus,
} = frodo.cloud.env.promotion;

/**
 * Check promotion status.
 * @returns {Promise<boolean>} True if the status was retrieved successfully, false otherwise.
 */
export async function configManagerCheckPromotionStatus(): Promise<boolean> {
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
 * Check promotion reports.
 * @param {string} reportId Optional ID of a specific promotion report.
 * @param {boolean} list Whether to list all promotion reports.
 * @param {boolean} provisional Whether to retrieve the provisional promotion report.
 * @param {boolean} provisionalRollback Whether to retrieve the provisional rollback report.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function configManagerCheckPromotionReports(
  reportId?: string,
  list: boolean = false,
  provisional: boolean = false,
  provisionalRollback: boolean = false
): Promise<boolean> {
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
 * Roll back the previous promotion.
 * @param {string} promoter Optional name of the person performing the rollback.
 * @param {string} description Optional description of the rollback.
 * @param {string} ticketReference Optional Zendesk ticket reference.
 * @param {boolean} unlockAfter Whether to unlock environments after rollback.
 * @returns {Promise<boolean>} True if the rollback request succeeds, false otherwise.
 */
export async function configManagerRollback(
  promoter?: string,
  description?: string,
  ticketReference?: string,
  unlockAfter: boolean = false
): Promise<boolean> {
  try {
    const response = await rollbackPromotion({
      unlockEnvironmentsAfterPromotion: unlockAfter,
      promoter: promoter ?? undefined,
      promotionDescription: description ?? undefined,
      zendeskTicketReference: ticketReference ?? undefined,
    });
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
export async function configManagerLockTenants(): Promise<boolean> {
  try {
    // Poll interval is 60s for config-manager, but the UI uses 10s. 60s is very long, so we use 10s instead.
    const lockStatus = await lockEnvironment(true);
    printMessage(
      {
        status: lockStatus.result,
        Promotionid: lockStatus.promotionId,
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
 * @param {string} promotionId Promotion ID associated with the lock.
 * @returns {Promise<boolean>}  True if tenants were successfully unlocked, false otherwise.
 */
export async function configManagerUnlockTenants(
  promotionId: string
): Promise<boolean> {
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
 * @param {string} ticketReference Optional zendesk ticket reference.
 * @returns true if successful, false otherwise.
 */
export async function configManagerRunPromotion(
  dryRun: boolean,
  ignoreEncryptedSecrets: boolean = false,
  unlockAfter: boolean = false,
  promoter?: string,
  description?: string,
  ticketReference?: string
): Promise<boolean> {
  try {
    const response = await promoteConfiguration({
      dryRun,
      ignoreEncryptedSecrets,
      unlockEnvironmentsAfterPromotion: unlockAfter,
      promoter: promoter ?? undefined,
      promotionDescription: description ?? undefined,
      zendeskTicketReference: ticketReference ?? undefined,
    });
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
export async function configManagerCheckLockedStatus(
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
