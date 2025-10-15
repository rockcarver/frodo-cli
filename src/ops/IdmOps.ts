import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { type ConfigEntityExportInterface } from '@rockcarver/frodo-lib/types/ops/IdmConfigOps';
import { SyncSkeleton } from '@rockcarver/frodo-lib/types/ops/MappingOps';
import fs from 'fs';
import path from 'path';
import propertiesReader from 'properties-reader';

import {
  extractDataToFile,
  getExtractedData,
  getExtractedJsonData,
} from '../utils/Config';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import {
  extractMappingScripts,
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
 * List all Idm configuration objects
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
  includeMeta: boolean = true,
  extract: boolean = false
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = await exportConfigEntity(id, {
      envReplaceParams: options.envReplaceParams,
      entitiesToExport: undefined,
    });
    if ((separateMappings || extract) && id === 'sync') {
      writeSyncJsonToDirectory(
        exportData.idm[id] as SyncSkeleton,
        file,
        includeMeta,
        extract
      );
      return true;
    }
    if ((separateObjects || extract) && id === 'managed') {
      writeManagedJsonToDirectory(
        exportData.idm[id] as ManagedSkeleton,
        file,
        includeMeta,
        extract
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
  includeMeta: boolean = true,
  extract: boolean = false
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
      if (obj) {
        try {
          if ((separateMappings || extract) && id === 'sync') {
            writeSyncJsonToDirectory(
              obj as SyncSkeleton,
              'sync',
              includeMeta,
              extract
            );
            continue;
          }
          if ((separateObjects || extract) && id === 'managed') {
            writeManagedJsonToDirectory(
              obj as ManagedSkeleton,
              'managed',
              includeMeta,
              extract
            );
            continue;
          }
          if (extract && (id !== 'sync' || 'managed')) {
            if (id.includes('endpoint/')) {
              const result = findScriptsFromIdm(obj);
              if (result.length !== 0) {
                const endpointId = id.replace('endpoint/', '');
                extractIdmEndpointScript(endpointId, obj, result, `endpoint/`);
              }
            } else if (id.includes('schedule/')) {
              const result = findScriptsFromIdm(obj);
              if (result.length !== 0) {
                const scheduleId = id.replace('schedule/', '');
                extractIdmScriptToSameLevel(
                  scheduleId,
                  obj,
                  result,
                  `schedule/`
                );
              }
            } else if (id.includes('mapping/')) {
              const result = findScriptsFromIdm(obj);
              if (result.length !== 0) {
                const mappingId = id.replace('mapping/', '');
                extractMappingScripts(
                  `${mappingId}.mapping.script`,
                  obj,
                  result,
                  `mapping/`
                );
              }
            } else {
              const result = findScriptsFromIdm(obj);
              if (result.length !== 0) {
                extractIdmScriptsToFolder(`${id}.idm.scripts`, obj, result);
              }
            }
          }
          saveToFile(
            'idm',
            obj,
            '_id',
            getFilePath(`${id}.idm.json`, true),
            includeMeta
          );
        } catch (error) {
          errors.push(
            new FrodoError(`Error saving config entity ${id}`, error)
          );
        }
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
      const entity = importData.idm?.[entityId];
      if (entity) {
        const baseDir = path.dirname(filePath);
        resolveAllExtractedScriptsForImport(entity, baseDir);
        importData.idm[entityId] = entity;
      }
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

    const parsed = JSON.parse(fileData);
    const allEntities = Object.entries(parsed.idm)
      .filter(([id]) => id !== 'meta') // ✅ "meta" 필터링
      .map(([, val]) => val) as IdObjectSkeletonInterface[];

    if (allEntities.length === 0) {
      stopProgressIndicator(indicatorId, `No items to import.`, 'success');
      return true;
    }

    const entity = allEntities[0];
    const entityId = entity._id;

    const baseDir = path.dirname(filePath);
    resolveAllExtractedScriptsForImport(entity, baseDir);

    const importData: ConfigEntityExportInterface = {
      idm: { [entityId]: entity },
    };

    if (entityId === 'sync') {
      importData.idm.sync = getLegacyMappingsFromFiles([
        {
          content: fileData,
          path: `${baseDir}/sync.idm.json`,
        },
      ]);
    }

    if (entityId === 'managed') {
      importData.idm.managed = getManagedObjectsFromFiles([
        {
          content: fileData,
          path: `${baseDir}/managed.idm.json`,
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
    const fileData = fs.readFileSync(filePath, 'utf8');
    const importData = JSON.parse(fileData);
    const baseDir = path.dirname(filePath);
    resolveAllExtractedScriptsForImport(importData, baseDir);

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
 * Import all Idm configuration objects from working directory
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
  idmConfigFiles.forEach((f) => (f.path = f.path.replace(/\/$/, '')));
  // Process sync mapping file(s)
  const sync = getLegacyMappingsFromFiles(idmConfigFiles);
  if (sync.mappings && sync.mappings.length > 0) {
    importData.idm.sync = sync;
  }
  const managed = getManagedObjectsFromFiles(idmConfigFiles);
  if (managed.objects && managed.objects.length > 0) {
    importData.idm.managed = managed;
  }

  // Process other files
  for (const f of idmConfigFiles.filter(
    (f) =>
      !f.path.endsWith('sync.idm.json') &&
      !f.path.endsWith('managed.idm.json') &&
      f.path.endsWith('.idm.json')
  )) {
    const baseDirOfThisJson = path.dirname(f.path);
    const entities = Object.values(
      JSON.parse(f.content).idm
    ) as unknown as IdObjectSkeletonInterface[];

    for (const entity of entities) {
      resolveAllExtractedScriptsForImport(entity, baseDirOfThisJson);
      importData.idm[entity._id] = entity;
    }
  }
  return importData;
}

export function resolveAllExtractedScriptsForImport(
  obj: any,
  baseDir: string,
  visited = new WeakSet()
) {
  if (obj === null || typeof obj !== 'object') {
    return;
  }
  if (visited.has(obj)) return;
  visited.add(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      resolveAllExtractedScriptsForImport(item, baseDir, visited);
    }
    return;
  }
  if (typeof obj.source === 'string' && obj.source.startsWith('file://')) {
    const fileContent = getExtractedData(obj.source, baseDir);
    if (fileContent !== null) {
      obj.source = fileContent;
    }
  }
  for (const key of Object.keys(obj)) {
    resolveAllExtractedScriptsForImport(obj[key], baseDir, visited);
  }
}

/**
 * Helper that returns options for exporting/importing IDM config entities
 * @param {string} entitiesFile JSON file that specifies the config entities to export/import
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {ConfigEntityExportOptions} the config export options
 */
function getIdmImportExportOptions(
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
  includeMeta: boolean = true,
  extract: boolean
) {
  const objectPaths = [];
  for (const object of managed.objects) {
    if (extract) {
      const result = findScriptsFromIdm(object);
      if (result.length !== 0) {
        const dirName = getTypedFilename(object.name, 'managed', 'scripts');
        // getFilePath(`${directory}/${dirName}`, true);
        extractIdmScriptsToFolder(dirName, object, result, `${directory}/`);
        //dirname= oobject name +
      }
    }
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

export function extractIdmScriptsToFolder(
  id: string,
  object: any,
  foundResults,
  directory?: string
): boolean {
  for (const result of foundResults) {
    const sourceObj = getObjectByPath(object, result.path);
    const objectFileName = getTypedFilename(result.path, 'script', result.type);
    sourceObj.source = extractDataToFile(
      result.source,
      `${id}/${objectFileName}`,
      directory
    );
  }
  return false;
}

export function extractIdmScriptToSameLevel(
  id: string,
  object: any,
  foundResults: any,
  directory?: string
): boolean {
  for (const result of foundResults) {
    const sourceObj = getObjectByPath(object, result.path);
    const objectFileName = getTypedFilename(
      `${id}.${result.path}`,
      'script',
      result.type
    );
    sourceObj.source = extractDataToFile(
      result.source,
      objectFileName,
      directory
    );
  }
  return false;
}

export function extractIdmEndpointScript(
  id: string,
  object: any,
  foundResults: any,
  directory?: string
): boolean {
  for (const result of foundResults) {
    const objectFileName = getTypedFilename(id, 'script', result.type);
    object.source = extractDataToFile(
      result.source,
      objectFileName,
      directory
    );
  }
  return false;
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
  const managed: ManagedSkeleton = {
    _id: 'managed',
    objects: [],
  };
  if (managedFiles.length === 1) {
    const jsonData = JSON.parse(managedFiles[0].content);
    const managedData = jsonData.managed ?? jsonData.idm?.managed;
    const managedJsonDir = managedFiles[0].path.substring(
      0,
      managedFiles[0].path.indexOf('/managed.idm.json')
    );
    if (managedData?.objects) {
      for (const object of managedData.objects) {
        let resolvedObject: any;
        if (typeof object === 'string') {
          resolvedObject = getExtractedJsonData(object, managedJsonDir);
        } else {
          resolvedObject = object;
        }
        resolveAllExtractedScriptsForImport(resolvedObject, managedJsonDir);
        managed.objects.push(resolvedObject);
      }
    }
  }
  return managed;
}

type MatchResult = { path: string; source: string; type: string };

export function findScriptsFromIdm(
  obj: any,
  currentPath = '',
  result: MatchResult[] = []
): MatchResult[] {
  if (
    typeof obj === 'object' &&
    obj !== null &&
    'source' in obj &&
    'type' in obj &&
    (obj.type === 'text/javascript' || obj.type === 'groovy')
  ) {
    const rawSource = obj.source;
    const normalizedSource = Array.isArray(rawSource)
      ? rawSource.join('\n')
      : rawSource;
    const scriptType =
      obj.type === 'text/javascript'
        ? 'js'
        : obj.type === 'groovy'
          ? 'groovy'
          : '';
    result.push({
      path: currentPath,
      source: normalizedSource,
      type: scriptType,
    });
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      findScriptsFromIdm(obj[key], newPath, result);
    }
  }

  return result;
}
export function getTopObject(path, obj) {
  const parts = path.split('.');
  return obj[parts[0]];
}
export function getTopString(path) {
  const parts = path.split('.');
  return parts[0];
}

export function getLastString(path) {
  const parts = path.split('.');
  return parts[parts.length - 1];
}
export function getObjectByPath(obj, path) {
  return path.split('.').reduce((acc, key) => {
    const realKey = /^\d+$/.test(key) ? Number(key) : key;
    return acc?.[realKey];
  }, obj);
}

export function getObjectByPathExcludeLast(obj: any, path: string): any {
  const keys = path.split('.');
  keys.pop();
  return keys.reduce((acc, key) => {
    const realKey = /^\d+$/.test(key) ? Number(key) : key;
    return acc?.[realKey];
  }, obj);
}
