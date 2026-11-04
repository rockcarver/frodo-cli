import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export IDM access configuration object in the fr-config-manager format.
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
    printError(error, `Error exporting IDM access configuration`);
  }
  return false;
}

/**
 * Import IDM access configuration from fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportAccessConfig(): Promise<boolean> {
  try {
    const importData = readJsonFile(
      getFilePath('access-config/access.json')
    ) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [importData._id]: importData } });
    return true;
  } catch (error) {
    printError(error, `Error importing IDM access configuration`);
  }
  return false;
}
