import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { readInternalRoleByName, importInternalRoles, readInternalRoles } =
  frodo.role;

/**
 * Export internal roles in fr-config-manager format.
 * @param {string} name The internal role name to export
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportInternalRoles(
  name?: string
): Promise<boolean> {
  try {
    const roles = name
      ? [await readInternalRoleByName(name)]
      : await readInternalRoles();
    for (const role of roles) {
      if (role.privileges && role.privileges.length > 0) {
        saveJsonToFile(
          role,
          getFilePath(`internal-roles/${role.name}.json`, true),
          false,
          true
        );
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting internal roles to files`);
  }
  return false;
}

/**
 * Import internal roles from fr-config-manager format.
 * @param {string} internalRoleName The internal role name to import
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportInternalRoles(
  internalRoleName?: string
): Promise<boolean> {
  try {
    const internalRolesFiles = fs.readdirSync(
      `${getWorkingDirectory()}/internal-roles`
    );
    const importData = { internalRole: {} };
    for (const internalRolesFile of internalRolesFiles) {
      const roleData = readJsonFile(
        getFilePath(`internal-roles/${internalRolesFile}`)
      ) as any;
      if (internalRoleName && roleData.name !== internalRoleName) {
        continue;
      }
      importData.internalRole[roleData._id] = roleData;
    }
    await importInternalRoles(importData);
    return true;
  } catch (error) {
    printError(error, `Error importing internal roles from files`);
  }
  return false;
}
