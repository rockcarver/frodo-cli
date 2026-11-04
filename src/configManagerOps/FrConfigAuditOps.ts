import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export IDM audit configuration object in the fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportAudit(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('audit');
    saveJsonToFile(exportData, getFilePath('audit/audit.json', true), false);
    return true;
  } catch (error) {
    printError(error, `Error exporting IDM audit configuration`);
  }
  return false;
}

/**
 * Import IDM audit configuration from fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportAudit(): Promise<boolean> {
  try {
    const importData = readJsonFile(
      getFilePath('audit/audit.json')
    ) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [importData._id]: importData } });
    return true;
  } catch (error) {
    printError(error, `Error importing IDM audit configuration`);
  }
  return false;
}
