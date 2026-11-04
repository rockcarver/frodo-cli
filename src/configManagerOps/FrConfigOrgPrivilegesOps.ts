import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { readConfigEntity } = frodo.idm.config;
const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { importConfigEntities } = frodo.idm.config;

/**
 * Export the organization privileges configurations in fr-config manager format:
 * the global privilege assignments plus the configuration of every realm, or of
 * one realm when a realm is given. Every configuration is exported even when
 * another one failed, and one summary names the failed ones.
 * @param {string} name The name of the organization privilege to export
 * @param {boolean} allowFailures True to succeed although some configurations could not be exported (the failures are still summarised)
 * @returns False if the realms cannot be listed or a configuration cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportOrgPrivileges(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const allOrgPrivileges = [
      'privilegeAssignments',
      ...(await realmList())
        .filter(
          (r) =>
            r !== '/' || state.getDeploymentType() !== CLOUD_DEPLOYMENT_TYPE_KEY
        )
        .map((r) => (r === '/' ? 'privileges' : `${r}OrgPrivileges`)),
    ];
    if (name && !allOrgPrivileges.includes(name)) {
      printMessage(
        `Error: Unrecognized org config '${name}'. Recognized org config includes: ${allOrgPrivileges.join(', ')}`,
        'error'
      );
      return false;
    }
    const run = new OperationRun({ unit: 'org privileges', allowFailures });
    const entities = name ? [name] : allOrgPrivileges;
    for (const entity of entities) {
      try {
        saveJsonToFile(
          await readConfigEntity(entity),
          getFilePath(`org-privileges/${entity}.json`, true),
          false,
          false
        );
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error pulling ${entity}`);
        run.recordFailure(entity, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error pulling org privileges');
    return false;
  }
}

/**
 * Import privilege assignments and all per-realm organization privileges configurations in fr-config manager format.
 * Every file is imported even when another one failed, and one summary names the failed ones.
 * A realm of the tenant without a file has nothing to import; so has a folder without the privilege assignments, which is said.
 * @param {string} name Optional name of the organization privileges file to import
 * @param {boolean} allowFailures True to succeed although some configurations could not be imported (the failures are still summarised)
 * @returns False if the org-privileges folder is missing, the realms cannot be listed or a file cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportOrgPrivileges(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'org privileges', allowFailures });
  try {
    const dir = path.join(getWorkingDirectory(), 'org-privileges');
    const fileNames = fs
      .readdirSync(dir)
      .filter((fileName) => path.extname(fileName) === '.json')
      .filter((fileName) => !name || path.parse(fileName).name === name);
    for (const fileName of fileNames) {
      const orgConfig = readJsonFile(
        path.join(dir, fileName)
      ) as IdObjectSkeletonInterface;
      try {
        await importConfigEntities({ idm: { [orgConfig._id]: orgConfig } });
        run.recordSuccess();
      } catch (e) {
        printError(e, `Error pushing ${orgConfig._id}`);
        run.recordFailure(orgConfig._id, causeOf(e));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error pushing org privileges');
    return false;
  }
}
