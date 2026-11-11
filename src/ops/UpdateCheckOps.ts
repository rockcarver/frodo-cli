import { errorMessage, printMessage, successMessage } from '../utils/Console';
import {
  getUpdateCheckStatus,
  setUpdateCheckEnabled,
} from '../utils/UpdateCheckConfig';

export function showUpdateCheck(): boolean {
  const { enabled, source } = getUpdateCheckStatus();
  printMessage(
    `Automatic update check is ${enabled ? 'enabled' : 'disabled'}. Source: ${source}.`,
    'data'
  );
  return true;
}

function setUpdateCheck(enabled: boolean): boolean {
  try {
    setUpdateCheckEnabled(enabled);
    successMessage(
      `Automatic update-check setting ${enabled ? 'enabled' : 'disabled'}.`
    );
    return showUpdateCheck();
  } catch (error) {
    errorMessage(`${error}`);
    return false;
  }
}

export function enableUpdateCheck(): boolean {
  return setUpdateCheck(true);
}

export function disableUpdateCheck(): boolean {
  return setUpdateCheck(false);
}
