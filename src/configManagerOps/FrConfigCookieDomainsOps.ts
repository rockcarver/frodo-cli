import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
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
    printError(error, `Error exporting custom domains`);
  }
  return false;
}

/**
 * Import cookie domains from fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportCookieDomains(): Promise<boolean> {
  try {
    const getFile = getFilePath('cookie-domains/cookie-domains.json');
    const readFile = fs.readFileSync(getFile, 'utf-8');
    const importData = JSON.parse(readFile);
    await updateCookieDomains(importData);
    return true;
  } catch (error) {
    printError(error, `Error importing custom domains`);
  }
  return false;
}
