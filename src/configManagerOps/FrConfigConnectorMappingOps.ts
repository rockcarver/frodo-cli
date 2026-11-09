import fs from 'fs';
import path from 'path';
import { frodo } from '@rockcarver/frodo-lib';
import {
  objectNameInFile,
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { isNotFoundError } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';
import type { ApplicationLayoutDecision } from '../utils/TreeLayout';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { readConfigEntity, importConfigEntities, importSubConfigEntity } =
  frodo.idm.config;

/**
 * Write one mapping in fr-config-manager format: the script sources of the mapping
 * become files next to it (`<name>.<key>.js`, referenced by `file`) and the rest is
 * `<name>.json`, all in one directory. Shared by `pull connector-mappings` and by the
 * commands that pull a mapping because an application owns it. The mapping object is
 * changed: its script sources are replaced by the file references.
 * @param {any} mapping the mapping, with its `name`
 * @param {string} mappingPath the directory (relative to the working directory) that holds the files of this mapping
 * @throws {FrodoError} if a file cannot be written
 */
export function exportMappingToDirectory(
  mapping: any,
  mappingPath: string
): void {
  Object.entries(mapping).forEach(([key, value]: [string, any]) => {
    if (
      value &&
      typeof value === 'object' &&
      value.type === 'text/javascript' &&
      value.source
    ) {
      const scriptText = Array.isArray(value.source)
        ? value.source.join('\n')
        : value.source;

      const scriptFilename = `${mapping.name}.${key}.js`;
      (value as any).file = scriptFilename; // Replace source code with file reference
      extractFrConfigDataToFile(scriptText, scriptFilename, mappingPath);

      delete value.source;
    }
  });

  const fileName = `${mappingPath}/${mapping.name}.json`;
  saveJsonToFile(mapping, getFilePath(fileName, true), false, true);
}

/**
 * Read the sync configuration, which holds the mappings. A tenant that never had a mapping has no
 * such configuration at all and answers 404: that is no mappings, not a failure. Every other error,
 * a refused request included, is thrown.
 * @returns {Promise<any | undefined>} the sync configuration, or undefined when the tenant has none
 */
async function readSyncConfig(): Promise<any | undefined> {
  try {
    return await readConfigEntity('sync');
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    verboseMessage('The tenant has no sync configuration.');
    return undefined;
  }
}

/**
 * Export all mappings to separate files in fr-config-manager format
 * Every mapping is one operation of an {@link OperationRun}: a mapping whose files cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the sync configuration, or a named mapping that does not exist, ends the command whatever
 * `--allow-failures` says.
 * In a tree that uses the application layout (decision record 0042) a mapping that an
 * application owns is not exported here: `pull applications` writes it into the folder of the
 * application. It is named and skipped, which is not a failure. Mappings belong to the tenant,
 * not to a realm, so the applications of every realm are asked; if they cannot be read the
 * command fails.
 * @param {string} name connector mapping name
 * @param {boolean} allowFailures true to report mappings that could not be exported but still succeed. Default: false
 * @param {ApplicationLayoutDecision} layout The layout of the tree, when `pull all` has decided it before its first step; default: read from the marker of the tree
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportMappings(
  name?: string,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision
): Promise<boolean> {
  const run = new OperationRun({ unit: 'mapping', allowFailures });
  try {
    const owned = skipsOwnedObjects(layout) ? new OwnedObjects() : undefined;
    if (owned) await owned.loadAllRealms();
    const exportData = await readSyncConfig();
    const fileDir = `sync/mappings`;
    const selected = Object.values(exportData?.mappings ?? {}).filter(
      (mapping: any) => !name || name === mapping.name
    );
    if (selected.length === 0) {
      if (name) {
        printMessage(`Mapping ${name} not found.`, 'error');
        return false;
      }
      printMessage('No connector mappings found to export.', 'info');
      return true;
    }
    for (const mapping of selected as any[]) {
      const owners = owned
        ? owned.ownersInAnyRealm('mapping', mapping.name)
        : [];
      if (owners.length > 0) {
        printMessage(
          ownedObjectMessage('mapping', mapping.name, owners, true),
          'info'
        );
        continue;
      }
      await run.run(mapping.name, () => {
        exportMappingToDirectory(mapping, `${fileDir}/${mapping.name}`);
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting mappings to files`);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Helper that recursively reads in extracted files and stores them back in the connector
 * @param {Record<string, any>} obj The connector configuration
 * @param {string} connectorMappingDirectory The directory where the connector resides
 */
function getExtractedFiles(obj: any, connectorMappingDirectory: string): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value?.type === 'text/javascript' && value.file) {
      const scriptPath = path.join(connectorMappingDirectory, value.file);
      if (fs.existsSync(scriptPath)) {
        value.source = fs.readFileSync(scriptPath, { encoding: 'utf-8' });
        delete value.file;
      }
    } else if (typeof value === 'object') {
      getExtractedFiles(value, connectorMappingDirectory);
    }
  }
}

