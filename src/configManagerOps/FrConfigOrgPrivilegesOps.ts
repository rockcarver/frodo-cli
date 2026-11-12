import fs from 'fs';
import {
  frodo,
  state,
  type FrodoError,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { CLOUD_DEPLOYMENT_TYPE_KEY, DEFAULT_REALM_KEY } = frodo.utils.constants;

const PRIVILEGE_ASSIGNMENTS = 'privilegeAssignments';

/**
 * The id of the configuration entity that holds the organization privileges of a realm:
 * `<realm>OrgPrivileges`, and `privileges` for the root realm of a deployment that is not Identity Cloud.
 * @param realm Name of the realm
 * @returns The id of the configuration entity
 */
function orgPrivilegesId(realm: string): string {
  return realm === '/' ? 'privileges' : `${realm}OrgPrivileges`;
}

/**
 * The ids of the organization privileges configurations of a tenant: the global privilege assignments
 * and the configuration of every realm that can have one (the root realm of Identity Cloud cannot), or of
 * one realm when a realm is given.
 * @param realm Optional name of the one realm. All realms when omitted or the default realm key.
 * @returns The ids of the configuration entities, the privilege assignments first
 */
async function orgPrivilegesIds(realm?: string): Promise<string[]> {
  const realms =
    realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
  return [
    PRIVILEGE_ASSIGNMENTS,
    ...realms
      .filter(
        (r) =>
          r !== '/' || state.getDeploymentType() !== CLOUD_DEPLOYMENT_TYPE_KEY
      )
      .map(orgPrivilegesId),
  ];
}

/**
 * Saves one organization privileges configuration.
 * @param id The id of the configuration entity
 * @param ignoreMissing True to treat a configuration that does not exist as nothing to export instead of an error
 */
async function exportOrgPrivileges(
  id: string,
  ignoreMissing: boolean
): Promise<void> {
  try {
    const orgPrivileges: IdObjectSkeletonInterface = await readConfigEntity(id);
    saveJsonToFile(
      orgPrivileges,
      getFilePath(`org-privileges/${id}.json`, true),
      false,
      // as before the files were consolidated: the realm files keep the revision, the assignments do not
      id !== PRIVILEGE_ASSIGNMENTS
    );
  } catch (error) {
    if (ignoreMissing && (error as FrodoError).httpStatus === 404) {
      verboseMessage(
        `No organization privileges config "${id}", nothing to export.`
      );
      return;
    }
    throw error;
  }
}

/**
 * Export the organization privileges configurations in fr-config manager format:
 * the global privilege assignments plus the configuration of every realm, of one realm when a realm is given,
 * or the one configuration that is named. Every configuration is exported even when another one failed, and
 * one summary names the failed ones.
 * @param name Optional id of the one configuration to export: `privilegeAssignments` or the id of the configuration of a realm (`alphaOrgPrivileges`). All configurations when omitted.
 * @param allowFailures True to succeed although some configurations could not be exported (the failures are still summarised)
 * @param realm Optional name of the one realm to export (its configuration plus the global assignments). All realms when omitted or the default realm key.
 * @returns False if the realms cannot be listed, the name is not one of the configurations, or a configuration cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportOrgPrivileges(
  name?: string,
  allowFailures: boolean = false,
  realm?: string
): Promise<boolean> {
  try {
    const ids = await orgPrivilegesIds(realm);
    if (name !== undefined && !ids.includes(name)) {
      printMessage(
        `Error: Unrecognized org config '${name}'. Recognized org config includes: ${ids.join(', ')}`,
        'error'
      );
      return false;
    }
    // what was asked for has to exist; a realm that the tenant lists just may have no configuration
    const asked =
      name !== undefined || (!!realm && realm !== DEFAULT_REALM_KEY);
    const run = new OperationRun({ unit: 'configuration', allowFailures });
    for (const id of name !== undefined ? [name] : ids) {
      await run.run(id, () =>
        exportOrgPrivileges(id, id !== PRIVILEGE_ASSIGNMENTS && !asked)
      );
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error pulling org privileges');
    return false;
  }
}

/**
 * Import one organization privileges file.
 * @param file The path of the file
 * @param id The id of the configuration entity that the file has to hold
 */
async function importOrgPrivilegesFromFile(
  file: string,
  id: string
): Promise<void> {
  const orgPrivileges = readJsonFile(file) as IdObjectSkeletonInterface;
  if (orgPrivileges._id !== id) {
    throw new Error(
      `The file ${file} holds the _id '${orgPrivileges._id}' but the organization privileges configuration is '${id}'.`
    );
  }
  await importConfigEntities({ idm: { [id]: orgPrivileges } });
}

/**
 * Import privilege assignments and all per-realm organization privileges configurations in fr-config manager format,
 * or the one file that is named. Only the files of the privilege assignments and of the realms of the tenant are
 * imported, and a file has to hold the id that its name says. Every file is imported even when another one failed,
 * and one summary names the failed ones.
 * A realm of the tenant without a file has nothing to import; so has a folder without the privilege assignments, which is said.
 * @param name Optional name of the organization privileges file to import (without `.json`). All files when omitted.
 * @param allowFailures True to succeed although some configurations could not be imported (the failures are still summarised)
 * @returns False if the org-privileges folder or the named file is missing, the realms cannot be listed or a file cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportOrgPrivileges(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const run = new OperationRun({ unit: 'configuration', allowFailures });
    if (name !== undefined) {
      const file = getFilePath(`org-privileges/${name}.json`);
      if (!fs.existsSync(file)) {
        printMessage(
          `Organization privileges file not found: ${file}`,
          'error'
        );
        return false;
      }
      await run.run(name, () => importOrgPrivilegesFromFile(file, name));
      return run.finish();
    }
    const folder = getFilePath('org-privileges');
    if (!fs.existsSync(folder)) {
      printMessage(
        `No org-privileges folder found to import from: ${folder}`,
        'error'
      );
      return false;
    }
    for (const id of await orgPrivilegesIds()) {
      const file = getFilePath(`org-privileges/${id}.json`);
      if (!fs.existsSync(file)) {
        if (id === PRIVILEGE_ASSIGNMENTS) {
          printMessage(
            `Skipping privilegeAssignments: no privilegeAssignments.json in '${folder}'.`,
            'warn'
          );
        } else {
          // a pull writes no file for a realm that has no configuration
          verboseMessage(
            `No organization privileges file for "${id}", nothing to import.`
          );
        }
        continue;
      }
      await run.run(id, () => importOrgPrivilegesFromFile(file, id));
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error pushing org privileges');
    return false;
  }
}
