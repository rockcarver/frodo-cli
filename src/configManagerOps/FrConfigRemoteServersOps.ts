import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export the remote connector server (RCS) provisioner config in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportRemoteServers(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity(
      'provisioner.openicf.connectorinfoprovider'
    );
    saveJsonToFile(
      exportData,
      getFilePath(
        'sync/rcs/provisioner.openicf.connectorinfoprovider.json',
        true
      ),
      false
    );
    return true;
  } catch (error) {
    printError(
      error,
      `Error exporting RCS configuration: provisioner.openicf.connectorinfoprovider`
    );
  }
  return false;
}

/**
 * Imports the remote connector server (RCS) provisioner config from disk.
 * @returns {Promise<boolean>} true on success, false if reading/importing fails
 */
export async function configManagerImportRemoteServers(): Promise<boolean> {
  try {
    const fileData = getFilePath(
      'sync/rcs/provisioner.openicf.connectorinfoprovider.json'
    );
    const importData = readJsonFile(fileData) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [importData._id]: importData } });
    return true;
  } catch (error) {
    printError(
      error,
      `Error importing RCS configuration: provisioner.openicf.connectorinfoprovider`
    );
  }
  return false;
}
