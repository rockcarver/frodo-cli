import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export IDM KBA configuration in fr-config-manager format.
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
    printError(error, `Error exporting KBA`);
  }
  return false;
}

/**
 * Import IDM KBA configuration from fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportKbaConfig(): Promise<boolean> {
  try {
    const kba = readJsonFile(
      getFilePath(`kba/selfservice.kba.json`)
    ) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [kba._id]: kba } });
    return true;
  } catch (error) {
    printError(error, 'Error importing KBA');
  }
  return false;
}
