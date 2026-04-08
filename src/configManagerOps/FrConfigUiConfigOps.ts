import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { getIdmImportExportOptions } from '../ops/IdmOps';
import { printError } from '../utils/Console';

const { exportConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportUiConfig(
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = (
      await exportConfigEntity('ui/configuration', {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: undefined,
      })
    ).idm['ui/configuration'];

    saveJsonToFile(
      exportData,
      getFilePath('ui/ui-configuration.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
  }
  return false;
}

/**
 * Import UI configuration in the fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportUiConfig(): Promise<boolean> {
  try {
    const fileData = getFilePath(`ui/ui-configuration.json`);
    const readFile = fs.readFileSync(fileData, 'utf8');
    let importData = JSON.parse(readFile);
    importData = { idm: { [importData._id]: importData } };
    await importConfigEntities(importData);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
