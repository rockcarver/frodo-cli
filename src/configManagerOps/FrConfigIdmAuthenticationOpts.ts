import { frodo } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';

import { printError } from '../utils/Console';

const { readConfigEntity, updateConfigEntity } = frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export Idm authentication configuration in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportIdmAuthentication(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('authentication');
    saveJsonToFile(
      exportData,
      getFilePath('idm-authentication-config/authentication.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity selfservice.kba`);
  }
  return false;
}

/**
 * Import Idm authentication configuration in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportIdmAuthentication(): Promise<boolean> {
  try {
    const filePath = getFilePath(
      'idm-authentication-config/authentication.json'
    );
    const config = readJsonFile(filePath) as IdObjectSkeletonInterface;
    await updateConfigEntity(config._id, config);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
