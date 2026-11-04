import { frodo } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readCookieDomains, updateCookieDomains } = frodo.cloud.env;

/**
 * Export cookie domains in the fr-config-manager format.
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
    printError(error, `Error exporting cookie domains`);
  }
  return false;
}

/**
 * Import cookie domains from fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportCookieDomains(): Promise<boolean> {
  try {
    const importData = readJsonFile(
      getFilePath('cookie-domains/cookie-domains.json')
    ) as any;
    await updateCookieDomains(importData);
    return true;
  } catch (error) {
    printError(error, `Error importing cookie domains`);
  }
  return false;
}
