import { frodo, state } from '@rockcarver/frodo-lib';
import { AuthenticationSettingsExportInterface } from '@rockcarver/frodo-lib/types/ops/AuthenticationSettingsOps';
import fs from 'fs';

import { printError } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const {
  readAuthenticationSettings: _readAuthenticationSettings,
  importAuthenticationSettings,
} = frodo.authn.settings;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportAuthentication(
  realm?: string
): Promise<boolean> {
  try {
    if (realm && realm !== '__default__realm__') {
      const exportData = await _readAuthenticationSettings(false);
      const fileName = `realms/${state.getRealm()}/realm-config/authentication.json`;
      saveJsonToFile(exportData, getFilePath(`${fileName}`, true), false, true);
    } else {
      for (const realmName of await realmList()) {
        if (
          realmName === '/' &&
          state.getDeploymentType() ===
            frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
        )
          continue;

        state.setRealm(realmName);
        const exportData = await _readAuthenticationSettings(false);
        const fileName = `realms/${realmName}/realm-config/authentication.json`;
        saveJsonToFile(
          exportData,
          getFilePath(`${fileName}`, true),
          false,
          true
        );
      }
    }

    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
  }
  return false;
}

/**
 * Import authentication configuration from the fr-config-manager format.
 * @param {string} realm The realm of the authentication configuration being imported. If not supplied, will import all authentication configuration.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportAuthentication(
  realm?: string
): Promise<boolean> {
  try {
    if (realm) {
      const filePath = getFilePath(
        `realms/${realm}/realm-config/authentication.json`
      );
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const authData = JSON.parse(fileContent);
      delete authData._rev;
      const importData: AuthenticationSettingsExportInterface = {
        authentication: authData,
      };

      await importAuthenticationSettings(importData, false);
    } else {
      const realmsPath = getFilePath(`realms/`);
      const realmDirs = fs.readdirSync(realmsPath);
      for (const realmName of realmDirs) {
        await state.setRealm(realmName);
        let realmPath;

        if (realmName === 'realm-config') {
          await state.setRealm('/');
          realmPath = getFilePath(`realms/realm-config/authentication.json`);
        } else {
          await state.setRealm(realmName);
          realmPath = getFilePath(
            `realms/${realmName}/realm-config/authentication.json`
          );
        }

        const fileContent = fs.readFileSync(realmPath, 'utf-8');
        const authData = JSON.parse(fileContent);
        delete authData._rev;
        const importData: AuthenticationSettingsExportInterface = {
          authentication: authData,
        };

        await importAuthenticationSettings(importData, false);
      }
    }

    return true;
  } catch (error) {
    printError(error, `Error importing authentication settings`);
  }
  return false;
}
