import fs from 'fs';
import {
  frodo,
  state,
  type FrodoError,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';

const { config } = frodo.idm;
const { getFilePath, saveJsonToFile } = frodo.utils;
const { importConfigEntities } = frodo.idm.config;
const { readRealms } = frodo.realm;

/**
 * Runs an operation and answers whether it succeeded. The error of one that failed is printed.
 * @param operation what to do
 * @returns True if the operation did not throw
 */
async function succeeded(operation: () => Promise<void>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Saves the organization privileges configuration of a realm.
 * @param realm The name of the realm to retrieve organization privileges from.
 * @param ignoreMissing True to treat a realm that has no organization privileges configuration as nothing to export instead of an error.
 */
async function exportOrgPrivilegesRealm(
  realm: string,
  ignoreMissing: boolean
): Promise<void> {
  try {
    const realmPrivileges: IdObjectSkeletonInterface =
      await config.readConfigEntity(`${realm}OrgPrivileges`);
    saveJsonToFile(
      realmPrivileges,
      getFilePath(`org-privileges/${realm}OrgPrivileges.json`, true),
      false,
      true
    );
  } catch (error) {
    if (ignoreMissing && (error as FrodoError).httpStatus === 404) {
      verboseMessage(
        `No organization privileges config for realm "${realm}", nothing to export.`
      );
      return;
    }
    throw error;
  }
}

/**
 * Saves the privilege assignments configuration.
 */
async function exportOrgPrivilegeAssignments(): Promise<void> {
  const orgPrivileges: IdObjectSkeletonInterface =
    await config.readConfigEntity('privilegeAssignments');
  saveJsonToFile(
    orgPrivileges,
    getFilePath('org-privileges/privilegeAssignments.json', true),
    false,
    false
  );
}

/**
 *
 * @param realm The name of the realm to retrieve organization privileges from.
 * @param ignoreMissing True to treat a realm that has no organization privileges configuration as nothing to export instead of an error. Default: false
 * @returns True if realm exists and organization privileges configuration file was successfully saved
 */
export async function configManagerExportOrgPrivilegesRealm(
  realm: string,
  ignoreMissing = false
): Promise<boolean> {
  return succeeded(() => exportOrgPrivilegesRealm(realm, ignoreMissing));
}

/**
 * Export the privileges assignments configuration in fr-config manager format
 * @returns True if privilegeAssignments was successfully saved
 */
export async function configManagerExportOrgPrivileges(): Promise<boolean> {
  return succeeded(exportOrgPrivilegeAssignments);
}

/**
 * Export the organization privileges configurations in fr-config manager format:
 * the global privilege assignments plus the configuration of every realm, or of
 * one realm when a realm is given. Every configuration is exported even when
 * another one failed, and one summary names the failed ones.
 * @param realm Optional name of the one realm to export. All realms when omitted or the default realm key.
 * @param allowFailures True to succeed although some configurations could not be exported (the failures are still summarised)
 * @param ignoreMissing True (the default) to treat a realm that has no organization privileges configuration as nothing to export, false to fail it (for a realm that the user named)
 * @returns False if the realms cannot be listed or a configuration cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportOrgPrivilegesAllRealms(
  realm?: string,
  allowFailures: boolean = false,
  ignoreMissing: boolean = true
): Promise<boolean> {
  try {
    const realmNames =
      realm && realm !== frodo.utils.constants.DEFAULT_REALM_KEY
        ? [realm]
        : (await readRealms()).map((r) => r.name);
    const run = new OperationRun({ unit: 'configuration', allowFailures });
    await run.run('privilegeAssignments', exportOrgPrivilegeAssignments);
    for (const name of realmNames) {
      if (
        name === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;

      state.setRealm(name);
      await run.run(`${name}OrgPrivileges`, () =>
        exportOrgPrivilegesRealm(name, ignoreMissing)
      );
    }
    return run.finish();
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import organization privileges from a file
 * @param filePath The path to the organization privileges file to import
 */
async function importOrgPrivilegesFromFile(filePath: string): Promise<void> {
  const mainFile = fs.readFileSync(filePath, 'utf-8');
  let importData = JSON.parse(mainFile);
  const id = importData._id;
  importData = { idm: { [id]: importData } };
  await importConfigEntities(importData);
}

/**
 * Import organization privileges for a specific realm in fr-config manager format
 * @param realm The name of the realm to import organization privileges for
 * @returns True if organization privileges were successfully imported
 */
export async function configManagerImportOrgPrivilegesRealm(
  realm: string
): Promise<boolean> {
  return succeeded(() =>
    importOrgPrivilegesFromFile(
      getFilePath(`org-privileges/${realm}OrgPrivileges.json`)
    )
  );
}

/**
 * Import organization privileges by name in fr-config manager format
 * @param name The name of the organization privileges file to import
 * @returns True if organization privileges were successfully imported
 */
export async function configManagerImportOrgPrivilegesByName(
  name: string
): Promise<boolean> {
  const filePath = getFilePath(`org-privileges/${name}.json`);
  if (!fs.existsSync(filePath)) {
    printMessage(
      `Organization privileges file not found: ${filePath}`,
      'error'
    );
    return false;
  }
  return succeeded(() => importOrgPrivilegesFromFile(filePath));
}

/**
 * Import the privilege assignments configuration in fr-config manager format
 * @returns True if privilegeAssignments was successfully imported
 */
export async function configManagerImportOrgPrivilegeAssignments(): Promise<boolean> {
  return succeeded(() =>
    importOrgPrivilegesFromFile(
      getFilePath('org-privileges/privilegeAssignments.json')
    )
  );
}

/**
 * Import privilege assignments and all per-realm organization privileges configurations in fr-config manager format.
 * Every file is imported even when another one failed, and one summary names the failed ones.
 * A realm of the tenant without a file has nothing to import; so has a folder without the privilege assignments, which is said.
 * @param allowFailures True to succeed although some configurations could not be imported (the failures are still summarised)
 * @returns False if the org-privileges folder is missing, the realms cannot be listed or a file cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportOrgPrivilegesAllRealms(
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const folder = getFilePath('org-privileges');
    if (!fs.existsSync(folder)) {
      printMessage(
        `No org-privileges folder found to import from: ${folder}`,
        'error'
      );
      return false;
    }
    const run = new OperationRun({ unit: 'configuration', allowFailures });
    const assignmentsFile = getFilePath(
      'org-privileges/privilegeAssignments.json'
    );
    if (fs.existsSync(assignmentsFile)) {
      await run.run('privilegeAssignments', () =>
        importOrgPrivilegesFromFile(assignmentsFile)
      );
    } else {
      printMessage(
        `Skipping privilegeAssignments: no privilegeAssignments.json in '${folder}'.`,
        'warn'
      );
    }
    for (const realm of await readRealms()) {
      // fr-config-manager doesn't support root org privileges
      if (realm.name === '/') continue;
      const realmFile = getFilePath(
        `org-privileges/${realm.name}OrgPrivileges.json`
      );
      if (!fs.existsSync(realmFile)) {
        // a pull writes no file for a realm that has no configuration
        verboseMessage(
          `No organization privileges file for realm "${realm.name}", nothing to import.`
        );
        continue;
      }
      state.setRealm(realm.name);
      await run.run(`${realm.name}OrgPrivileges`, () =>
        importOrgPrivilegesFromFile(realmFile)
      );
    }
    return run.finish();
  } catch (error) {
    printError(error);
    return false;
  }
}
