import { frodo } from '@rockcarver/frodo-lib';

import { getIdmImportExportOptions } from '../ops/IdmOps';
import { printError } from '../utils/Console';

const { exportConfigEntity } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportRemoteServers(
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = (
      await exportConfigEntity('provisioner.openicf.connectorinfoprovider', {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: undefined,
      })
    ).idm['provisioner.openicf.connectorinfoprovider'];

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
