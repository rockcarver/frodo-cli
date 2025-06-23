import { frodo } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readCookieDomains } = frodo.cloud.env;
/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportCookieDomains(): Promise<boolean> {
  try {
    const exportData = await readCookieDomains();
    saveJsonToFile(
      exportData,
      getFilePath('cookie-domains/cookie-domains.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity access`);
  }
  return false;
}
