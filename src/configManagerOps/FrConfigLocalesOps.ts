import fs from 'fs';
import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';

const { readConfigEntitiesByType, importConfigEntities } = frodo.idm.config;
const { saveJsonToFile, getFilePath, readJsonFile, getWorkingDirectory } =
  frodo.utils;

/**
 * Export IDM locales configuration in fr-config-manager format.
 * @param {string} name optional name of the locale to export
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportLocales(
  name?: string
): Promise<boolean> {
  try {
    const locales = await readConfigEntitiesByType('uilocale');
    locales.forEach((locale) => {
      const localeName = locale._id.split('/')[1];
      if (name && name !== localeName) {
        return;
      }
      const localeFilename = `locales/${localeName}.json`;
      saveJsonToFile(locale, getFilePath(localeFilename, true), false, true);
    });
    return true;
  } catch (error) {
    printError(error, `Error exporting locales`);
  }
  return false;
}

/**
 * Import IDM locales configuration from fr-config-manager format.
 * @param {string} name optional name of the locale to import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportLocales(
  name?: string
): Promise<boolean> {
  try {
    printMessage(`Updating locale${name ? ` ${name}` : 's'}`);
    const localeFiles = fs.readdirSync(
      `${getWorkingDirectory()}/locales`,
      'utf8'
    );
    const importLocaleData = { idm: {} };
    for (const localeFile of localeFiles) {
      const locale = readJsonFile(
        getFilePath(`locales/${localeFile}`)
      ) as IdObjectSkeletonInterface;
      if (name && locale._id !== `uilocale/${name}`) continue;
      importLocaleData.idm[locale._id] = locale;
    }
    await importConfigEntities(importLocaleData);
    return true;
  } catch (error) {
    printError(error, `Error importing locales`);
    return false;
  }
}
