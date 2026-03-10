import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readInternalRoles, importInternalRoles } = frodo.role;
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

export async function configManagerImportInternalRoles(
  internalRoleName?: string
): Promise<boolean> {
  try {
    const internalRolesDir = getFilePath('internal-roles');
    const internalRolesFiles = fs.readdirSync(internalRolesDir);
    const importData = { internalRole: {} };
    for (const internalRolesFile of internalRolesFiles) {
      const filePath = getFilePath(`internal-roles/${internalRolesFile}`);
      const readFile = fs.readFileSync(filePath, 'utf-8');
      const roleData = JSON.parse(readFile);
      if (internalRoleName && roleData.name !== internalRoleName) {
        continue;
      }
      importData.internalRole[roleData._id] = roleData;
    }
    await importInternalRoles(importData);
    return true;
  } catch (error) {
    printError(error, `Error importing internal roles to files`);
  }
  return false;
}
