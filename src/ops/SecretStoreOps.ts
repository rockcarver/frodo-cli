import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { SecretStoreMappingSkeleton } from '@rockcarver/frodo-lib/types/api/SecretStoreApi';
import fs from 'fs';

import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { errorHandler } from './utils/OpsUtils';

const {
  readSecretStore,
  readSecretStores,
  exportSecretStore,
  exportSecretStores,
  importSecretStores,
  readSecretStoreSchema,
  readSecretStoreMappings,
  readSecretStoreMapping,
  canSecretStoreHaveMappings,
  updateSecretStoreMapping,
} = frodo.secretStore;

const {
  getTypedFilename,
  getFilePath,
  saveJsonToFile,
  saveToFile,
  getWorkingDirectory,
  getRealmName,
  titleCase,
} = frodo.utils;

/**
 * List secret stores
 * @param {boolean} [long=false] detailed list
 * @param {boolean} global true to list global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listSecretStores(
  long: boolean = false,
  global: boolean = false
): Promise<boolean> {
  try {
    const stores = await readSecretStores(global);
    if (long) {
      const table = createTable(['Id', 'Type', 'Mappings']);
      for (const store of stores) {
        let mappings;
        if (canSecretStoreHaveMappings(store._type._id)) {
          mappings = await readSecretStoreMappings(
            store._id,
            store._type._id,
            global
          );
        }
        table.push([
          store._id,
          store._type.name,
          mappings
            ? mappings.map((m) => m.secretId).join('\n')
            : 'N/A'['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      stores.forEach((s) => printMessage(`${s._id}`, 'data'));
    }
    return true;
  } catch (error) {
    printError(error, `Error listing secret stores`);
  }
  return false;
}

/**
 * List secret store mappings
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {boolean} [long=false] detailed list including aliases
 * @param {boolean} global true to list from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listSecretStoreMappings(
  secretStoreId: string,
  secretStoreTypeId?: string,
  long: boolean = false,
  global: boolean = false
): Promise<boolean> {
  try {
    const mappings = await readSecretStoreMappings(
      secretStoreId,
      secretStoreTypeId,
      global
    );
    if (long) {
      printMappingsTable(mappings);
    } else {
      mappings.forEach((m) => printMessage(`${m.secretId}`, 'data'));
    }
    return true;
  } catch (error) {
    printError(error, `Error listing secret store mappings`);
  }
  return false;
}

/**
 * List secret store mapping aliases
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} secretId the secret store mapping label
 * @param {boolean} [long=false] detailed list with which aliases are active
 * @param {boolean} global true to list from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listSecretStoreMappingAliases(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  secretId: string,
  long: boolean = false,
  global: boolean = false
): Promise<boolean> {
  try {
    const mapping = await readSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      secretId,
      global
    );
    if (long) {
      const table = createTable(['Alias', 'Active']);
      let active = true;
      for (const alias of mapping.aliases) {
        table.push([
          alias,
          // The first one is always active
          active && !(active = false)
            ? 'true'['brightGreen']
            : 'false'['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      mapping.aliases.forEach((a) => printMessage(a, 'data'));
    }
    return true;
  } catch (error) {
    printError(error, `Error listing mapping aliases`);
  }
  return false;
}

/**
 * Describe secret store
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {boolean} global true if global secret store, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeSecretStore(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  global: boolean = false
) {
  try {
    const secretStore = await readSecretStore(
      secretStoreId,
      secretStoreTypeId,
      global
    );
    secretStoreId = secretStore._id || secretStoreId;
    secretStoreTypeId = secretStore._type._id || secretStoreTypeId;
    const schema = await readSecretStoreSchema(secretStoreTypeId, global);
    const table = createKeyValueTable();
    table.push(['Id'['brightCyan'], secretStoreId]);
    table.push(['Type'['brightCyan'], secretStoreTypeId]);
    for (const [key, info] of Object.entries(schema.properties).sort(
      // This sorts the properties in ascending order (see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#parameters)
      (p1, p2) => p1[1].propertyOrder - p2[1].propertyOrder
    )) {
      table.push([`${info.title}`['brightCyan'], secretStore[key]]);
    }
    printMessage(table.toString(), 'data');
    if (!canSecretStoreHaveMappings(secretStoreTypeId)) return true;
    const mappings = await readSecretStoreMappings(
      secretStoreId,
      secretStoreTypeId,
      global
    );
    printMessage(`\nMappings (${mappings.length}):\n`, 'data');
    printMappingsTable(mappings);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Create secret store mapping
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} secretId the secret store mapping label
 * @param {string} aliases comma separated list of aliases
 * @param {boolean} global true to create as part of a global secret store, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createSecretStoreMapping(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  secretId: string,
  aliases: string,
  global: boolean = false
) {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Creating the mapping ${secretId} in the secret store ${secretStoreId}...`
  );
  try {
    const mapping: SecretStoreMappingSkeleton = {
      _id: secretId,
      secretId,
      aliases: aliases.split(','),
    };
    await frodo.secretStore.createSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      mapping,
      global
    );
    stopProgressIndicator(
      spinnerId,
      `Created the mapping ${secretId} in the secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Create secret store mapping alias
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} secretId the secret store mapping label
 * @param {string} alias the alias to create
 * @param {boolean} isActive true to activate the alias on create, false to make it inactive on create. Default: false
 * @param {boolean} global true to create as part of a global secret store, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createSecretStoreMappingAlias(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  secretId: string,
  alias: string,
  isActive: boolean = false,
  global: boolean = false
) {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Creating the mapping alias ${alias} in the mapping ${secretId} in the secret store ${secretStoreId}...`
  );
  try {
    const mapping = await readSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      secretId,
      global
    );
    if (mapping.aliases.includes(alias)) {
      stopProgressIndicator(
        spinnerId,
        `Duplicate alias ${alias} found in the mapping ${secretId} in the secret store ${secretStoreId}.`,
        'fail'
      );
      return false;
    }
    delete mapping._rev;
    if (isActive) {
      mapping.aliases.unshift(alias);
    } else {
      mapping.aliases.push(alias);
    }
    await updateSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      mapping,
      global
    );
    stopProgressIndicator(
      spinnerId,
      `Created the mapping alias ${alias} in the mapping ${secretId} in the secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Activate secret store mapping alias
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} secretId the secret store mapping label
 * @param {string} alias the alias to activate
 * @param {boolean} global true to create as part of a global secret store, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function activateSecretStoreMappingAlias(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  secretId: string,
  alias: string,
  global: boolean = false
) {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Activating the mapping alias ${alias} in the mapping ${secretId} in the secret store ${secretStoreId}...`
  );
  try {
    const mapping = await readSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      secretId,
      global
    );
    delete mapping._rev;
    const aliasIndex = mapping.aliases.indexOf(alias);
    if (aliasIndex === -1) {
      stopProgressIndicator(
        spinnerId,
        `Could not find the alias ${alias} in the mapping ${secretId} in the secret store ${secretStoreId}`,
        'fail'
      );
      return false;
    }
    mapping.aliases.unshift(mapping.aliases.splice(aliasIndex, 1)[0]);
    await updateSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      mapping,
      global
    );
    stopProgressIndicator(
      spinnerId,
      `Activated the mapping alias ${alias} in the mapping ${secretId} in the secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export secret store to file
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} file file name
 * @param {boolean} global true to export a global secret store, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSecretStoreToFile(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  file: string,
  global: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${secretStoreId}...`
  );
  try {
    const exportData = await exportSecretStore(
      secretStoreId,
      secretStoreTypeId,
      global
    );
    if (!file) {
      file = getTypedFilename(secretStoreId, 'secretstore');
    }
    const filePath = getFilePath(file, true);
    updateProgressIndicator(
      indicatorId,
      `Saving ${secretStoreId} to ${filePath}...`
    );
    saveJsonToFile(exportData, getFilePath(filePath, true), includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported secret store ${secretStoreId} to file`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting secret store ${secretStoreId} to file`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all secret stores to file
 * @param {string} file file name
 * @param {boolean} global true to export global secret stores, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSecretStoresToFile(
  file: string,
  global: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportSecretStores(global, errorHandler);
    if (!file) {
      file = getTypedFilename(
        `all${global ? 'Global' : titleCase(getRealmName(state.getRealm()))}SecretStores`,
        'secretstore'
      );
    }
    saveJsonToFile(exportData, getFilePath(file, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting secret stores to file`);
  }
  return false;
}
/**
 * Export all secret stores to separate files
 * @param {boolean} global true to export global secret stores, false otherwise
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSecretStoresToFiles(
  global: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportSecretStores(global, errorHandler);
    for (const store of Object.values(exportData.secretstore)) {
      saveToFile(
        'secretstore',
        store,
        '_id',
        getFilePath(getTypedFilename(store._id, 'secretstore'), true),
        includeMeta
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting secret stores to files`);
  }
  return false;
}

/**
 * Import secret store from file
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} file file name
 * @param {boolean} global true to import a global secret store, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSecretStoreFromFile(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  file: string,
  global: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Reading secret store...'
    );
    const importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
    updateProgressIndicator(indicatorId, 'Importing secret store...');
    await importSecretStores(
      importData,
      global,
      secretStoreId,
      secretStoreTypeId,
      errorHandler
    );
    stopProgressIndicator(
      indicatorId,
      `Successfully imported secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing secret store ${secretStoreId}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import secret stores from file
 * @param {string} file file name
 * @param {boolean} global true to import global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSecretStoresFromFile(
  file: string,
  global: boolean = false
): Promise<boolean> {
  try {
    debugMessage(`importSecretStoresFromFile: start`);
    debugMessage(`importSecretStoresFromFile: importing ${file}`);
    const importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
    await importSecretStores(
      importData,
      global,
      undefined,
      undefined,
      errorHandler
    );
    debugMessage(`importSecretStoresFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing secret stores from file`);
  }
  return false;
}

/**
 * Import secret stores from separate files
 * @param {boolean} global true to import global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSecretStoresFromFiles(
  global: boolean = false
): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const roleFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.secretstore.json')
    );
    for (const file of roleFiles) {
      try {
        await importSecretStoresFromFile(file, global);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing secret stores from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(
        `One or more errors importing secret stores`,
        errors
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error importing secret stores from files`);
  }
  return false;
}

/**
 * Import first secret store from file
 * @param {string} file file name
 * @param {boolean} global true to import a global secret store, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstSecretStoreFromFile(
  file: string,
  global: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing first secret store...'
    );
    const importData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
    Object.keys(importData.secretstore)
      .slice(1)
      .forEach((k) => delete importData[k]);
    await importSecretStores(
      importData,
      global,
      undefined,
      undefined,
      errorHandler
    );
    stopProgressIndicator(
      indicatorId,
      `Imported first secret store from ${file}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing first secret store from ${file}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete secret store
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {boolean} global true to delete from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecretStore(
  secretStoreId: string,
  secretStoreTypeId?: string,
  global: boolean = false
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${secretStoreId}...`
  );
  try {
    await frodo.secretStore.deleteSecretStore(
      secretStoreId,
      secretStoreTypeId,
      global
    );
    stopProgressIndicator(spinnerId, `Deleted ${secretStoreId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete secret stores
 * @param {boolean} global true to delete from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecretStores(
  global: boolean = false
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting secret stores...`
  );
  try {
    await frodo.secretStore.deleteSecretStores(global, errorHandler);
    stopProgressIndicator(spinnerId, `Deleted all secret stores.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete secret store mapping
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} secretId the secret store mapping label
 * @param {boolean} global true to delete from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecretStoreMapping(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  secretId: string,
  global: boolean = false
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${secretId} from secret store ${secretStoreId}...`
  );
  try {
    await frodo.secretStore.deleteSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      secretId,
      global
    );
    stopProgressIndicator(
      spinnerId,
      `Deleted ${secretId} from secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete secret store mappings
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {boolean} global true to delete from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecretStoreMappings(
  secretStoreId: string,
  secretStoreTypeId?: string,
  global: boolean = false
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting secret store mappings from the secret store ${secretStoreId}...`
  );
  try {
    await frodo.secretStore.deleteSecretStoreMappings(
      secretStoreId,
      secretStoreTypeId,
      global,
      errorHandler
    );
    stopProgressIndicator(
      spinnerId,
      `Deleted all mappings from the secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete secret store mapping alias
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} secretId the secret store mapping label
 * @param {string} alias the alias to delete
 * @param {boolean} global true to delete from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecretStoreMappingAlias(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  secretId: string,
  alias: string,
  global: boolean = false
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting the alias ${alias} from the mapping ${secretId} in the secret store ${secretStoreId}...`
  );
  try {
    const mapping = await readSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      secretId,
      global
    );
    delete mapping._rev;
    const index = mapping.aliases.indexOf(alias);
    if (index === -1) {
      stopProgressIndicator(
        spinnerId,
        `Could not find the alias ${alias} in the mapping ${secretId} in the secret store ${secretStoreId}`,
        'fail'
      );
      return false;
    }
    if (mapping.aliases.length === 1) {
      stopProgressIndicator(
        spinnerId,
        `Cannot delete alias ${alias} since it is the last remaining alias in the mapping ${secretId} in the secret store ${secretStoreId}`,
        'fail'
      );
      return false;
    }
    mapping.aliases.splice(index, 1);
    await updateSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      mapping,
      global
    );
    stopProgressIndicator(
      spinnerId,
      `Deleted the alias ${alias} from the mapping ${secretId} in the secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete secret store mapping aliases expect for the active one
 * @param {string} secretStoreId the secret store id
 * @param {string | undefined} secretStoreTypeId the secret store type id (optional)
 * @param {string} secretId the secret store mapping label
 * @param {boolean} global true to delete from global secret stores, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecretStoreMappingAliases(
  secretStoreId: string,
  secretStoreTypeId: string | undefined,
  secretId: string,
  global: boolean = false
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting all aliases from the mapping ${secretId} in the secret store ${secretStoreId}...`
  );
  try {
    const mapping = await readSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      secretId,
      global
    );
    delete mapping._rev;
    mapping.aliases = [mapping.aliases[0]];
    await updateSecretStoreMapping(
      secretStoreId,
      secretStoreTypeId,
      mapping,
      global
    );
    stopProgressIndicator(
      spinnerId,
      `Deleted all aliases from the mapping ${secretId} in the secret store ${secretStoreId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

function printMappingsTable(mappings: SecretStoreMappingSkeleton[]) {
  const table = createTable(['Secret Label', 'Active Alias', 'Other Aliases']);
  for (const mapping of mappings) {
    table.push([
      mapping.secretId,
      mapping.aliases[0],
      mapping.aliases.slice(1).join('\n'),
    ]);
  }
  printMessage(table.toString(), 'data');
}
