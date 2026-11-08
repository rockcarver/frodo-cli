import fs from 'fs';
import path from 'path';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readConfigEntity, importConfigEntities, importSubConfigEntity } =
  frodo.idm.config;

/**
 * Export all mappings to separate files in fr-config-manager format
 * Every mapping is one operation of an {@link OperationRun}: a mapping whose files cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the sync configuration, or a named mapping that does not exist, ends the command whatever
 * `--allow-failures` says.
 * @param {string} name connector mapping name
 * @param {boolean} allowFailures true to report mappings that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportMappings(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'mapping', allowFailures });
  try {
    const exportData = await readConfigEntity('sync');
    const fileDir = `sync/mappings`;
    const selected = Object.values(exportData.mappings ?? {}).filter(
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
      await run.run(mapping.name, () => {
        const mappingPath = `${fileDir}/${mapping.name}`;

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
 * @param {string} name optional connector name to import
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportMappings(
  name?: string
): Promise<boolean> {
  try {
    if (name) {
      const jsonFilePath = getFilePath(`sync/mappings/${name}/${name}.json`);
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
      await importConfigEntities(importMappingData);
    }
    return true;
  } catch (error) {
    printError(error, `Error importing mappings from files`);
  }
  return false;
}
