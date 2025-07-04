import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { InternalRoleExportInterface } from '@rockcarver/frodo-lib/types/ops/InternalRoleOps';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const {
  getTypedFilename,
  saveToFile,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;

const {
  readInternalRoles,
  exportInternalRole,
  exportInternalRoleByName,
  exportInternalRoles,
  importInternalRole,
  importInternalRoleByName,
  importInternalRoles,
  importFirstInternalRole,
} = frodo.role;

/**
 * List internal roles
 * @param {boolean} [long=false] detailed list
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listRoles(long: boolean = false): Promise<boolean> {
  try {
    const roles = await readInternalRoles();
    if (long) {
      const table = createTable(['Id', 'Name', 'Description', 'Condition']);
      for (const role of roles) {
        table.push([role._id, role.name, role.description, role.condition]);
      }
      printMessage(table.toString(), 'data');
    } else {
      roles.forEach((role) => {
        printMessage(`${role.name}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing internal roles`);
  }
  return false;
}

/**
 * Export internal role to file
 * @param {string} roleId internal role id
 * @param {string} roleName internal role name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportInternalRoleToFile(
  roleId: string,
  roleName: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  const name = roleName ? roleName : roleId;
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${name}...`
  );
  try {
    let exportData: InternalRoleExportInterface;
    if (roleId) {
      exportData = await exportInternalRole(roleId);
    } else {
      exportData = await exportInternalRoleByName(roleName);
    }
    if (!file) {
      file = getTypedFilename(roleName ? roleName : roleId, 'internalRole');
    }
    const filePath = getFilePath(file, true);
    updateProgressIndicator(indicatorId, `Saving ${name} to ${filePath}...`);
    saveJsonToFile(exportData, getFilePath(filePath, true), includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported internal role ${name} to file`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting internal role ${name} to file`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all internal roles to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportInternalRolesToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportInternalRoles();
    if (!file) {
      file = getTypedFilename(`allInternalRoles`, 'internalRole');
    }
    saveJsonToFile(exportData, getFilePath(file, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting internal roles to file`);
  }
  return false;
}

/**
 * Export all internal roles to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportInternalRolesToFiles(
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportInternalRoles();
    for (const role of Object.values(exportData.internalRole)) {
      saveToFile(
        'internalRole',
        role,
        '_id',
        getFilePath(getTypedFilename(role.name, 'internalRole'), true),
        includeMeta
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting internal roles to files`);
  }
  return false;
}

/**
 * Import a internal role from file
 * @param {string} roleId internal role id
 * @param {string} roleName internal role name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importInternalRoleFromFile(
  roleId: string,
  roleName: string,
  file: string
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Reading internal role...'
    );
    const importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
    updateProgressIndicator(indicatorId, 'Importing internal role...');
    if (roleId) {
      await importInternalRole(roleId, importData);
    } else {
      await importInternalRoleByName(roleName, importData);
    }
    stopProgressIndicator(
      indicatorId,
      `Successfully imported internal role ${roleName ? roleName : roleId}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing internal role ${roleName ? roleName : roleId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import internal roles from file
 * @param {String} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importInternalRolesFromFile(
  file: string
): Promise<boolean> {
  try {
    debugMessage(`importInternalRolesFromFile: start`);
    debugMessage(`importInternalRolesFromFile: importing ${file}`);
    const importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
    await importInternalRoles(importData);
    debugMessage(`importInternalRolesFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing internal roles from file`);
  }
  return false;
}

/**
 * Import all internal roles from separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importInternalRolesFromFiles(): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const roleFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.internalRole.json')
    );
    for (const file of roleFiles) {
      try {
        await importInternalRolesFromFile(file);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing internal roles from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(
        `One or more errors importing internal roles`,
        errors
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error importing internal roles from files`);
  }
  return false;
}

/**
 * Import first internal role from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstInternalRoleFromFile(
  file: string
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing role...'
    );
    const importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
    await importFirstInternalRole(importData);
    stopProgressIndicator(
      indicatorId,
      `Imported internal role from ${file}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing internal role from ${file}`,
      'fail'
    );
    printError(error);
  }
  return false;
}
