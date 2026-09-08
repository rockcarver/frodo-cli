import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export Idm authentication configuration in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportMetadata(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('custom-config.metadata');
    saveJsonToFile(
      exportData,
      getFilePath('config-metadata/custom-config.metadata.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config-metadata`);
  }
  return false;
}

/**
 * Import Idm authentication configuration in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportMetadata(): Promise<boolean> {
  try {
    const filePath = getFilePath('config-metadata');
    const fileData = fs.readFileSync(
      `${filePath}/custom-config.metadata.json`,
      'utf-8'
    );
    let importData = JSON.parse(fileData);
    importData = { idm: { 'custom-config.metadata': importData } };
    await importConfigEntities(importData);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
