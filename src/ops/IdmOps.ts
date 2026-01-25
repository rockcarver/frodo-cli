import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { type ConfigEntityExportInterface } from '@rockcarver/frodo-lib/types/ops/IdmConfigOps';
import { SyncSkeleton } from '@rockcarver/frodo-lib/types/ops/MappingOps';
import fs from 'fs';
import path from 'path';
import propertiesReader from 'properties-reader';

import { extractDataToFile, getExtractedJsonData } from '../utils/Config';
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
import { errorHandler } from './utils/OpsUtils';

const {
  getFilePath,
  getTypedFilename,
  readFiles,
  getWorkingDirectory,
  saveJsonToFile,
  saveToFile,
} = frodo.utils;

const {
  readConfigEntities,
  exportConfigEntity,
  exportConfigEntities,
  deleteConfigEntity,
  importConfigEntities,
  readSubConfigEntity,
  importSubConfigEntity,
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

type ObjectSkeleton = IdObjectSkeletonInterface & {
  name: string;
};

export type ManagedSkeleton = IdObjectSkeletonInterface & {
  objects: ObjectSkeleton[];
};

/**
 * Export an IDM configuration object.
 * @param {string} id the desired configuration object
 * @param {string} file optional export file name (or directory name if exporting mappings separately)
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} separateMappings separate sync.idm.json mappings if true (and id is "sync"), otherwise keep them in a single file
 * @param {boolean} separateObjects separate managed.idm.json objects if true (and id is "managed"), otherwise keep them in a single file
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportConfigEntityToFile(
  id: string,
  file?: string,
  envFile?: string,
  separateMappings: boolean = false,
  separateObjects: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = await exportConfigEntity(id, {
      envReplaceParams: options.envReplaceParams,
      entitiesToExport: undefined,
    });
    if (separateMappings && id === 'sync') {
      writeSyncJsonToDirectory(
        exportData.idm[id] as SyncSkeleton,
        file,
        includeMeta
      );
      return true;
    }
    if (separateObjects && id === 'managed') {
      writeManagedJsonToDirectory(
        exportData.idm[id] as ManagedSkeleton,
        file,
        includeMeta
      );
      return true;
    }
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(`${id}`, 'idm');
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ${id}`);
  }
  return false;
}

/**
 * Export an IDM configuration managed object.
 * @param {string} name the desired configuration object
 * @param {string} file optional export file name
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportManagedObjectToFile(
  name: string,
  file?: string,
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = await readSubConfigEntity('managed', name, {
      envReplaceParams: options.envReplaceParams,
      entitiesToExport: undefined,
    });

    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(name, 'managed');
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), false);
    return true;
  } catch (error) {
    printError(error, `Error exporting config managed object ${name}`);
  }
  return false;
}

/**
 * Export all IDM configuration objects
 * @param {string} file file to export to
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportAllConfigEntitiesToFile(
  file?: string,
  entitiesFile?: string,
  envFile?: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(entitiesFile, envFile);
    const exportData = await exportConfigEntities(
      {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: options.entitiesToExportOrImport,
      },
      errorHandler
    );
    let fileName = getTypedFilename(`all`, `idm`);
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting idm config to file`);
  }
  return false;
}

/**
 * Export all IDM configuration objects to separate files
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} separateMappings separate sync.idm.json mappings if true, otherwise keep them in a single file
 * @param {boolean} separateObjects separate managed.idm.json objects if true, otherwise keep them in a single file
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportAllConfigEntitiesToFiles(
  entitiesFile?: string,
  envFile?: string,
  separateMappings: boolean = false,
  separateObjects: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const options = getIdmImportExportOptions(entitiesFile, envFile);
    const exportData = await exportConfigEntities(
      {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: options.entitiesToExportOrImport,
      },
      errorHandler
    );
    for (const [id, obj] of Object.entries(exportData.idm)) {
      try {
        if (separateMappings && id === 'sync') {
          writeSyncJsonToDirectory(obj as SyncSkeleton, 'sync', includeMeta);
          continue;
        }
        if (separateObjects && id === 'managed') {
          writeManagedJsonToDirectory(
            obj as ManagedSkeleton,
            'managed',
            includeMeta
          );
          continue;
        }
        saveToFile(
          'idm',
          obj,
          '_id',
          getFilePath(`${id}.idm.json`, true),
          includeMeta
        );
      } catch (error) {
        errors.push(new FrodoError(`Error saving config entity ${id}`, error));
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error saving config entities`, errors);
    }
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
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importConfigEntityByIdFromFile(
  entityId: string,
  file?: string,
  envFile?: string,
  validate: boolean = false
): Promise<boolean> {
  try {
    if (!file) {
      file = getTypedFilename(entityId, 'idm');
    }
    const filePath = getFilePath(file);

    const fileData = fs.readFileSync(
      path.resolve(process.cwd(), filePath),
      'utf8'
    );

    let importData;
    if (entityId === 'sync') {
      const syncData = getLegacyMappingsFromFiles([
        {
          content: fileData,
          path: `${filePath.substring(0, filePath.lastIndexOf('/'))}/sync.idm.json`,
        },
      ]);
      importData = { idm: { sync: syncData } };
    } else if (entityId === 'managed') {
      const managedData = getManagedObjectsFromFiles([
        {
          content: fileData,
          path: `${filePath.substring(0, filePath.lastIndexOf('/'))}/managed.idm.json`,
        },
      ]);
      importData = { idm: { managed: managedData } };
    } else {
      importData = JSON.parse(fileData);
    }

    const options = getIdmImportExportOptions(undefined, envFile);

    await importConfigEntities(
      importData,
      entityId,
      {
        envReplaceParams: options.envReplaceParams,
        entitiesToImport: undefined,
        validate,
      },
      errorHandler
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete IDM config Entity by id
 * @param {String} id saml entityId
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteConfigEntityById(
  entityId: string
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${entityId}...`
  );
  try {
    await deleteConfigEntity(entityId);
    stopProgressIndicator(spinnerId, `Deleted ${entityId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import first IDM configuration object from file.
 * @param {string} file optional file to import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importFirstConfigEntityFromFile(
  file: string,
  envFile?: string,
  validate: boolean = false
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
    const entities = Object.values(
      JSON.parse(fileData).idm
    ) as IdObjectSkeletonInterface[];
    if (entities.length === 0) {
      stopProgressIndicator(indicatorId, `No items to import.`, 'success');
      return true;
    }
    const entityId = entities[0]._id;
    const importData = { idm: { [entityId]: entities[0] } };

    if (entityId === 'sync') {
      importData.idm.sync = getLegacyMappingsFromFiles([
        {
          content: fileData,
          path: `${filePath.substring(0, filePath.lastIndexOf('/'))}/sync.idm.json`,
        },
      ]);
    }
    if (entityId === 'managed') {
      importData.idm.managed = getManagedObjectsFromFiles([
        {
          content: fileData,
          path: `${filePath.substring(0, filePath.lastIndexOf('/'))}/managed.idm.json`,
        },
      ]);
    }

    const options = getIdmImportExportOptions(undefined, envFile);

    await importConfigEntities(
      importData,
      entityId,
      {
        envReplaceParams: options.envReplaceParams,
        entitiesToImport: undefined,
        validate,
      },
      errorHandler
    );
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
 * Import all IDM configuration objects from a single file
 * @param {string} file the file with the configuration objects
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importAllConfigEntitiesFromFile(
  file: string,
  entitiesFile?: string,
  envFile?: string,
  validate: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  let filePath;
  try {
    filePath = getFilePath(file);
    const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config entities from ${filePath}...`
    );
    const options = getIdmImportExportOptions(entitiesFile, envFile);
    await importConfigEntities(
      importData as ConfigEntityExportInterface,
      undefined,
      {
        entitiesToImport: options.entitiesToExportOrImport,
        envReplaceParams: options.envReplaceParams,
        validate,
      },
      errorHandler
    );
    stopProgressIndicator(indicatorId, `Imported config entities`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing config entities from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import an individual managed object from a file
 * @param {string} file the file containing the managed object
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importManagedObjectFromFile(
  file: string,
  envFile?: string,
  validate: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  let filePath: string;
  try {
    filePath = getFilePath(file);
    const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config managed object from ${filePath}...`
    );
    const options = getIdmImportExportOptions(undefined, envFile);
    await importSubConfigEntity('managed', importData, {
      entitiesToImport: options.entitiesToExportOrImport,
      envReplaceParams: options.envReplaceParams,
      validate,
    });

    stopProgressIndicator(
      indicatorId,
      `Imported config managed object`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing config managed object from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import all IDM configuration objects from working directory
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} validate True to validate script hooks. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importAllConfigEntitiesFromFiles(
  entitiesFile?: string,
  envFile?: string,
  validate: boolean = false
): Promise<boolean> {
  let indicatorId: string;
  const baseDirectory = getWorkingDirectory();
  try {
    const importData = await getIdmImportDataFromIdmDirectory(baseDirectory);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing config entities from ${baseDirectory}...`
    );
    const options = getIdmImportExportOptions(entitiesFile, envFile);
    await importConfigEntities(
      importData as ConfigEntityExportInterface,
      undefined,
      {
        entitiesToImport: options.entitiesToExportOrImport,
        envReplaceParams: options.envReplaceParams,
        validate,
      },
      errorHandler
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
 */
export async function getIdmImportDataFromIdmDirectory(
  directory: string
): Promise<ConfigEntityExportInterface> {
  const importData = { idm: {} } as ConfigEntityExportInterface;
  const idmConfigFiles = await readFiles(directory);
  idmConfigFiles.forEach(
    (f) => (f.path = f.path.toLowerCase().replace(/\/$/, ''))
  );
  // Process sync mapping file(s)
  importData.idm.sync = getLegacyMappingsFromFiles(idmConfigFiles);
  importData.idm.managed = getManagedObjectsFromFiles(idmConfigFiles);
  // Process other files
  for (const f of idmConfigFiles.filter(
    (f) =>
      !f.path.endsWith('sync.idm.json') &&
      !f.path.endsWith('managed.idm.json') &&
      f.path.endsWith('.idm.json')
  )) {
    const entities = Object.values(
      JSON.parse(f.content).idm
    ) as unknown as IdObjectSkeletonInterface[];
    for (const entity of entities) {
      importData.idm[entity._id] = entity;
    }
  }
  return importData;
}

/**
 * Helper that returns options for exporting/importing IDM config entities
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {ConfigEntityExportOptions} the config export options
 */
export function getIdmImportExportOptions(
  entitiesFile?: string,
  envFile?: string
): {
  envReplaceParams: string[][];
  entitiesToExportOrImport: string[];
} {
  // read list of entities to export/import
  let entitiesToExportOrImport: string[] = [];
  if (entitiesFile) {
    const data = fs.readFileSync(entitiesFile, 'utf8');
    const entriesData = JSON.parse(data);
    entitiesToExportOrImport = entriesData.idm;
  }

  // read list of configs to parameterize for environment specific values
  const envReplaceParams: string[][] = [];
  if (envFile) {
    const envParams = propertiesReader(envFile);
    envParams.each((key: string, value: string) => {
      envReplaceParams.push([key, value]);
    });
  }

  return {
    entitiesToExportOrImport,
    envReplaceParams,
  };
}

/**
 * Helper that writes mappings in a managed.idm.json config entity to a directory
 * @param managed The managed.idm.json config entity
 * @param directory The directory to save the mappings
 */
export function writeManagedJsonToDirectory(
  managed: ManagedSkeleton,
  directory: string = 'managed',
  includeMeta: boolean = true
) {
  const objectPaths = [];
  for (const object of managed.objects) {
    const fileName = getTypedFilename(object.name, 'managed');
    objectPaths.push(extractDataToFile(object, fileName, directory));
  }
  managed.objects = objectPaths;
  saveToFile(
    'idm',
    managed,
    '_id',
    getFilePath(`${directory}/managed.idm.json`, true),
    includeMeta
  );
}

/**
 * Helper that returns the managed.idm.json object containing all the mappings in it by looking through the files
 *
 * @param files the files to get managed.idm.json object from
 * @returns the managed.idm.json object
 */
export function getManagedObjectsFromFiles(
  files: { path: string; content: string }[]
): ManagedSkeleton {
  const managedFiles = files.filter((f) =>
    f.path.endsWith('/managed.idm.json')
  );
  if (managedFiles.length > 1) {
    throw new FrodoError(
      'Multiple managed.idm.json files found in idm directory'
    );
  }
  const managed = {
    _id: 'managed',
    objects: [],
  };
  if (managedFiles.length === 1) {
    const jsonData = JSON.parse(managedFiles[0].content);
    const managedData = jsonData.managed
      ? jsonData.managed
      : jsonData.idm.managed;
    const managedJsonDir = managedFiles[0].path.substring(
      0,
      managedFiles[0].path.indexOf('/managed.idm.json')
    );
    if (managedData.objects) {
      for (const object of managedData.objects) {
        if (typeof object === 'string') {
          managed.objects.push(getExtractedJsonData(object, managedJsonDir));
        } else {
          managed.objects.push(object);
        }
      }
    }
  }
  return managed;
}