/**
 * Helper that returns the import data for a connector mapping given the file where it is saved
 * @param {string} file The file where the connector mapping is saved
 * @returns {object} The connector mapping data from the file, including data from any extracted files
 */
function getConnectorMappingImportData(file: string): object {
  const importData = readJsonFile(file);
  getExtractedFiles(importData, path.dirname(file));
  return importData;
}

/**
 * Import all mappings in fr-config-manager format
 * In a tree that uses the application layout (decision record 0042) a mapping that an application
 * owns is not imported here: `push applications` imports it from the folder of the application. A
 * mapping that an application folder of any realm owns is named and skipped, which is not a
 * failure, and no file of the tree is changed. Mappings belong to the tenant, not to a realm, so the
 * application folders of every realm are asked; if one cannot be read the command fails and nothing
 * is imported. Such a tree does not hold the mappings that applications own, so pushing all mappings
 * adds them to the sync configuration of the tenant, one by one, instead of replacing it: replacing
 * it would delete the mappings of the applications.
 * @param {string} name optional connector name to import
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportMappings(
  name?: string
): Promise<boolean> {
  try {
    const owned = skipsOwnedObjects() ? new OwnedObjects() : undefined;
    owned?.loadAllRealmsOfTree(getWorkingDirectory());
    const skipIfOwned = (folderName: string, file: string): boolean => {
      if (!owned) return false;
      const mappingName = objectNameInFile(
        file,
        (content) => content?.name,
        folderName
      );
      const owners = owned.ownersInAnyRealm('mapping', mappingName);
      if (owners.length === 0) return false;
      printMessage(
        ownedObjectMessage('mapping', mappingName, owners, true, 'pushed'),
        'info'
      );
      return true;
    };
    if (name) {
      const jsonFilePath = getFilePath(`sync/mappings/${name}/${name}.json`);
      if (skipIfOwned(name, jsonFilePath)) return true;
      const importData = getConnectorMappingImportData(jsonFilePath) as any;
      await importSubConfigEntity('sync', importData);
      return true;
    } else {
      const mappingDir = getFilePath('sync/mappings');
      const mappingFiles = fs.readdirSync(mappingDir);
      const importMappingData = {
        idm: { sync: { _id: 'sync', mappings: [] as any } },
      };
      for (const mappingFile of mappingFiles) {
        const jsonFilePath = getFilePath(
          `sync/mappings/${mappingFile}/${mappingFile}.json`
        );
        if (skipIfOwned(mappingFile, jsonFilePath)) continue;
        const importData = getConnectorMappingImportData(jsonFilePath) as any;
        if (importData.file) {
          const scriptPath = getFilePath(
            `sync/mappings/${mappingFile}/${importData.file}`
          );
          importData.source = fs.readFileSync(scriptPath, 'utf8');
          delete importData.file;
        }
        importMappingData.idm.sync.mappings.push(importData);
      }
      if (owned) {
        for (const mapping of importMappingData.idm.sync.mappings) {
          await importSubConfigEntity('sync', mapping);
        }
      } else {
        await importConfigEntities(importMappingData);
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error importing mappings from files`);
  }
  return false;
}

/**
 * Read one mapping from its directory, `<dir>/<name>.json` with the script
 * sources that it refers to put back in (the format `pull connector-mappings`
 * and `pull applications` write). Shared by the commands that push a mapping
 * because an application owns it.
 * @param {string} mappingPath the directory of the mapping (relative to the working directory)
 * @param {string} name the name of the mapping
 * @returns {any} the mapping, with the script sources inline
 * @throws {FrodoError} if a file cannot be read
 */
export function readMappingFromDirectory(
  mappingPath: string,
  name: string
): any {
  return getConnectorMappingImportData(
    getFilePath(`${mappingPath}/${name}.json`)
  );
}
