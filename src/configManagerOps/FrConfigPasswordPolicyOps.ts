import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { DEFAULT_REALM_KEY } = frodo.utils.constants;
const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { readConfigEntity, importConfigEntities } = frodo.idm.config;

/**
 * Export IDM password policy configuration object in the fr-config-manager format.
 * @param {string} realm Defines a specific realm to pull password-policy config from
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportPasswordPolicy(
  realm?: string
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    for (const realm of realms) {
      if (
        realm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      const objectName = `${realm === '/' ? '' : `${realm}_`}user`;
      const passwordPolicy = await readConfigEntity(
        `fieldPolicy/${objectName}`
      );
      const fileName = `realms/${realm === '/' ? 'root' : realm}/password-policy/${objectName}-password-policy.json`;
      saveJsonToFile(passwordPolicy, getFilePath(fileName, true), false, true);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting password policies`);
  }
  return false;
}

/**
 * Import IDM password policy configuration object from fr-config-manager export.
 * @param {string} realm the realm to import into
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportPasswordPolicy(
  realm?: string
): Promise<boolean> {
  try {
    printMessage('Updating password policy');
    const realms =
      realm && realm !== DEFAULT_REALM_KEY
        ? [realm]
        : fs
            .readdirSync(`${getWorkingDirectory()}/realms`)
            .map((r) => (r === 'root' ? '/' : r));
    for (const realm of realms) {
      if (
        realm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      const objectName = `${realm === '/' ? '' : `${realm}_`}user`;
      const filePath = getFilePath(
        `realms/${realm === '/' ? 'root' : realm}/password-policy/${objectName}-password-policy.json`
      );
      const parsedData = readJsonFile(filePath) as any;
      // Support both fr-config wrappers ({ idm: { ... }, meta: ... }) and
      // single-entity files with a top-level _id.
      if (
        parsedData?.idm &&
        typeof parsedData.idm === 'object' &&
        Object.keys(parsedData.idm).length > 0
      ) {
        await importConfigEntities({ idm: parsedData.idm });
      } else {
        if (!parsedData?._id) {
          throw new Error(
            `Invalid password policy payload in '${filePath}': expected either an 'idm' map or top-level '_id'.`
          );
        }
        await importConfigEntities({
          idm: { [parsedData._id]: parsedData },
        });
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error importing password policies`);
  }
  return false;
}
