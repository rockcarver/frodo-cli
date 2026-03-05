import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { readConfigEntitiesByType, importConfigEntities } = frodo.idm.config;
const { saveJsonToFile, getFilePath } = frodo.utils;

/**
 * Export IDM locales configuration object in the fr-config-manager format.
 * @param {string} localeName optional name of the locale to export
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

/**
 * Import IDM locales configuration object in the fr-config-manager format.
 * @param {string} localeName optional name of the locale to import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportLocales(
  localeName?: string
): Promise<boolean> {
  try {
    const localeDir = getFilePath('locales');
    const localeFiles = fs.readdirSync(localeDir, 'utf8');
    const importLocaleData = { idm: {} };
    for (const localeFile of localeFiles) {
      const filePath = getFilePath(`locales/${localeFile}`);
      const readLocale = fs.readFileSync(filePath, 'utf8') as any;
      const importData = JSON.parse(readLocale) as any;
      const id = importData._id;
      if (localeName && id !== `uilocale/${localeName}`) {
        continue;
      }
      importLocaleData.idm[id] = importData;
    }
    await importConfigEntities(importLocaleData);
    return true;
  } catch (error) {
    printError(error, `Error importing config entity locales`);
    return false;
  }
}
