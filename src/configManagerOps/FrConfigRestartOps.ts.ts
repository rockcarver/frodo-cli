import { frodo } from '@rockcarver/frodo-lib';

import { printError, printMessage } from '../utils/Console';

const { checkForUpdates, applyUpdates, readStatus } = frodo.cloud.startup;

/**
 * Restart the environment to apply pending ESV updates.
 * @param {boolean} status if true, only report the current restart status without restarting
 * @param {boolean} check if true, only restart if there are ESVs that need loading
 * @param {boolean} wait if true, wait for the restart to complete before returning
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerRestart(
  status?: boolean,
  check?: boolean,
  wait?: boolean
): Promise<boolean> {
  try {
    const restartStatus = await readStatus();
    if (status) {
      printMessage(restartStatus);
      return true;
    }
    if (restartStatus === 'restarting') {
      printMessage('Environment already restarting.', 'error');
      return false;
    }
    if (check) {
      const updates = await checkForUpdates();
      const updateCount =
        (updates.secrets?.length || 0) + (updates.variables?.length || 0);
      if (updateCount === 0) {
        printMessage('All ESVs loaded - not restarting');
        return true;
      }
    }
    return await applyUpdates(!!wait);
  } catch (error) {
    printError(error, 'Error restarting environment');
    return false;
  }
}
