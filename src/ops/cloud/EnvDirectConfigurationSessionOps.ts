import { frodo } from '@rockcarver/frodo-lib';
import { DirectConfigurationSessionState } from '@rockcarver/frodo-lib/types/api/cloud/EnvDirectConfigurationSessionApi';

import { printError, printMessage } from '../../utils/Console';

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
          `Direct configuration session is active and editable. Changes can be applied or aborted.`
        );
      } else {
        printMessage(
          `No active direct configuration session is present. Use 'frodo direct-config-session init' to start a new session.`
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
          `Direct configuration session initialized. Changes can be applied or aborted.`
        );
      } else {
        printMessage(
          `No active direct configuration session is present. Use 'frodo direct-config-session init' to start a new session.`
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

export async function applyDirectConfigurationSession(
  json: boolean = false
): Promise<boolean> {
  try {
    const response: DirectConfigurationSessionState =
      await frodo.cloud.env.applyDirectConfigurationSession();
    if (json) {
      printMessage(response, 'data');
    } else {
      if (response.editable) {
        printMessage(
          `Direct configuration session is still active, configuration has likely not been applied.`
        );
        return false;
      } else {
        printMessage(
          `Configuration applied and direct configuration session ended. Use 'frodo direct-config-session init' to start a new session.`
        );
      }
    }
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
          `Configuration aborted and direct configuration session ended. Use 'frodo direct-config-session init' to start a new session.`
        );
      }
    }
    return true;
  } catch (error) {
    printError(json ? { error: error.message } : error);
    return false;
  }
}
