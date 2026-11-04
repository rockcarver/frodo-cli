import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const {
  readAuthenticationSettings: _readAuthenticationSettings,
  importAuthenticationSettings,
} = frodo.authn.settings;
const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { DEFAULT_REALM_KEY } = frodo.utils.constants;

/**
 * Export authentication settings in the fr-config-manager format.
 * @param {string} realm The realm to export from
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportAuthentication(
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
      )
        continue;
      state.setRealm(realm);
      const exportData = await _readAuthenticationSettings(false);
      saveJsonToFile(
        exportData,
        getFilePath(
          `realms/${realm === '/' ? 'root' : realm}/realm-config/authentication.json`,
          true
        ),
        false,
        true
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting authentication settings`);
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
    const singleRealm = realm && realm !== DEFAULT_REALM_KEY;
    const realmDirs = singleRealm
      ? [realm === '/' ? 'root' : realm]
      : fs.readdirSync(`${getWorkingDirectory()}/realms`);
    for (const realmDir of realmDirs) {
      const realmName = realmDir === 'root' ? '/' : realmDir;
      if (
        realmName === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      const filePath = getFilePath(
        `realms/${realmDir}/realm-config/authentication.json`
      );
      if (!fs.existsSync(filePath)) {
        // A realm directory that holds other configuration is not an error
        if (!singleRealm) continue;
        printMessage('No authentication file found to import.');
        return false;
      }
      await state.setRealm(realmName);
      const authData = readJsonFile(filePath) as any;
      delete authData._rev;
      await importAuthenticationSettings(
        {
          authentication: authData,
        },
        false
      );
    }

    return true;
  } catch (error) {
    printError(error, `Error importing authentication settings`);
  }
  return false;
}
