import { frodo, state } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath } = frodo.utils;
const { readSecretStoreMappings } = frodo.secretStore;

export async function configManagerExportSecretMappings(
  name?,
  realm?
): Promise<boolean> {
  try {
    if (realm && realm !== '__default__realm__') {
      const readData = await readSecretStoreMappings(
        'ESV',
        'GoogleSecretManagerSecretStoreProvider',
        false
      );
      processSecretMappings(readData, `realms/${realm}/secret-mappings`, name);
    } else {
      for (const realm of await realmList()) {
        state.setRealm(realm);
        const readData = await readSecretStoreMappings(
          'ESV',
          'GoogleSecretManagerSecretStoreProvider',
          false
        );
        processSecretMappings(
          readData,
          `realms/${realm}/secret-mappings`,
          name
        );
      }
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
