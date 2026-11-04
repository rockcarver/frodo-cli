import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export IDM UI configuration in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportUiConfig(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('ui/configuration');
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
 * Export IDM UI configuration from fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportUiConfig(): Promise<boolean> {
  try {
    const config = readJsonFile(
      getFilePath(`ui/ui-configuration.json`)
    ) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [config._id]: config } });
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
