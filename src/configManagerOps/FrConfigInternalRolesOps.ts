import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { countItems, importItemsOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { readInternalRoleByName, importInternalRoles, readInternalRoles } =
  frodo.role;

/**
 * Export internal roles in fr-config-manager format.
 * Every role with privileges is one operation of an {@link OperationRun}: a role whose file cannot
 * be written is printed and named in one summary, and the others are still written. A failure to
 * read the roles, or a named role that does not exist, ends the command whatever
 * `--allow-failures` says.
 * @param {string} name The internal role name to export
 * @param {boolean} allowFailures true to report roles that could not be exported but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportInternalRoles(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'internal role', allowFailures });
  try {
    const roles = name
      ? [await readInternalRoleByName(name)]
      : await readInternalRoles();
    const withPrivileges = roles.filter(
      (role) => role.privileges && role.privileges.length > 0
    );
    for (const role of withPrivileges) {
      await run.run(role.name, () => {
        saveJsonToFile(
          role,
          getFilePath(`internal-roles/${role.name}.json`, true),
          false,
          true
        );
      });
    }
    if (withPrivileges.length === 0) {
      printMessage(
        name
          ? `Internal role ${name} has no privileges and is not exported.`
          : 'No internal roles with privileges found to export.',
        'info'
      );
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting internal roles to files`);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import internal roles from fr-config-manager format.
 * Every file is read on its own: a file that cannot be read is printed and named in the one
 * summary, and the roles of the other files are still imported. The roles that the library cannot
 * import are named in the summary too. A missing folder, a folder without role files and a named
 * role that no file holds end the command whatever `--allow-failures` says.
 * @param {string} internalRoleName The internal role name to import
 * @param {boolean} allowFailures true to report roles that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportInternalRoles(
  internalRoleName?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'internal role', allowFailures });
  try {
    const internalRolesDir = `${getWorkingDirectory()}/internal-roles`;
    if (!fs.existsSync(internalRolesDir)) {
      printMessage(
        `No internal roles folder found: ${internalRolesDir} does not exist.`,
        'error'
      );
      return false;
    }
    const internalRolesFiles = fs.readdirSync(internalRolesDir);
    if (internalRolesFiles.length === 0) {
      printMessage(
        `No internal role files found in ${internalRolesDir}.`,
        'error'
      );
      return false;
    }
    const importData = { internalRole: {} };
    for (const internalRolesFile of internalRolesFiles) {
      try {
        const roleData = readJsonFile(
          getFilePath(`internal-roles/${internalRolesFile}`)
        ) as any;
        if (internalRoleName && roleData.name !== internalRoleName) {
          continue;
        }
        importData.internalRole[roleData._id] = roleData;
      } catch (error) {
        printError(error);
        run.recordFailure(internalRolesFile, causeOf(error));
      }
    }
    if (internalRoleName && countItems(importData, 'internalRole') === 0) {
      printMessage(
        `Internal role ${internalRoleName} not found in ${internalRolesDir}.`,
        'error'
      );
      if (run.hasFailures) run.finish();
      return false;
    }
    if (countItems(importData, 'internalRole') > 0) {
      await importItemsOfFile(run, importData, {
        count: (data) => countItems(data, 'internalRole'),
        importItems: (data) => importInternalRoles(data),
        fallbackName: internalRolesDir,
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error importing internal roles from files`);
    if (run.hasFailures) run.finish();
  }
  return false;
}
