import { frodo, state } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import fs from 'fs';

import { printError } from '../utils/Console';

const { config } = frodo.idm;
const { getFilePath, saveJsonToFile } = frodo.utils;
const { importConfigEntities } = frodo.idm.config;
const { readRealms } = frodo.realm;

/**
 *
 * @param realm The name of the realm to retrieve organization privileges from.
 * @returns True if realm exists and organization privileges configuration file was successfully saved
 */
export async function configManagerExportOrgPrivilegesRealm(
  realm: string
): Promise<boolean> {
  try {
    const realmPrivileges: IdObjectSkeletonInterface =
      await config.readConfigEntity(`${realm}OrgPrivileges`);
    saveJsonToFile(
      realmPrivileges,
      getFilePath(`org-privileges/${realm}OrgPrivileges.json`, true),
      false,
      true
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Export the privileges assignments configuration in fr-config manager format
 * @returns True if privilegeAssignments was successfully saved
 */
export async function configManagerExportOrgPrivileges(): Promise<boolean> {
  try {
    const orgPrivileges: IdObjectSkeletonInterface =
      await config.readConfigEntity('privilegeAssignments');
    saveJsonToFile(
      orgPrivileges,
      getFilePath('org-privileges/privilegeAssignments.json', true),
      false,
      false
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Export all organization privileges configurations from all realms in fr-config manager format
 * @returns True if configuration files were successfully saved
 */
export async function configManagerExportOrgPrivilegesAllRealms(): Promise<boolean> {
  try {
    configManagerExportOrgPrivileges();
    for (const realm of await readRealms()) {
      if (
        realm.name === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;

      state.setRealm(realm.name);
      if (!(await configManagerExportOrgPrivilegesRealm(realm.name))) {
        return false;
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import organization privileges from a file
 * @param filePath The path to the organization privileges file to import
 * @returns True if the file was successfully imported
 */
async function importOrgPrivilegesFromFile(filePath: string): Promise<boolean> {
  try {
    const mainFile = fs.readFileSync(filePath, 'utf-8');
    let importData = JSON.parse(mainFile);
    const id = importData._id;
    importData = { idm: { [id]: importData } };
    await importConfigEntities(importData);
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import organization privileges for a specific realm in fr-config manager format
 * @param realm The name of the realm to import organization privileges for
 * @returns True if organization privileges were successfully imported
 */
export async function configManagerImportOrgPrivilegesRealm(
  realm: string
): Promise<boolean> {
  return importOrgPrivilegesFromFile(
    getFilePath(`org-privileges/${realm}OrgPrivileges.json`)
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
  return importOrgPrivilegesFromFile(
    getFilePath(`org-privileges/${name}.json`)
  );
}

/**
 * Import the privilege assignments configuration in fr-config manager format
 * @returns True if privilegeAssignments was successfully imported
 */
export async function configManagerImportOrgPrivilegeAssignments(): Promise<boolean> {
  return importOrgPrivilegesFromFile(
    getFilePath('org-privileges/privilegeAssignments.json')
  );
}

/**
 * Import privilege assignments and all per-realm organization privileges configurations in fr-config manager format
 * @returns True if all configurations were successfully imported
 */
export async function configManagerImportOrgPrivilegesAllRealms(): Promise<boolean> {
  try {
    await configManagerImportOrgPrivilegeAssignments();
    for (const realm of await readRealms()) {
      // fr-config-manager doesn't support root org privileges
      if (realm.name === '/') continue;
      state.setRealm(realm.name);
      if (!(await configManagerImportOrgPrivilegesRealm(realm.name))) {
        return false;
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
