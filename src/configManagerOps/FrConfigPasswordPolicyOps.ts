import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { getIdmImportExportOptions } from '../ops/IdmOps';
import { printError } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { exportConfigEntity, importConfigEntities } = frodo.idm.config;

/**
 * Export IDM password policy configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportPasswordPolicy(
  realm?: string,
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    if (realm && realm !== '__default__realm__') {
      const realmData = (
        await exportConfigEntity(`fieldPolicy/${realm}_user`, {
          envReplaceParams: options.envReplaceParams,
          entitiesToExport: undefined,
        })
      ).idm[`fieldPolicy/${realm}_user`];
      const fileName = `realms/${realm}/password-policy/${realm}_user-password-policy.json`;
      saveJsonToFile(realmData, getFilePath(fileName, true), false, true);
    } else {
      for (const realmName of await realmList()) {
        // fr-config-manager doesn't support root themes
        if (realmName === '/') continue;
        const realmData = (
          await exportConfigEntity(`fieldPolicy/${realmName}_user`, {
            envReplaceParams: options.envReplaceParams,
            entitiesToExport: undefined,
          })
        ).idm[`fieldPolicy/${realmName}_user`];
        const fileName = `realms/${realmName}/password-policy/${realmName}_user-password-policy.json`;
        saveJsonToFile(realmData, getFilePath(fileName, true), false, true);
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
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
    const realms =
      realm && realm !== '__default__realm__' ? [realm] : await realmList();
    for (const realmName of realms) {
      // fr-config-manager doesn't support root themes
      if (realmName === '/') continue;
      const filePath = getFilePath(
        `realms/${realmName}/password-policy/${realmName}_user-password-policy.json`
      );
      const mainFile = fs.readFileSync(filePath, 'utf8');
      let importData = JSON.parse(mainFile);
      const id = importData._id;
      importData = { idm: { [id]: importData } };
      await importConfigEntities(importData);
    }
    return true;
  } catch (error) {
    printError(error, `Error importing config entity ui-configuration`);
  }
  return false;
}
