import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import {
  type ConfigEntityExportInterface,
  type ConfigEntityImportOptions,
} from '@rockcarver/frodo-lib/types/ops/IdmConfigOps';
import { SyncSkeleton } from '@rockcarver/frodo-lib/types/ops/MappingOps';
import fs from 'fs';
import path from 'path';
import propertiesReader from 'properties-reader';
import replaceall from 'replaceall';

import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import {
  getLegacyMappingsFromFiles,
  writeSyncJsonToDirectory,
} from './MappingOps';

const { stringify } = frodo.utils.json;

const {
  unSubstituteEnvParams,
  areScriptHooksValid,
  getFilePath,
  getTypedFilename,
  readFiles,
  getWorkingDirectory,
  saveJsonToFile,
  saveTextToFile,
} = frodo.utils;

const {
  readConfigEntities,
  readConfigEntity,
  exportConfigEntities,
  updateConfigEntity,
  importConfigEntities,
} = frodo.idm.config;
const { queryManagedObjects } = frodo.idm.managed;
const { testConnectorServers } = frodo.idm.system;

/**
 * Warn about and list offline remote connector servers
 * @return {Promise<boolean>} a promise that resolves to true if a warning was printed, false otherwise
 */
export async function warnAboutOfflineConnectorServers(): Promise<boolean> {
  try {
    const all = await testConnectorServers();
    const offline = all
      .filter((status) => !status.ok)
      .map((status) => status.name);
    if (offline.length > 0) {
      printMessage(
        `\nThe following connector server(s) are offline and their connectors and configuration unavailable:\n${offline.join(
          '\n'
        )}`,
        'warn'
      );
      return true;
    }
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * List all IDM configuration objects
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function listAllConfigEntities(): Promise<boolean> {
  try {
    const configurations = await readConfigEntities();
    for (const configEntity of configurations) {
      printMessage(`${configEntity._id}`, 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export an IDM configuration object.
 * @param {string} id the desired configuration object
 * @param {string} file optional export file name (or directory name if exporting mappings separately)
 * @param {boolean} separateMappings separate sync.json mappings if true (and id is "sync"), otherwise keep them in a single file
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportConfigEntity(
  id: string,
  file: string,
  separateMappings: boolean = false
): Promise<boolean> {
  try {
    const configEntity = await readConfigEntity(id);
    if (separateMappings && id === 'sync') {
      writeSyncJsonToDirectory(configEntity as SyncSkeleton, file);
      return true;
    }
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(`${id}`, 'idm');
    }
    saveJsonToFile(configEntity, getFilePath(fileName, true), false);
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ${id}`);
  }
  return false;
}

/**
 * Export all IDM configuration objects into separate JSON files in a directory specified by <directory>
 * @param {boolean} separateMappings separate sync.json mappings if true, otherwise keep them in a single file
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportAllRawConfigEntities(
  separateMappings: boolean = false
) {
  try {
    const exportedConfigurations = await exportConfigEntities();
    for (const [id, value] of Object.entries(exportedConfigurations.idm)) {
      if (value != null) {
        if (separateMappings && id === 'sync') {
          writeSyncJsonToDirectory(value as SyncSkeleton);
          continue;
        }
        saveJsonToFile(value, getFilePath(`${id}.json`, true), false);
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all IDM configuration objects
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} separateMappings separate sync.json mappings if true, otherwise keep them in a single file
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportAllConfigEntities(
  entitiesFile: string,
  envFile: string,
  separateMappings: boolean = false
): Promise<boolean> {
  const errors: Error[] = [];
  try {
    let entriesToExport = [];
    // read list of entities to export
    const data = fs.readFileSync(entitiesFile, 'utf8');
    const entriesData = JSON.parse(data);
    entriesToExport = entriesData.idm;

    // read list of configs to parameterize for environment specific values
    const envParams = propertiesReader(envFile);

    const configurations = await readConfigEntities();
    createProgressIndicator(
      'indeterminate',
      undefined,
      'Exporting config objects...'
    );
    const entityPromises = [];
    for (const configEntity of configurations) {
      if (entriesToExport.includes(configEntity._id)) {
        entityPromises.push(readConfigEntity(configEntity._id));
      }
    }
    const results = await Promise.all(entityPromises);
    for (const item of results) {
      if (item != null) {
        try {
          let configEntityString = stringify(item);
          envParams.each((key, value) => {
            configEntityString = replaceall(
              value,
              `\${${key}}`,
              configEntityString
            );
          });
          if (separateMappings && item._id === 'sync') {
            writeSyncJsonToDirectory(JSON.parse(configEntityString));
            continue;
          }
          saveTextToFile(
            configEntityString,
            getFilePath(`${item._id}.json`, true)
          );
        } catch (error) {
          errors.push(
            new FrodoError(`Error saving config entity ${item._id}`, error)
          );
        }
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error saving config entities`, errors);
    }
    stopProgressIndicator(null, 'success');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import an IDM configuration object by id from file.
 * @param {string} entityId the configuration object to import
 * @param {string} file optional file to import
 * @param {boolean} validate validate script hooks
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importConfigEntityByIdFromFile(
  entityId: string,
  file?: string,
  validate?: boolean
): Promise<boolean> {
  try {
    if (!file) {
      file = getTypedFilename(entityId, 'idm');
    }

    const fileData = fs.readFileSync(
      path.resolve(process.cwd(), getFilePath(file)),
      'utf8'
    );

    const entityData = JSON.parse(fileData);
    const isValid = areScriptHooksValid(entityData);
    if (validate && !isValid) {
      printMessage('Invalid IDM configuration object', 'error');
      return;
    }

    await updateConfigEntity(entityId, entityData, true);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import IDM configuration object from file.
 * @param {string} file optional file to import
 * @param {boolean} validate validate script hooks
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importConfigEntityFromFile(
  file: string,
  validate?: boolean
): Promise<boolean> {
  const filePath = getFilePath(file);
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${filePath}...`
    );
    const fileData = fs.readFileSync(
      path.resolve(process.cwd(), filePath),
      'utf8'
    );
    const entityData = JSON.parse(fileData);
    const entityId = entityData._id;
    const isValid = areScriptHooksValid(entityData);
    if (validate && !isValid) {
      printMessage('Invalid IDM configuration object', 'error');
      return;
    }

    await updateConfigEntity(entityId, entityData, true);
    stopProgressIndicator(
      indicatorId,
      `Imported ${entityId} from ${filePath}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing ${filePath}.`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import all IDM configuration objects from separate JSON files in a directory specified by <directory>
 * @param {ConfigEntityImportOptions} options import options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importAllRawConfigEntities(
  options: ConfigEntityImportOptions = {
    validate: false,
  }
) {
  let indicatorId: string;
  const baseDirectory = getWorkingDirectory();
  try {
    const importData = {
      idm: await getIdmImportDataFromIdmDirectory(baseDirectory),
    };
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config entities from ${baseDirectory}...`
    );
    await importConfigEntities(
      importData as ConfigEntityExportInterface,
      options
    );
    stopProgressIndicator(indicatorId, `Imported config entities`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing config entities from ${baseDirectory}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import all IDM configuration objects
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {ConfigEntityImportOptions} options import options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importAllConfigEntities(
  entitiesFile: string,
  envFile: string,
  options: ConfigEntityImportOptions = {
    validate: false,
  }
): Promise<boolean> {
  let indicatorId: string;
  const baseDirectory = getWorkingDirectory();
  try {
    const importData = {
      idm: await getIdmImportDataFromIdmDirectory(
        baseDirectory,
        entitiesFile,
        envFile
      ),
    };
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config entities from ${baseDirectory}...`
    );
    await importConfigEntities(
      importData as ConfigEntityExportInterface,
      options
    );
    stopProgressIndicator(indicatorId, `Imported config entities`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing config entities from ${baseDirectory}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Count number of managed objects of a given type
 * @param {String} type managed object type, e.g. alpha_user
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function countManagedObjects(type: string): Promise<boolean> {
  try {
    const result = await queryManagedObjects(type);
    printMessage(`${type}: ${result.length}`, 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Helper that reads all the idm config entity data from a directory
 * @param directory The directory of the idm config entities
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 */
export async function getIdmImportDataFromIdmDirectory(
  directory: string,
  entitiesFile?: string,
  envFile?: string
): Promise<Record<string, IdObjectSkeletonInterface>> {
  const envReader = envFile ? propertiesReader(envFile) : undefined;
  const entriesToImport = entitiesFile
    ? JSON.parse(fs.readFileSync(entitiesFile, 'utf8')).idm
    : undefined;
  const importData = {} as Record<string, IdObjectSkeletonInterface>;
  const idmConfigFiles = await readFiles(directory);
  idmConfigFiles.forEach(
    (f) => (f.path = f.path.toLowerCase().replace(/\/$/, ''))
  );
  // Process sync mapping file(s)
  if (!entriesToImport || entriesToImport.includes('sync')) {
    importData.sync = getLegacyMappingsFromFiles(idmConfigFiles, envReader);
  }
  // Process other files
  for (const f of idmConfigFiles.filter(
    (f) => !f.path.endsWith('sync.json') && f.path.endsWith('.json')
  )) {
    const entity = JSON.parse(
      envReader ? unSubstituteEnvParams(f.content, envReader) : f.content
    );
    if (!entriesToImport || entriesToImport.includes(entity._id)) {
      importData[entity._id] = entity;
    }
  }
  return importData;
}
