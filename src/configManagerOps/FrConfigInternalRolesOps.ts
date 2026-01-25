import { frodo } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readInternalRoles } = frodo.role;
/**
 * Export an internal roles in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportInternalRoles(
  name?: string
): Promise<boolean> {
  try {
    const exportData = await readInternalRoles();
    for (const role of Object.values(exportData)) {
      if (name && name !== role.name) {
        continue;
      }
      if (role.privileges && role.privileges.length > 0) {
        const fileName = `internal-roles/${role.name}.json`;
        saveJsonToFile(role, getFilePath(fileName, true), false, true);
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting internal roles to files`);
  }
  return false;
}
