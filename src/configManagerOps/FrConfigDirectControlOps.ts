import { frodo } from '@rockcarver/frodo-lib';
import { DirectConfigurationSessionState } from '@rockcarver/frodo-lib/types/api/cloud/EnvDirectConfigurationSessionApi';

import { printError, printMessage } from '../utils/Console';
import { sleep } from '../utils/FrConfig'

const {
  readDirectConfigurationSessionState,
  initDirectConfigurationSession,
  applyDirectConfigurationSession,
  abortDirectConfigurationSession,
} = frodo.cloud.env;

/**
 * Read the current direct configuration session state.
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerReadDirectConfigurationSessionState(): Promise<boolean> {
  try {
    const response: DirectConfigurationSessionState =
      await readDirectConfigurationSessionState();

    printMessage(response, 'data');
    return true;
  } catch (error) {
    printError(error, 'Error reading direct configuration session state.');
    return false;
  }
}

/**
 * Initialize a new direct configuration session.
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerInitDirectConfigurationSession(): Promise<boolean> {
  try {
    const response: DirectConfigurationSessionState =
      await initDirectConfigurationSession();

    printMessage(response, 'data');
    return true;
  } catch (error) {
    printError(error, 'Error initiating direct configuration session.');
    return false;
  }
}

/**
 * Apply changes to the current direct configuration session.
 * @param {boolean} wait if true wait until configuration is applied
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerApplyDirectConfigurationSession(
  wait: boolean = false
): Promise<boolean> {
  try {
    let response: DirectConfigurationSessionState =
      await applyDirectConfigurationSession();
    printMessage(response, 'data');

    if (wait) {
      const pollIntervalSeconds = 10;
      while(response.status !== 'SESSION_APPLIED') {
        await sleep(pollIntervalSeconds * 1000);
        response = await readDirectConfigurationSessionState();

        printMessage(`Status: ${response.status}`);

        if (response.status === 'ERROR') {
          printMessage('Direct Configuration session encountered an error.', 'error');
          return false;
        }
      } 
    }

    return true;
  } catch (error) {
    printError(error, 'Error applying direct configuration session.');
    return false;
  }
}

/**
 * Abort the current direct configuration session.
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerAbortDirectConfigurationSession(): Promise<boolean> {
  try {
    const response: DirectConfigurationSessionState =
      await abortDirectConfigurationSession();

    printMessage(response, 'data');
    return true;
  } catch (error) {
    printError(error, 'Error aborting direct configuration session.');
    return false;
  }
}
