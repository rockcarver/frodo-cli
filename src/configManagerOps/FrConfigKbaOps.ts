import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportKbaConfig(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('selfservice.kba');
    saveJsonToFile(
      exportData,
      getFilePath('kba/selfservice.kba.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity selfservice.kba`);
  }
  return false;
}

export async function configManagerImportKbaConfig(): Promise<boolean> {
  try {
    const filePath = getFilePath('kba/');
    const fileData = fs.readFileSync(
      `${filePath}/selfservice.kba.json`,
      'utf-8'
    );
    let importData = JSON.parse(fileData);
    importData = { idm: { [importData._id]: importData } };
    await importConfigEntities(importData);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
