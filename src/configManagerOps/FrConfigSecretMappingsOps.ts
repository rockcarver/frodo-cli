import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';
import path from 'path';

import { printError } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath } = frodo.utils;
const { readSecretStoreMappings, updateSecretStoreMapping } = frodo.secretStore;

const constants = frodo.utils.constants;
const { DEFAULT_REALM_KEY } = constants;

const ESV_SECRET_STORE_ID = 'ESV';
const ESV_SECRET_STORE_TYPE = 'GoogleSecretManagerSecretStoreProvider';
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
      const readData = await readSecretStoreMappings(
        ESV_SECRET_STORE_ID,
        ESV_SECRET_STORE_TYPE,
        false
      );
      processSecretMappings(readData, `realms/${realm}/secret-mappings`, name);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity endpoints`);
  }
  return false;
}

async function processSecretMappings(mappings, targetDir, name) {
  try {
    for (const mapping of mappings) {
      if (
        name &&
        !(await aliasSearch(mapping.aliases, name)) &&
        name !== mapping._id
      ) {
        continue;
      }
      const fileName = `${targetDir}/${mapping._id}.json`;
      saveJsonToFile(mapping, getFilePath(fileName, true), false, true);
    }
  } catch (err) {
    printError(err);
  }
}

async function aliasSearch(object, name) {
  if (object.includes(name)) {
    return true;
  } else {
    return false;
  }
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
        const importData = JSON.parse(
          fs.readFileSync(path.join(dir, configFile), 'utf8')
        );

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
