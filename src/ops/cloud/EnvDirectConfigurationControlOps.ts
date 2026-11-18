import {
  frodo,
  type DirectConfigurationSessionState,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../../utils/Console';
import { sleep } from '../../utils/FrConfig';

const APPLIED_MESSAGE = `Configuration applied and direct configuration session ended. Use 'frodo dcc session init' to start a new session.`;

export async function readDirectConfigurationSessionState(
  json: boolean = false
): Promise<boolean> {
  try {
    const response: DirectConfigurationSessionState =
      await frodo.cloud.env.readDirectConfigurationSessionState();
    if (json) {
      printMessage(response, 'data');
    } else {
      if (response.editable) {
        printMessage(
          `Direct configuration session is active and editable${response.status ? ` (Status: ${response.status})` : ''}. Changes can be applied or aborted.`
        );
      } else {
        printMessage(
          `No active direct configuration session is present${response.status ? ` (Status: ${response.status})` : ''}. Use 'frodo dcc session init' to start a new session.`
        );
      }
    }
    return true;
  } catch (error) {
    printError(json ? { error: error.message } : error);
    return false;
  }
}

export async function initDirectConfigurationSession(
  json: boolean = false
): Promise<boolean> {
  try {
    const response: DirectConfigurationSessionState =
      await frodo.cloud.env.initDirectConfigurationSession();
    if (json) {
      printMessage(response, 'data');
    } else {
      if (response.editable) {
        printMessage(
          `Direct configuration session initialized. Changes can be applied or aborted${response.status ? ` (${response.status})` : ''}.`
        );
      } else {
        printMessage(
          `No active direct configuration session is present. Use 'frodo dcc session init' to start a new session.`
        );
        return false;
      }
    }
    return true;
  } catch (error) {
    printError(json ? { error: error.message } : error);
    return false;
  }
}

/**
 * Apply the configuration of the direct configuration session and end it.
 * @param {boolean} json print the state as one document on stdout instead of a sentence
 * @param {boolean} wait poll the state every 10 seconds until the session is applied (no timeout); `Status:` progress lines go to stderr, so `json` still leaves one document, the final state
 * @returns {Promise<boolean>} a promise that resolves to true if the configuration was applied, false otherwise
 */
export async function applyDirectConfigurationSession(
  json: boolean = false,
  wait: boolean = false
): Promise<boolean> {
  try {
    let response: DirectConfigurationSessionState =
      await frodo.cloud.env.applyDirectConfigurationSession();
    // a session that is still editable has not started to apply: nothing to wait for
    if (wait && !response.editable) {
      const pollIntervalSeconds = 10;
      while (response.status !== 'SESSION_APPLIED') {
        await sleep(pollIntervalSeconds * 1000);
        response = await frodo.cloud.env.readDirectConfigurationSessionState();

        printMessage(`Status: ${response.status}`);

        if (response.status === 'ERROR') {
          if (json) printMessage(response, 'data');
          printMessage(
            'Direct Configuration session encountered an error.',
            'error'
          );
          return false;
        }
      }
      if (json) {
        printMessage(response, 'data');
      } else {
        printMessage(APPLIED_MESSAGE);
      }
      return true;
    }
    if (json) {
      printMessage(response, 'data');
      // with wait, the only way here is a session that is still editable
      return !wait;
    }
    if (response.editable) {
      printMessage(
        `Direct configuration session is still active, configuration has likely not been applied.`
      );
      return false;
    }
    printMessage(APPLIED_MESSAGE);
    return true;
  } catch (error) {
    printError(json ? { error: error.message } : error);
    return false;
  }
}

export async function abortDirectConfigurationSession(
  json: boolean = false
): Promise<boolean> {
  try {
    const response: DirectConfigurationSessionState =
      await frodo.cloud.env.abortDirectConfigurationSession();
    if (json) {
      printMessage(response, 'data');
    } else {
      if (response.editable) {
        printMessage(`Direct configuration session is still active.`);
        return false;
      } else {
        printMessage(
          `Configuration aborted and direct configuration session ended. Use 'frodo dcc session init' to start a new session.`
        );
      }
    }
    return true;
  } catch (error) {
    printError(json ? { error: error.message } : error);
    return false;
  }
}
