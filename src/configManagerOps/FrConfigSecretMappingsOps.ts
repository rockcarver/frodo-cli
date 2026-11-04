import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type SecretStoreMappingSkeleton,
} from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;
const { readSecretStoreMappings, updateSecretStoreMapping } = frodo.secretStore;

const constants = frodo.utils.constants;
const { DEFAULT_REALM_KEY } = constants;

const ESV_SECRET_STORE_ID = 'ESV';
const ESV_SECRET_STORE_TYPE = 'GoogleSecretManagerSecretStoreProvider';

/**
 * Export all secret-mappings for ESV secret store
 * @param {string} name the name of the mapping to export
 * @param {string} realm the name of the realm to export from
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportSecretMappings(
  name?,
  realm?
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    for (const realm of realms) {
      if (realm === '/') continue;
      state.setRealm(realm);
      const mappings = await readSecretStoreMappings(
        ESV_SECRET_STORE_ID,
        ESV_SECRET_STORE_TYPE,
        false
      );
      for (const mapping of mappings) {
        if (name && name !== mapping._id) {
          continue;
        }
        const fileName = `realms/${realm}/secret-mappings/${mapping._id}.json`;
        saveJsonToFile(mapping, getFilePath(fileName, true), false, true);
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting secret mappings`);
  }
  return false;
}

/**
 * Import all secret-mappings for ESV secret store
 * @param {string} name the name of the mapping to import
 * @param {string} realm the name of the realm to import to
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportSecretMappings(
  name?: string,
  realm?: string
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();

    for (const realm of realms) {
      if (realm === '/') continue;

      state.setRealm(realm);

      const dir = getFilePath(`realms/${realm}/secret-mappings/`);
      if (!fs.existsSync(dir)) continue;

      const configFiles = fs
        .readdirSync(dir)
        .filter((f) => path.extname(f) === '.json');

      for (const configFile of configFiles) {
        const importData = readJsonFile(
          path.join(dir, configFile)
        ) as SecretStoreMappingSkeleton;

        if (name && name !== importData._id) continue;

        delete importData._rev;

        await updateSecretStoreMapping(
          ESV_SECRET_STORE_ID,
          ESV_SECRET_STORE_TYPE,
          importData,
          false
        );
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error importing secret mappings`);
    return false;
  }
}
