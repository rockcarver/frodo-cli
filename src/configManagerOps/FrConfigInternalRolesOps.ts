import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { pulledFilePath } from '../utils/ConfigTreePath';
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
 * @param {string} id The id (`_id`) of the internal role to export. The id is looked for in the list that an export of all internal roles reads, so no other request is made. An empty id selects nothing (the command refuses an empty value before it connects); an id that no role has fails the command.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportInternalRoles(
  name?: string,
  allowFailures: boolean = false,
  id?: string
): Promise<boolean> {
  const run = new OperationRun({ unit: 'internal role', allowFailures });
  try {
    const roles =
      id !== undefined
        ? (await readInternalRoles()).filter((role) => role._id === id)
        : name
          ? [await readInternalRoleByName(name)]
          : await readInternalRoles();
    if (id !== undefined && roles.length === 0) {
      printMessage(`Internal role with id '${id}' not found.`, 'error');
      return false;
    }
    const withPrivileges = roles.filter(
      (role) => role.privileges && role.privileges.length > 0
    );
    for (const role of withPrivileges) {
      await run.run(role.name, () => {
        saveJsonToFile(
          role,
          getFilePath(pulledFilePath(`internal-roles/${role.name}.json`), true),
          false,
          true
        );
      });
    }
    if (withPrivileges.length === 0) {
      printMessage(
        id !== undefined || name
          ? `Internal role ${id ?? name} has no privileges and is not exported.`
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
 * @param {string} id The id (`_id`) of the internal role to import instead of a name. An empty id selects nothing, so it is not found (the command refuses an empty value before it connects); an id that no file holds ends the command.
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportInternalRoles(
  internalRoleName?: string,
  allowFailures: boolean = false,
  id?: string
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
        if (
          id !== undefined
            ? roleData._id !== id
            : internalRoleName && roleData.name !== internalRoleName
        ) {
          continue;
        }
        importData.internalRole[roleData._id] = roleData;
      } catch (error) {
        printError(error);
        run.recordFailure(internalRolesFile, causeOf(error));
      }
    }
    if (
      (id !== undefined || internalRoleName) &&
      countItems(importData, 'internalRole') === 0
    ) {
      printMessage(
        id !== undefined
          ? `Internal role with id '${id}' not found in ${internalRolesDir}.`
          : `Internal role ${internalRoleName} not found in ${internalRolesDir}.`,
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
