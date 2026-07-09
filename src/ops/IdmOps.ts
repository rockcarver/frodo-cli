import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { type ConfigEntityExportInterface } from '@rockcarver/frodo-lib/types/ops/IdmConfigOps';
import {
  MappingSkeleton,
  SyncSkeleton,
} from '@rockcarver/frodo-lib/types/ops/MappingOps';
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
  getLegacyMappingsFromFiles,
  writeMappingJsonToDirectory,
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

type MatchResult = { path: string; source: string; type: string };

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
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportConfigEntityToFile(
  id: string,
  file?: string,
  envFile?: string,
  includeMeta: boolean = true,
  extract: boolean = false
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = await exportConfigEntity(id, {
      envReplaceParams: options.envReplaceParams,
      entitiesToExport: undefined,
    });
    if (!extract) {
      const fileName = file || getTypedFilename(`${id}`, 'idm');
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
      return true;
    }
    if (id === 'sync') {
      writeSyncJsonToDirectory(
        exportData.idm[id] as SyncSkeleton,
        'sync',
        includeMeta,
        extract
      );
      return true;
    }
    if (id === 'managed') {
      writeManagedJsonToDirectory(
        exportData.idm[id] as ManagedSkeleton,
        'managed',
        includeMeta,
        extract
      );
      return true;
    }
    writeIdmObjectToDirectory(exportData.idm[id], '.', includeMeta, extract);
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
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportManagedObjectToFile(
  name: string,
  file?: string,
  envFile?: string,
  extract: boolean = false
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = (await readSubConfigEntity('managed', name, {
      envReplaceParams: options.envReplaceParams,
      entitiesToExport: undefined,
    })) as ObjectSkeleton;
    if (extract && extractManagedObjectScriptsToDirectory(exportData)) {
      const fileName = getTypedFilename(name, 'managed');
      saveJsonToFile(
        exportData,
        getFilePath(`${name}/${fileName}`, true),
        false
      );
      return true;
    }
    const fileName = file || getTypedFilename(name, 'managed');
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
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportAllConfigEntitiesToFiles(
  entitiesFile?: string,
  envFile?: string,
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
      if (!obj) continue;
      try {
        if (!extract) {
          saveToFile(
            'idm',
            obj,
            '_id',
            getFilePath(`${id}.idm.json`, true),
            includeMeta
          );
          continue;
        }
        if (id === 'sync') {
          writeSyncJsonToDirectory(
            obj as SyncSkeleton,
            'sync',
            includeMeta,
            extract
          );
          continue;
        }
        if (id === 'managed') {
          writeManagedJsonToDirectory(
            obj as ManagedSkeleton,
            'managed',
            includeMeta,
            extract
          );
          continue;
        }
        if (id.startsWith('mapping/')) {
          writeMappingJsonToDirectory(
            obj as MappingSkeleton,
            'mapping',
            includeMeta,
            extract
          );
          continue;
        }
        writeIdmObjectToDirectory(obj, '.', includeMeta, extract);
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
      .filter(([id]) => id !== 'meta')
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
    const baseDir = path.dirname(filePath);
    const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    resolveAllExtractedScriptsForImport(importData, baseDir);
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

/**
 * Recursive helper that reads in extracted scripts from IDM exports
 * @param {any} obj The object to read scripts in for
 * @param {string} baseDir The base directory where the extracted files are stored relative to
 * @param {WeakSet} visited The visited objects
 */
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
 * Helper that writes objects in the managed IDM config entity to a directory
 * @param {ManagedSkeleton} managed The managed IDM config entity
 * @param {string} directory The directory to save the entity to within the base directory
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 */
export function writeManagedJsonToDirectory(
  managed: ManagedSkeleton,
  directory: string = 'managed',
  includeMeta: boolean = true,
  extract: boolean = false
) {
  const objectPaths = [];
  for (const object of managed.objects) {
    const fileName = getTypedFilename(object.name, 'managed');
    if (
      extract &&
      extractManagedObjectScriptsToDirectory(
        object,
        `${directory}/${object.name}`
      )
    ) {
      objectPaths.push(
        extractDataToFile(object, `${object.name}/${fileName}`, directory)
      );
    } else {
      objectPaths.push(extractDataToFile(object, fileName, directory));
    }
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
 * Helper that extracts scripts from a managed object
 * @param {ObjectSkeleton} object The managed object
 * @param {string} directory The directory to extract scripts to within the base directory
 * @returns {boolean} true if at least one script got extracted, false otherwise
 */
export function extractManagedObjectScriptsToDirectory(
  object: ObjectSkeleton,
  directory: string = object.name
): boolean {
  const scripts = findIdmScripts(object);
  if (!scripts.length) return false;
  for (const script of scripts) {
    const managedObjectPath = script.path
      .replace('schema.', '')
      .replaceAll('properties.', '');
    const sourceObj = getObjectByPath(object, script.path);
    const objectFileName = `${managedObjectPath}.${script.type}`;
    sourceObj.source = extractDataToFile(
      script.source,
      objectFileName,
      directory
    );
  }
  return true;
}

/**
 * Helper that writes an IDM config entity to a directory
 * @param {IdObjectSkeletonInterface} object The IDM config entity
 * @param {string} directory The directory to save the entity to within the base directory
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract true to extract idm scripts, false otherwise. Default: false
 */
export function writeIdmObjectToDirectory(
  object: IdObjectSkeletonInterface,
  directory: string = '.',
  includeMeta: boolean = true,
  extract: boolean = false
) {
  let filePath;
  if (extract && extractIdmScriptsToDirectory(object, directory)) {
    filePath = getFilePath(
      `${directory}/${object._id}/${getTypedFilename(object._id.split('/').pop(), 'idm')}`,
      true
    );
  } else {
    filePath = getFilePath(`${directory}/${object._id}.idm.json`, true);
  }
  const directoryPath = path.dirname(filePath);
  if (!fs.existsSync(directoryPath))
    fs.mkdirSync(directoryPath, { recursive: true });
  saveToFile('idm', object, '_id', filePath, includeMeta);
}

/**
 * Helper that extracts scripts from an IDM entity
 * @param {ObjectSkeleton} object The IDM entity
 * @param {string} directory The directory to extract scripts to within the base directory
 * @returns {boolean} true if at least one script got extracted, false otherwise
 */
export function extractIdmScriptsToDirectory(
  object: IdObjectSkeletonInterface,
  directory: string
): boolean {
  const scripts = findIdmScripts(object);
  if (!scripts.length) return false;
  for (const script of scripts) {
    let objectFileName;
    let sourceObject;
    if (!script.path) {
      objectFileName = `${object._id.split('/').pop()}.${script.type}`;
      sourceObject = object;
    } else {
      objectFileName = `${script.path}.${script.type}`;
      sourceObject = getObjectByPath(object, script.path);
    }
    sourceObject.source = extractDataToFile(
      script.source,
      objectFileName,
      `${directory}/${object._id}`
    );
  }
  return true;
}

/**
 * Helper that reads the managed IDM config entity from files
 * @param {{ path: string; content: string }[]} files the files to read the managed IDM config entity object from
 * @returns {ManagedSkeleton} the managed IDM config entity
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
        resolveAllExtractedScriptsForImport(
          resolvedObject,
          `${managedJsonDir}/${resolvedObject.name}`
        );
        managed.objects.push(resolvedObject);
      }
    }
  }
  return managed;
}

/**
 * Helper that returns the first object name in a path
 * @param {string} path The object path
 * @returns {string} The first name in the path
 */
export function getTopString(path: string): string {
  return path.split('.')[0];
}

/**
 * Helper that returns the first object in a path
 * @param {string} path The object path
 * @param {any} obj The parent object
 * @returns {any} The first object in the path
 */
export function getTopObject(path: string, obj: any): any {
  return obj[getTopString(path)];
}

/**
 * Helper that returns the last object name in a path
 * @param {string} path The object path
 * @returns {string} The last name in the path
 */
export function getLastString(path: string) {
  const parts = path.split('.');
  return parts[parts.length - 1];
}

/**
 * Helper that returns the object at the specified path
 * @param {string} path The object path
 * @param {any} obj The parent object
 * @returns {any} The object at the path
 */
export function getObjectByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => {
    const realKey = /^\d+$/.test(key) ? Number(key) : key;
    return acc?.[realKey];
  }, obj);
}

/**
 * Helper that returns the object at the second to last of the specified path
 * @param {string} path The object path
 * @param {any} obj The parent object
 * @returns {any} The object at the second to last of the path
 */
export function getObjectByPathExcludeLast(obj: any, path: string): any {
  const keys = path.split('.');
  keys.pop();
  return getObjectByPath(obj, keys.join('.'));
}

/**
 * Recursive helper that finds all IDM scripts within an object
 * @param {any} obj The object
 * @param {string} currentPath The current path to the object
 * @param {MatchResult[]} result the found IDM scripts so far
 * @returns {MatchResult[]} the found IDM scripts
 */
export function findIdmScripts(
  obj: any,
  currentPath: string = '',
  result: MatchResult[] = []
): MatchResult[] {
  if (typeof obj !== 'object' || obj === null) return result;
  if ('source' in obj && 'type' in obj) {
    const normalizedSource = Array.isArray(obj.source)
      ? obj.source.join('\n')
      : obj.source;
    const scriptType =
      obj.type === 'text/javascript'
        ? 'js'
        : obj.type === 'groovy'
          ? 'groovy'
          : 'unknown';
    result.push({
      path: currentPath,
      source: normalizedSource,
      type: scriptType,
    });
  }

  for (const key of Object.keys(obj)) {
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    findIdmScripts(obj[key], newPath, result);
  }

  return result;
}
