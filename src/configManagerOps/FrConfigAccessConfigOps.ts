import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportAccessConfig(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('access');
    saveJsonToFile(
      exportData,
      getFilePath('access-config/access.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity access`);
  }
  return false;
}

/**
 * Import access configuration from fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportAccessConfig(): Promise<boolean> {
  try {
    const accessConfigFile = getFilePath('access-config/access.json');
    const readAccessConfig = fs.readFileSync(accessConfigFile, 'utf-8');
    let accessConfigImportData = JSON.parse(readAccessConfig);
    const id = accessConfigImportData._id;
    accessConfigImportData = { idm: { [id]: accessConfigImportData } };
    await importConfigEntities(accessConfigImportData);
    return true;
  } catch (error) {
    printError(error, `Error importing config entity access`);
  }
  return false;
}
