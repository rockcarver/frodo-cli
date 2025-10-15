import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import {
  MappingExportInterface,
  MappingExportOptions,
  MappingImportOptions,
  MappingSkeleton,
  SyncSkeleton,
} from '@rockcarver/frodo-lib/types/ops/MappingOps';
import fs from 'fs';
import path from 'path';

import { extractDataToFile, getExtractedJsonData } from '../utils/Config';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import {
  findScriptsFromIdm,
  getLastString,
  getObjectByPath,
  getObjectByPathExcludeLast,
  getTopString,
  resolveAllExtractedScriptsForImport,
} from './IdmOps';

const {
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  getFilePath,
  getWorkingDirectory,
  readFiles,
} = frodo.utils;

const {
  createMapping,
  readMapping,
  importFirstMapping,
  readMappings,
  exportMapping,
  exportMappings,
  importMapping,
  importMappings,
  updateMapping,
  isLegacyMapping,
  createMappingExportTemplate,
} = frodo.idm.mapping;

export function extractMappingScripts(
  id: string,
  mapping: any,
  foundResult,
  directory: string
): boolean {
  for (const behavior of foundResult) {
    if (getTopString(behavior.path) === 'policies') {
      const situation = getObjectByPathExcludeLast(
        mapping,
        behavior.path
      ).situation;
      const fileName = `policies.${situation}.${getLastString(behavior.path)}`;
      const objectSource = getObjectByPath(mapping, behavior.path);
      saveMappingScript(
        id,
        objectSource,
        fileName,
        behavior.type,
        behavior.source,
        directory
      );
    } else if (getTopString(behavior.path) === 'properties') {
      let source = getObjectByPathExcludeLast(mapping, behavior.path).source;
      if (!source) source = 'SOURCE';
      let target = getObjectByPathExcludeLast(mapping, behavior.path).target;
      if (!target) target = 'TARGET';
      const fileName = `properties.${source}.${target}.${getLastString(behavior.path)}`;
      const objectSource = getObjectByPath(mapping, behavior.path);
      saveMappingScript(
        id,
        objectSource,
        fileName,
        behavior.type,
        behavior.source,
        directory
      );
    } else {
      const objectSource = getObjectByPath(mapping, behavior.path);
      saveMappingScript(
        id,
        objectSource,
        behavior.path,
        behavior.type,
        behavior.source,
        directory
      );
    }
  }
  return false;
}

