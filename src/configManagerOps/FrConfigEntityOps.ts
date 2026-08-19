import { frodo } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';

const { readConfigEntity } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export an IDM configuration object.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportConfigEntity(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('ui/configuration');
    saveJsonToFile(
      exportData,
      getFilePath('ui-configuration.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
  }
  return false;
}
