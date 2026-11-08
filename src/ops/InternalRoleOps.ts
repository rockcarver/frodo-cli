import fs from 'fs';
import { frodo, type InternalRoleExportInterface } from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { importItemsOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';

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
 * One operation: if reading or saving fails there is no file and the command fails (`--allow-failures` does not
 * apply to a file that does not exist).
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
 * Every role is exported on its own: a role that cannot be saved does not stop the others, one summary names the ones
 * that could not be, and a failure to read the roles ends the command whatever `--allow-failures` says.
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report roles that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportInternalRolesToFiles(
  includeMeta: boolean = true,
  allowFailures = false
): Promise<boolean> {
  try {
    const exportData = await exportInternalRoles();
    const run = new OperationRun({ unit: 'internal role', allowFailures });
    for (const role of Object.values(exportData.internalRole)) {
      await run.run(role.name, () => {
        saveToFile(
          'internalRole',
          role,
          '_id',
          getFilePath(getTypedFilename(role.name, 'internalRole'), true),
          includeMeta
        );
      });
    }
    return run.finish();
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
 * Every role in the file is tried: one that cannot be imported is printed and named in one summary,
 * and the others are still imported. A file that cannot be read or parsed ends the command
 * whatever `--allow-failures` says.
 * @param {String} file file name
 * @param {boolean} allowFailures true to report roles that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importInternalRolesFromFile(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'internal role', allowFailures });
  let importData: InternalRoleExportInterface;
  try {
    debugMessage(`importInternalRolesFromFile: start`);
    debugMessage(`importInternalRolesFromFile: importing ${file}`);
    importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
  } catch (error) {
    // not an item failure: the file that was named cannot be read
    printError(error, `Error importing internal roles from file`);
    return false;
  }
  await importItemsOfFile(run, importData, {
    count: (data) => Object.keys(data.internalRole).length,
    importItems: (data) => importInternalRoles(data),
    fallbackName: file,
  });
  debugMessage(`importInternalRolesFromFile: end`);
  return run.finish();
}

/**
 * Import all internal roles from separate files
 * Every file is tried: a file that cannot be read, or a role in it that cannot be imported, is
 * printed and named in one summary, and the others are still imported. A directory that cannot be
 * read ends the command whatever `--allow-failures` says. No role files is nothing to import,
 * which is not a failure.
 * @param {boolean} allowFailures true to report roles that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importInternalRolesFromFiles(
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'internal role', allowFailures });
  let roleFiles: string[];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    roleFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.internalrole.json')
    );
  } catch (error) {
    printError(error, `Error importing internal roles from files`);
    return false;
  }
  if (roleFiles.length === 0) {
    printMessage('No internal role files found to import.', 'warn');
    return true;
  }
  for (const file of roleFiles) {
    let importData: InternalRoleExportInterface;
    try {
      importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
    } catch (error) {
      printError(error, `Error importing internal roles from ${file}`);
      run.recordFailure(file, error);
      continue;
    }
    await importItemsOfFile(run, importData, {
      count: (data) => Object.keys(data.internalRole).length,
      importItems: (data) => importInternalRoles(data),
      fallbackName: file,
    });
  }
  return run.finish();
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