function saveMappingScript(
  id: string,
  object: any,
  fileName: string,
  type: string,
  script?: string,
  directory?: string
): boolean {
  try {
    const objectFileName = getTypedFilename(fileName, 'script', type);
    object.source = extractDataToFile(
      script,
      `${id}/${objectFileName}`,
      directory
    );
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
/**
 * List mappings
 * @param {boolean} [long=false] detailed list
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listMappings(long: boolean = false): Promise<boolean> {
  try {
    const mappings = await readMappings();
    if (long) {
      const table = createTable([
        'Id',
        'Display Name',
        'Source',
        'Target',
        'Consent Required',
        'Is Legacy',
      ]);
      for (const mapping of mappings) {
        table.push([
          mapping._id,
          mapping.displayName,
          mapping.source,
          mapping.target,
          mapping.consentRequired ? 'yes'['brightGreen'] : 'no'['brightRed'],
          isLegacyMapping(mapping._id)
            ? 'yes'['brightGreen']
            : 'no'['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      mappings.forEach((mapping) => {
        printMessage(`${mapping._id}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error, `Error listing mappings`);
  }
  return false;
}

/**
 * Export mapping to file
 * @param {string} mappingId mapping id/name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {MappingExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportMappingToFile(
  mappingId: string,
  file: string,
  includeMeta: boolean = true,
  options: MappingExportOptions = {
    deps: true,
    useStringArrays: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportMapping(mappingId, options);
    let fileName = getTypedFilename(
      getMappingNameFromId(mappingId),
      getMappingTypeFromId(mappingId)
    );
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting mapping ${mappingId} to file`);
  }
  return false;
}

/**
 * Export all mappings to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {MappingExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportMappingsToFile(
  file: string,
  includeMeta: boolean = true,
  options: MappingExportOptions = {
    deps: true,
    useStringArrays: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportMappings(options);
    let fileName = getTypedFilename(`allMappings`, 'mapping');
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting mappings to file`);
  }
  return false;
}

/**
 * Export all mappings to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {MappingExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportMappingsToFiles(
  includeMeta: boolean = true,
  extract: boolean,
  options: MappingExportOptions = {
    deps: true,
    useStringArrays: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportMappings(options);
    writeMappingJsonToDirectory(
      exportData.mapping,
      'mapping',
      includeMeta,
      extract
    );

    writeSyncJsonToDirectory(exportData.sync, 'sync', includeMeta, extract);
    return true;
  } catch (error) {
    printError(error, `Error exporting mappings to files`);
  }
  return false;
}

/**
 * Import a mapping from file
 * @param {string} mappingId mapping id/name
 * @param {string} file import file name
 * @param {MappingImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importMappingFromFile(
  mappingId: string,
  file: string,
  options: MappingImportOptions = { deps: true }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing mapping...'
    );
    const importData = getMappingImportDataFromFile(file);
    await importMapping(mappingId, importData, options);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported mapping ${mappingId}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing mapping ${mappingId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import mappings from file
 * @param {String} file file name
 * @param {MappingImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importMappingsFromFile(
  file: string,
  options: MappingImportOptions = { deps: true }
): Promise<boolean> {
  try {
    debugMessage(`importMappingsFromFile: start`);
    debugMessage(`importMappingsFromFile: importing ${file}`);
    const importData = getMappingImportDataFromFile(file);
    await importMappings(importData, options);
    debugMessage(`importMappingsFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing mappings from file`);
  }
  return false;
}

/**
 * Import all mappings from separate files
 * @param {MappingImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importMappingsFromFiles(
  options: MappingImportOptions = { deps: true }
): Promise<boolean> {
  try {
    const workingDirectory = getWorkingDirectory();
    const allMappingFiles = (await readFiles(workingDirectory)).filter(
      (f) =>
        f.path.endsWith('mapping.json') ||
        f.path.endsWith('sync.json') ||
        f.path.endsWith('sync.idm.json') ||
        f.path.endsWith('mapping.idm.json')
    );
    const mappingEntries: [string, MappingSkeleton][] = [];
    for (const f of allMappingFiles.filter((f) =>
      f.path.endsWith('mapping.json')
    )) {
      const parsed = parseAndResolveMappingFile(f);
      mappingEntries.push(...Object.entries(parsed));
    }
    const mapping = Object.fromEntries(mappingEntries) as Record<
      string,
      MappingSkeleton
    >;

    await importMappings(
      {
        mapping,
        sync: getLegacyMappingsFromFiles(allMappingFiles),
      } as MappingExportInterface,
      options
    );

    return true;
  } catch (error) {
    printError(error, `Error importing mappings from files`);
  }
  return false;
}

/**
 * Loads and resolves extracted scripts from a single mapping file.
 * @param file A file object with path and content (from readFiles)
 * @returns Record of mappings keyed by _id
 */
export function parseAndResolveMappingFile(file: {
  path: string;
  content: string;
}): Record<string, MappingSkeleton> {
  const baseDir = path.dirname(file.path);
  const parsed = JSON.parse(file.content);
  const mappings = Object.values(parsed.mapping || {}) as MappingSkeleton[];

  const mappingRecord: Record<string, MappingSkeleton> = {};
  for (const mapping of mappings) {
    resolveAllExtractedScriptsForImport(mapping, baseDir);
    mappingRecord[mapping._id] = mapping;
  }
  return mappingRecord;
}

/**
 * Import first mapping from file
 * @param {string} file import file name
 * @param {MappingImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstMappingFromFile(
  file: string,
  options: MappingImportOptions = { deps: true }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing mapping...'
    );
    const importData = getMappingImportDataFromFile(file);
    updateProgressIndicator(
      indicatorId,
      `Importing first mapping from ${file}...`
    );
    await importFirstMapping(importData, options);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported first mapping from ${file}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing mapping from ${file}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete mapping
 * @param {string} mappingId mapping id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteMapping(mappingId: string): Promise<boolean> {
  try {
    await frodo.idm.mapping.deleteMapping(mappingId);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete mappings
 * @param {string} connectorId limit mappings to connector
 * @param {string} moType limit mappings to managed object type
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteMappings(
  connectorId?: string,
  moType?: string
): Promise<boolean> {
  try {
    await frodo.idm.mapping.deleteMappings(connectorId, moType);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Rename mapping
 * @param {string} mappingId mapping id/name
 * @param {boolean} [legacy=false] true to rename from new to legacy naming scheme, false otherwise. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function renameMapping(
  mappingId: string,
  legacy: boolean = false
): Promise<boolean> {
  const name = getMappingNameFromId(mappingId);
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Renaming mapping ${name}...`
  );
  try {
    const oldId = `${legacy ? 'mapping' : 'sync'}/${name}`;
    const newId = `${legacy ? 'sync' : 'mapping'}/${name}`;
    const oldMapping = await readMapping(oldId);
    oldMapping._id = newId;
    // Not possible to determine where mapping should go in order, so just delete the property so default ordering is used
    delete oldMapping.syncAfter;
    await createMapping(newId, oldMapping);
    await frodo.idm.mapping.deleteMapping(oldId);
    stopProgressIndicator(
      spinnerId,
      `Successfully renamed ${name} to ${
        legacy ? 'legacy' : 'new'
      } naming scheme.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      error.response ? `Error renaming mapping ${name}` : error,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Rename all mappings
 * @param {boolean} [legacy=false] true to rename from new to legacy naming scheme, false otherwise. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function renameMappings(
  legacy: boolean = false
): Promise<boolean> {
  const mappings = await readMappings();
  const spinnerId = createProgressIndicator(
    'determinate',
    mappings.length,
    `Renaming mappings...`
  );
  // Mappings should be ordered correctly by readMappings(), so we update the syncAfter properties to preserve order.
  const syncAfter = [];
  for (const mapping of mappings) {
    // slice() makes a copy of the array
    mapping.syncAfter = syncAfter.slice();
    syncAfter.push(mapping.name);
    const name = mapping.name;
    try {
      updateProgressIndicator(spinnerId, `Renaming mapping ${name}...`);
      const oldId = `${legacy ? 'mapping' : 'sync'}/${name}`;
      const newId = `${legacy ? 'sync' : 'mapping'}/${name}`;
      let oldMapping;
      try {
        oldMapping = await readMapping(oldId);
        oldMapping.syncAfter = mapping.syncAfter;
      } catch (error) {
        // Old mapping doesn't exist, meaning the mapping is already new, so just update it with the new syncAfter property
        await updateMapping(newId, mapping);
        continue;
      }
      await createMapping(newId, oldMapping);
      await frodo.idm.mapping.deleteMapping(oldId);
    } catch (error) {
      stopProgressIndicator(
        spinnerId,
        error.response ? `Error renaming mapping ${name}` : error,
        'fail'
      );
      printError(error);
      return false;
    }
  }
  stopProgressIndicator(
    spinnerId,
    `Successfully renamed ${mappings.length} mappings to ${
      legacy ? 'legacy' : 'new'
    } naming scheme.`,
    'success'
  );
  return true;
}

/**
 * Helper that writes mappings in a sync.idm.json config entity to a directory
 * @param sync The sync.idm.json config entity
 * @param directory The directory to save the mappings
 */
export function writeSyncJsonToDirectory(
  sync: SyncSkeleton,
  directory: string = 'sync',
  includeMeta: boolean = true,
  extract: boolean
) {
  const mappingPaths = [];
  for (const mapping of sync.mappings) {
    if (extract) {
      const result = findScriptsFromIdm(mapping);
      if (result.length !== 0) {
        const dirName = getTypedFilename(mapping.name, 'sync', 'scripts');
        //getFilePath(`${directory}/${dirName}`, true);
        extractMappingScripts(dirName, mapping, result, `${directory}/`);
      }
    }
    const fileName = getTypedFilename(mapping.name, 'sync');
    mappingPaths.push(extractDataToFile(mapping, fileName, directory));
  }
  sync.mappings = mappingPaths;
  saveToFile(
    'idm',
    sync,
    '_id',
    getFilePath(`${directory}/sync.idm.json`, true),
    includeMeta
  );
}

export function writeMappingJsonToDirectory(
  mappings: Record<string, MappingSkeleton>,
  directory: string = 'mapping',
  includeMeta: boolean,
  extract: boolean
) {
  for (const mapping of Object.values(mappings)) {
    if (extract) {
      const result = findScriptsFromIdm(mapping);
      if (result.length !== 0) {
        const dirName = getTypedFilename(
          mapping.name,
          getMappingTypeFromId(mapping._id),
          'scripts'
        );
        extractMappingScripts(dirName, mapping, result, `${directory}/`);
      }
    }
    const fileName = getTypedFilename(
      mapping.name,
      getMappingTypeFromId(mapping._id)
    );
    saveToFile(
      getMappingTypeFromId(mapping._id),
      mapping,
      '_id',
      getFilePath(`${directory}/${fileName}`, true),
      includeMeta
    );
  }
}

/**
 * Helper that returns the sync.idm.json object containing all the mappings in it by looking through the files
 *
 * @param files the files to get sync.idm.json object from
 * @returns the sync.idm.json object
 */
export function getLegacyMappingsFromFiles(
  files: { path: string; content: string }[]
): SyncSkeleton {
  const syncFiles = files.filter((f) => f.path.endsWith('/sync.idm.json'));
  if (syncFiles.length > 1) {
    throw new FrodoError('Multiple sync.idm.json files found in idm directory');
  }
  const sync = {
    _id: 'sync',
    mappings: [],
  };

  if (syncFiles.length === 1) {
    const file = syncFiles[0];
    const jsonData = JSON.parse(file.content);
    const syncData = jsonData.sync ?? jsonData.idm?.sync;
    const syncJsonDir = path.dirname(file.path);
    if (syncData?.mappings) {
      for (const mapping of syncData.mappings) {
        let resolvedMapping: any;
        if (typeof mapping === 'string') {
          resolvedMapping = getExtractedJsonData(mapping, syncJsonDir);
        } else {
          resolvedMapping = mapping;
        }
        resolveAllExtractedScriptsForImport(resolvedMapping, syncJsonDir);
        sync.mappings.push(resolvedMapping);
      }
    }
  }

  return sync;
}

/**
 * Helper that returns the sync.idm.json object containing all the mappings in it by looking through the files
 *
 * @param files the files to get sync.idm.json object from
 * @returns the sync.idm.json object
 */
export function getNewMappingsFromFiles(
  mappingFiles: { path: string; content: string }[]
): Record<string, MappingSkeleton> {
  const mappingEntries: [string, MappingSkeleton][] = [];
  for (const f of mappingFiles.filter((f) => f.path.endsWith('mapping.json'))) {
    const parsed = parseAndResolveMappingFile(f);
    mappingEntries.push(...Object.entries(parsed));
  }
  const mapping = Object.fromEntries(mappingEntries) as Record<
    string,
    MappingSkeleton
  >;
  return mapping;
}

/**
 * Helper that gets a mapping's type (either 'sync' or 'mapping') from it's id
 * @param {string} mappingId the mapping id
 * @returns {string} the mapping type
 */
export function getMappingTypeFromId(mappingId: string): string {
  return isLegacyMapping(mappingId) ? 'sync' : 'mapping';
}

/**
 * Helper that returns the mapping name given the mapping's id.
 * @param {string} mappingId the mapping id
 * @returns {string} the mapping name
 */
export function getMappingNameFromId(mappingId: string): string | undefined {
  if (!mappingId) {
    return undefined;
  }
  return mappingId.startsWith('mapping/') || mappingId.startsWith('sync/')
    ? mappingId.substring(mappingId.indexOf('/') + 1)
    : mappingId;
}

function getMappingImportDataFromFile(file: string): MappingExportInterface {
  const filePath = getFilePath(file);
  const data = fs.readFileSync(filePath, 'utf8');
  let importData = JSON.parse(data);
  const baseDir = path.dirname(filePath);
  // If importing from file not in export format, put it into export format
  if (!importData.sync && !importData.mapping) {
    const mapping = importData;
    importData = createMappingExportTemplate();

    if (mapping.idm) {
      importData.sync = getLegacyMappingsFromFiles([
        {
          path: `${filePath.substring(0, filePath.lastIndexOf('/'))}/sync.idm.json`,
          content: data,
        },
      ]);
    } else if (isLegacyMapping(mapping._id)) {
      resolveAllExtractedScriptsForImport(mapping, baseDir);
      importData.sync.mappings.push(mapping);
    } else {
      resolveAllExtractedScriptsForImport(mapping, baseDir);
      importData.mapping[mapping._id] = mapping;
    }
  } else {
    if (importData.mapping) {
      Object.values(importData.mapping).forEach((m) => {
        resolveAllExtractedScriptsForImport(m, baseDir);
      });
    }
  }
  if (!importData.sync && importData.mapping) {
    importData.sync = { id: 'sync', mappings: [] };
  } else if (importData.sync && !importData.mapping) {
    importData.mapping = {};
  }

  return importData;
}
