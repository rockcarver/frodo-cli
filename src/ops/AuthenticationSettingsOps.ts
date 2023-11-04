import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';

import {
  createObjectTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  succeedSpinner,
} from '../utils/Console';
import { saveJsonToFile } from '../utils/ExportImportUtils';

const { getTypedFilename, getFilePath } = frodo.utils;
const {
  exportAuthenticationSettings: _exportAuthenticationSettings,
  importAuthenticationSettings: _importAuthenticationSettings,
  readAuthenticationSettings: _readAuthenticationSettings,
} = frodo.authn.settings;

/**
 * Export authentication settings to file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAuthenticationSettingsToFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(
    `cli.AuthenticationSettingsOps.exportAuthenticationSettingsToFile: begin`
  );
  showSpinner(
    `Exporting ${frodo.utils.getRealmName(
      state.getRealm()
    )} realm authentication settings...`
  );
  try {
    let fileName = getTypedFilename(
      `${frodo.utils.getRealmName(state.getRealm())}Realm`,
      'authentication.settings'
    );
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await _exportAuthenticationSettings();
    saveJsonToFile(exportData, filePath);
    succeedSpinner(
      `Exported ${frodo.utils.getRealmName(
        state.getRealm()
      )} realm authentication settings to ${filePath}.`
    );
    outcome = true;
  } catch (error) {
    failSpinner(
      `Error exporting ${frodo.utils.getRealmName(
        state.getRealm()
      )} realm authentication settings: ${error.message}`
    );
  }
  debugMessage(
    `cli.AuthenticationSettingsOps.exportAuthenticationSettingsToFile: end`
  );
  return outcome;
}

/**
 * Import authentication settings from file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAuthenticationSettingsFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(
    `cli.AuthenticationSettingsOps.importAuthenticationSettingsFromFile: begin`
  );
  showSpinner(
    `Importing ${frodo.utils.getRealmName(
      state.getRealm()
    )} realm authentication settings...`
  );
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await _importAuthenticationSettings(fileData);
    outcome = true;
    succeedSpinner(
      `Imported ${frodo.utils.getRealmName(
        state.getRealm()
      )} realm authentication settings.`
    );
  } catch (error) {
    failSpinner(
      `Error importing ${frodo.utils.getRealmName(
        state.getRealm()
      )} realm authentication settings.`
    );
    printMessage(error, 'error');
  }
  debugMessage(
    `cli.AuthenticationSettingsOps.importAuthenticationSettingsFromFile: end`
  );
  return outcome;
}

/**
 * Describe authentication settings
 * @param {boolean} json JSON output
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeAuthenticationSettings(
  json = false
): Promise<boolean> {
  let outcome = false;
  try {
    const settings = await _readAuthenticationSettings();
    delete settings._id;
    delete settings._rev;
    delete settings._type;
    if (json) {
      printMessage(settings, 'data');
      outcome = true;
    } else {
      const table = createObjectTable(settings);
      printMessage(table.toString(), 'data');
      outcome = true;
    }
  } catch (error) {
    printMessage(error.message, 'error');
  }
  return outcome;
}
