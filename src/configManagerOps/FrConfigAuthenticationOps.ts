import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

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
 * @param {boolean} allowFailures True to succeed although some realms could not be exported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to false if the realms cannot be listed or a realm cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportAuthentication(
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'realm', allowFailures });
    for (const realm of realms) {
      if (
        realm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      await run.run(realm, async () => {
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
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting authentication settings`);
  }
  return false;
}

/**
 * Import authentication configuration from the fr-config-manager format.
 * @param {string} realm The realm of the authentication configuration being imported. If not supplied, will import all authentication configuration.
 * @param {boolean} allowFailures True to succeed although some realms could not be imported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to false if the realm folders are missing, the file of a named realm is missing, or a realm cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportAuthentication(
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const singleRealm = realm && realm !== DEFAULT_REALM_KEY;
    const realmsDir = `${getWorkingDirectory()}/realms`;
    if (!singleRealm && !fs.existsSync(realmsDir)) {
      printMessage(
        `No realms folder found to import authentication settings from: ${realmsDir}`,
        'error'
      );
      return false;
    }
    const realmDirs = singleRealm
      ? [realm === '/' ? 'root' : realm]
      : fs.readdirSync(realmsDir);
    const run = new OperationRun({ unit: 'realm', allowFailures });
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
      await run.run(realmName, async () => {
        await state.setRealm(realmName);
        const authData = readJsonFile(filePath) as any;
        delete authData._rev;
        await importAuthenticationSettings(
          {
            authentication: authData,
          },
          false
        );
      });
    }

    return run.finish();
  } catch (error) {
    printError(error, `Error importing authentication settings`);
  }
  return false;
}
