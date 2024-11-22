import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';

import {
  createObjectTable,
  createProgressIndicator,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';

const { saveJsonToFile, getTypedFilename, getFilePath } = frodo.utils;
const {
  exportAuthenticationSettings: _exportAuthenticationSettings,
  importAuthenticationSettings: _importAuthenticationSettings,
  readAuthenticationSettings: _readAuthenticationSettings,
} = frodo.authn.settings;

/**
 * Export authentication settings to file
 * @param {string} file file name
 * @param {boolean} global true to export global authentication settings, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAuthenticationSettingsToFile(
  file: string,
  global = false,
  includeMeta = true
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(
      `cli.AuthenticationSettingsOps.exportAuthenticationSettingsToFile: begin`
    );
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Exporting authentication settings...`
    );
    let fileName = getTypedFilename(
      global ? 'global' : `${frodo.utils.getRealmName(state.getRealm())}Realm`,
      'authentication.settings'
    );
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await _exportAuthenticationSettings(global);
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported ${frodo.utils.getRealmName(
        state.getRealm()
      )} realm authentication settings to ${filePath}.`,
      'success'
    );
    debugMessage(
      `cli.AuthenticationSettingsOps.exportAuthenticationSettingsToFile: end`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error exporting authentication settings`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import authentication settings from file
 * @param {string} file file name
 * @param {boolean} global true to import global authentication settings, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAuthenticationSettingsFromFile(
  file: string,
  global = false
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(
      `cli.AuthenticationSettingsOps.importAuthenticationSettingsFromFile: begin`
    );
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing authentication settings...`
    );
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await _importAuthenticationSettings(fileData, global);
    stopProgressIndicator(
      spinnerId,
      `Imported ${frodo.utils.getRealmName(
        state.getRealm()
      )} realm authentication settings.`,
      'success'
    );
    debugMessage(
      `cli.AuthenticationSettingsOps.importAuthenticationSettingsFromFile: end`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error importing authentication settings`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Describe authentication settings
 * @param {boolean} json JSON output
 * @param {boolean} global true to describe global authentication settings, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeAuthenticationSettings(
  json = false,
  global = false
): Promise<boolean> {
  try {
    const settings = await _readAuthenticationSettings(global);
    delete settings._id;
    delete settings._rev;
    delete settings._type;
    if (json) {
      printMessage(settings, 'data');
    } else {
      const table = createObjectTable(settings);
      printMessage(table.toString(), 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
