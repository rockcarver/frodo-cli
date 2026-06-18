import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
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
      `Error exporting config entity RCS: provisioner.openicf.connectorinfoprovider`
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
    const readData = fs.readFileSync(fileData, 'utf8');
    let importData = JSON.parse(readData);
    importData = { idm: { [importData._id]: importData } };
    await importConfigEntities(importData);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
