import { frodo } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';

const { readConfigEntitiesByType } = frodo.idm.config;
const { saveJsonToFile, getFilePath } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportLocales(
  localeName?: string
): Promise<boolean> {
  try {
    const exportData = await readConfigEntitiesByType('uilocale');
    processLocales(exportData, 'locales', localeName);
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity locales`);
  }
  return false;
}

function processLocales(locales, fileDir, name?) {
  try {
    locales.forEach((locale) => {
      const localeName = locale._id.split('/')[1];
      if (name && name !== localeName) {
        return;
      }
      const localeFilename = `${fileDir}/${localeName}.json`;

      saveJsonToFile(locale, getFilePath(localeFilename, true), false, true);
    });
  } catch (err) {
    printError(err);
  }
}
