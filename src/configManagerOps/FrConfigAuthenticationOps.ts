import { frodo, state } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { readAuthenticationSettings: _readAuthenticationSettings } =
  frodo.authn.settings;
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
